/**
 * Programmatic linting entry point for JavaScript source text.
 * @module linter
 */

import { parse } from "./parser.js";
import { analyze } from "./eslint-scope/index.js";
import { SourceCode } from "./source-code.js";
import { runRules } from "./rule-runner.js";
import VISITOR_KEYS from "./visitor-keys.js";
import registry from "./rules/index.js";

/**
 * Source text and optional display name for a lint target.
 * @typedef {Object} LintSourceFile
 * @property {string} text - JavaScript source text to lint.
 * @property {string} [name="<input>"] - File path or label used in the lint result.
 */

/**
 * Rule configuration map keyed by rule ID.
 * @typedef {Object<string, string|number|Array>} RuleConfigMap
 */

/**
 * Parser and scope options applied to one lint run.
 * @typedef {Object} LintLanguageOptions
 * @property {string|number} [ecmaVersion="2024"] - ECMAScript version passed to the parser and scope analyzer.
 * @property {string} [sourceType="module"] - Source type passed to the parser and scope analyzer.
 * @property {Object<string, string|boolean>} [globals] - Global variables available to scope-aware rules.
 * @property {Object} [parserOptions] - Parser compatibility options.
 * @property {Object} [parserOptions.ecmaFeatures] - Parser feature flags.
 * @property {boolean} [parserOptions.ecmaFeatures.globalReturn=false] - Allow return statements outside functions.
 */

/**
 * Lint diagnostic emitted by a parser error or rule violation.
 * @typedef {Object} LintMessage
 * @property {string|null} ruleId - Rule ID, or `null` for parse errors.
 * @property {number} severity - Numeric severity: 1 for warning, 2 for error.
 * @property {string} message - Human-readable diagnostic text.
 * @property {number} line - 1-based line number.
 * @property {number} column - 0-based column number.
 */

/**
 * Complete result for a single lint target.
 * @typedef {Object} LintResult
 * @property {string} filePath - Source file name or `<input>` when no name was provided.
 * @property {LintMessage[]} messages - Diagnostics that were not suppressed by inline disable directives.
 * @property {number} errorCount - Number of diagnostics with severity 2.
 * @property {number} warningCount - Number of diagnostics with severity 1.
 */

/**
 * Lints JavaScript source text with the built-in rule registry.
 *
 * Syntax errors are returned as fatal diagnostics with `ruleId: null`; they are
 * not thrown and they are not suppressed by inline disable comments. Rule
 * violations honor the supported `eslint-disable` directive subset.
 *
 * @param {LintSourceFile} sourceFile - Source text and optional file name.
 * @param {RuleConfigMap} rules - Rule configuration map keyed by rule ID.
 * @param {LintLanguageOptions} [languageOptions] - Parser, scope, and rule language options.
 * @returns {LintResult} Lint result for the supplied source file.
 * @throws {Error} When a configured rule is unknown or has an invalid severity.
 */
export function lintText(sourceFile, rules, languageOptions) {
    languageOptions = languageOptions || {};

    const fileName = sourceFile.name ?? "<input>";
    const sourceText = sourceFile.text;

    const ecmaVersion = languageOptions.ecmaVersion ?? "2024";
    const sourceType = languageOptions.sourceType ?? "module";
    const globals = languageOptions.globals ?? {};
    const allowReturnOutsideFunction = languageOptions.parserOptions?.ecmaFeatures?.globalReturn === true;

    const parseResult = parse(sourceText, {
        ecmaVersion,
        sourceType,
        allowReturnOutsideFunction,
    });

    if (!parseResult.ok) {
        const messages = parseResult.errors.map(err => ({
            ruleId: null,
            severity: 2,
            message: err.message,
            line: err.line,
            column: err.column,
        }));
        return {
            filePath: fileName,
            messages,
            errorCount: messages.length,
            warningCount: 0,
        };
    }

    const { ast, tokens, comments } = parseResult;

    const scopeManager = analyze(ast, {
        ecmaVersion,
        sourceType,
        globals: filterDisabledGlobals(globals),
    });

    // Process /*global*/ block comments: inject names into scope and mark them
    // with eslintExplicitGlobalComments so no-unused-vars can report them when unused.
    const commentGlobals = parseBlockCommentGlobalNames(comments);
    if (commentGlobals.length > 0) {
        scopeManager.addGlobals(commentGlobals.map(g => g.name));
        const globalScope = scopeManager.globalScope;
        for (const { name, comment } of commentGlobals) {
            const variable = globalScope.set.get(name);
            if (variable) {
                if (!variable.eslintExplicitGlobalComments) {
                    variable.eslintExplicitGlobalComments = [];
                }
                variable.eslintExplicitGlobalComments.push(comment);
            }
        }
    }

    const sourceCode = new SourceCode({
        text: sourceText,
        ast,
        tokens,
        comments,
        scopeManager,
        visitorKeys: VISITOR_KEYS,
    });

    // Unknown inline rule IDs are skipped to match ESLint's lenient inline-config behavior.
    const inlineRules = parseInlineEslintRules(comments);
    let mergedRules = rules;
    if (inlineRules.size > 0) {
        const knownInline = {};
        for (const [id, config] of inlineRules) {
            if (registry.has(id)) {
                knownInline[id] = config;
            }
        }
        if (Object.keys(knownInline).length > 0) {
            mergedRules = Object.assign({}, rules, knownInline);
        }
    }

    const messages = runRules(sourceCode, mergedRules, registry, languageOptions);
    const disableDirectives = sourceCode.getDisableDirectives();
    const filteredMessages = messages.filter(message => !disableDirectives.isSuppressed(message));

    let errorCount = 0;
    let warningCount = 0;
    for (const msg of filteredMessages) {
        if (msg.severity === 2) errorCount += 1;
        else if (msg.severity === 1) warningCount += 1;
    }

    return {
        filePath: fileName,
        messages: filteredMessages,
        errorCount,
        warningCount,
    };
}

// Parse block comments of the form: /* global name1, name2 */
// Returns [{ name, comment }] for each declared global name.
function parseBlockCommentGlobalNames(comments) {
    const result = [];

    for (const comment of comments) {
        if (comment.type !== "Block") {
            continue;
        }

        const match = /^\s*globals?\s+([\s\S]*)$/iu.exec(comment.value);
        if (!match) {
            continue;
        }

        const declarationPattern = /([^\s,:]+)(?::\s*([^\s,]+))?/gu;
        let declarationMatch;

        while ((declarationMatch = declarationPattern.exec(match[1])) !== null) {
            const value = declarationMatch[2]?.trim().toLowerCase() ?? "readonly";
            if (value !== "off") {
                result.push({ name: declarationMatch[1], comment });
            }
        }
    }

    return result;
}

// Parse inline /*eslint rule-name:N*/ comments and return a Map of rule ID to config.
// Only includes rules that are registered; unknown rules are silently skipped.
function parseInlineEslintRules(comments) {
    const result = new Map();

    for (const comment of comments) {
        if (comment.type !== "Block") {
            continue;
        }

        const match = /^\s*eslint\s+([\s\S]+)$/iu.exec(comment.value);
        if (!match) {
            continue;
        }

        // Parse entries like: rule-name:N or rule-name:[N,opts]
        // The content may have multiple comma-separated entries.
        const content = match[1].trim();
        const entryPattern = /([\w/\-@.]+)\s*:\s*(\[[\s\S]*?\]|\d+)/gu;
        let entryMatch;

        while ((entryMatch = entryPattern.exec(content)) !== null) {
            const ruleId = entryMatch[1];
            const severityRaw = entryMatch[2].trim();
            let config;

            if (severityRaw.startsWith("[")) {
                try {
                    config = JSON.parse(severityRaw);
                } catch {
                    continue;
                }
            } else {
                config = parseInt(severityRaw, 10);
                if (isNaN(config)) {
                    continue;
                }
            }

            result.set(ruleId, config);
        }
    }

    return result;
}

function filterDisabledGlobals(globals) {
    const enabledGlobals = {};

    for (const [name, value] of Object.entries(globals)) {
        if (value === "off") {
            continue;
        }

        enabledGlobals[name] = value;
    }

    return enabledGlobals;
}
