/**
 * @module parser
 * @description
 * Wraps the acorn parser and normalizes its output to ESLint-compatible format.
 * Handles token normalization (acorn type objects → string type names) and
 * error reporting in a consistent format.
 */

import { parse as parseWithAcorn } from "./vendor/acorn/index.js";

/**
 * Normalizes an acorn token to ESLint-style format.
 *
 * Acorn tokens use an object-based type system with properties like `label` and `keyword`.
 * ESLint expects tokens with string type names (e.g., 'Keyword', 'Identifier', 'Punctuator').
 * This function converts acorn's format to ESLint's expected format.
 *
 * @private
 * @param {Object} token - Acorn token with type object, value, start, end, loc
 * @returns {Object|null} ESLint-compatible token object, or null to skip (EOF tokens)
 */
function normalizeToken(token) {
    const typeLabel = token.type?.label ?? "";
    // acorn sets keyword to the keyword string (e.g. "typeof"), not boolean true
    const isKeyword = Boolean(token.type?.keyword);

    let typeName;
    if (isKeyword) {
        typeName = "Keyword";
    } else if (typeLabel === "name") {
        typeName = "Identifier";
    } else if (typeLabel === "num") {
        typeName = "Numeric";
    } else if (typeLabel === "string") {
        typeName = "String";
    } else if (typeLabel === "regexp") {
        typeName = "RegularExpression";
    } else if (typeLabel === "template" || typeLabel === "`") {
        typeName = "Template";
    } else if (typeLabel === "eof") {
        return null; // Skip EOF token
    } else {
        typeName = "Punctuator";
    }

    return {
        type: typeName,
        value: token.value ?? typeLabel,
        start: token.start,
        end: token.end,
        range: [token.start, token.end],
        loc: token.loc,
    };
}

/**
 * Parses source code into an ESTree AST using acorn.
 *
 * Returns a result object with either { ok: true, ast, comments, tokens } on success
 * or { ok: false, errors } on failure. Normalizes acorn's token format to ESLint's
 * expected format and handles parse errors gracefully.
 *
 * @param {string} sourceText - The source code to parse
 * @param {Object} [options={}] - Parser configuration
 * @param {number} [options.ecmaVersion=2024] - Target ECMAScript version
 * @param {string} [options.sourceType='script'] - Source type ('script' or 'module')
 * @param {boolean} [options.allowReturnOutsideFunction=false] - Allow return outside functions
 * @returns {Object} Result object with either:
 *   - {ok: true, ast, comments, tokens} on success
 *   - {ok: false, errors} on parse failure
 */
export function parse(sourceText, options = {}) {
    const comments = [];
    const rawTokens = [];
    const ecmaVersion = options.ecmaVersion ?? 2024;
    const sourceType = options.sourceType ?? "script";
    const allowReturnOutsideFunction = options.allowReturnOutsideFunction ?? false;

    try {
        const ast = parseWithAcorn(sourceText, {
            ecmaVersion,
            sourceType,
            allowReturnOutsideFunction,
            locations: true,
            ranges: true,
            onComment: comments,
            onToken: rawTokens,
        });

        // Normalize tokens from acorn format to ESLint-compatible format
        const tokens = rawTokens
            .map(normalizeToken)
            .filter(t => t !== null);

        return {
            ok: true,
            ast,
            comments,
            tokens,
        };
    } catch (error) {
        return {
            ok: false,
            errors: [
                {
                    message: error.message,
                    line: error.lineNumber ?? error.loc?.line ?? 1,
                    column: error.column ?? error.loc?.column ?? 0,
                },
            ],
        };
    }
}

export default parse;
