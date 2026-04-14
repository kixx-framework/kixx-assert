/**
 * Shared regular-expression analysis helpers for rule modules.
 *
 * These helpers use the vendored `regexpp` parser so rules can inspect regex
 * literals and constructor arguments without reimplementing parsing logic.
 * @module
 */

import { RegExpParser, visitRegExpAST } from "../vendor/regexpp/index.js";

const regexParser = new RegExpParser();

/**
 * Extracts the pattern and flags from a regex literal node.
 * @param {ASTNode} node Node to inspect.
 * @returns {{ pattern: string, flags: string } | null} The literal pattern and flags, or `null`.
 */
export function parseRegexLiteral(node) {
    if (node.type === "Literal" && node.regex) {
        return { pattern: node.regex.pattern, flags: node.regex.flags };
    }
    return null;
}

/**
 * Extracts the pattern and flags from a `RegExp` constructor or call.
 * @param {ASTNode} node Call or constructor expression to inspect.
 * @returns {{ pattern: string, flags: string } | null} The parsed regex parts, or `null`.
 */
export function parseRegExpConstructorArgs(node) {
    if (
        (node.type === "CallExpression" || node.type === "NewExpression") &&
        node.callee.type === "Identifier" &&
        node.callee.name === "RegExp" &&
        node.arguments.length >= 1
    ) {
        const patternArg = node.arguments[0];
        if (patternArg.type !== "Literal" || typeof patternArg.value !== "string") {
            return null;
        }
        const pattern = patternArg.value;
        let flags = "";
        if (node.arguments.length >= 2) {
            const flagsArg = node.arguments[1];
            if (flagsArg.type !== "Literal" || typeof flagsArg.value !== "string") {
                return null;
            }
            flags = flagsArg.value;
        }
        return { pattern, flags };
    }
    return null;
}

/**
 * Safely parses a regex pattern with `regexpp`.
 * @param {string} pattern Regex pattern source.
 * @param {string} flags Regex flags.
 * @returns {import('../vendor/regexpp/index.js').AST.Pattern | null} Parsed pattern AST, or `null` on failure.
 */
function parsePattern(pattern, flags) {
    try {
        return regexParser.parsePattern(pattern, 0, pattern.length, {
            unicode: flags.includes("u"),
            unicodeSets: flags.includes("v"),
        });
    } catch {
        return null;
    }
}

/**
 * Finds control characters in a regex pattern.
 * @param {string} pattern Regex pattern source.
 * @param {string} flags Regex flags.
 * @returns {string[]} Hex escape strings for matched control characters.
 */
export function getControlCharacters(pattern, flags) {
    const ast = parsePattern(pattern, flags);
    if (!ast) return [];

    const controlChars = [];
    visitRegExpAST(ast, {
        onCharacterEnter(charNode) {
            const cp = charNode.value;
            const raw = charNode.raw;
            const isEscapedControlCharacter =
                typeof raw === "string" &&
                (raw.startsWith("\\x") || raw.startsWith("\\u"));
            const isRawControlCharacter =
                typeof raw === "string" &&
                raw.codePointAt(0) === cp;

            if (cp >= 0x00 && cp <= 0x1f && (isRawControlCharacter || isEscapedControlCharacter)) {
                controlChars.push(`\\x${`0${cp.toString(16)}`.slice(-2)}`);
            }
        },
    });
    return controlChars;
}

/**
 * Checks whether a regex pattern contains an empty character class.
 * @param {string} pattern Regex pattern source.
 * @param {string} flags Regex flags.
 * @returns {boolean} `true` when the pattern contains `[]`.
 */
export function hasEmptyCharacterClass(pattern, flags) {
    const ast = parsePattern(pattern, flags);
    if (!ast) return false;

    let found = false;
    visitRegExpAST(ast, {
        onCharacterClassEnter(ccNode) {
            if (!ccNode.negate && ccNode.elements.length === 0) {
                found = true;
            }
        },
    });
    return found;
}

/**
 * Finds the first run of redundant spaces outside character classes.
 * @param {string} pattern Regex pattern source.
 * @param {string} flags Regex flags.
 * @returns {Array<{ index: number, length: number }>} Match spans for the first redundant space run.
 */
export function findRedundantSpaces(pattern, flags) {
    const ast = parsePattern(pattern, flags);
    if (!ast) return [];

    const characterClassRanges = [];
    visitRegExpAST(ast, {
        onCharacterClassEnter(ccNode) {
            characterClassRanges.push({ start: ccNode.start, end: ccNode.end });
        },
    });

    function isInsideCharClass(index) {
        return characterClassRanges.some(({ start, end }) => index >= start && index < end);
    }

    const results = [];
    const spacesPattern = /( {2,})(?: [+*{?]|[^+*{?]|$)/gu;
    let match;

    while ((match = spacesPattern.exec(pattern)) !== null) {
        const { index } = match;
        const length = match[1].length;
        if (!isInsideCharClass(index)) {
            results.push({ index, length });
            break; // Only report first occurrence (consistent with ESLint)
        }
    }
    return results;
}

/**
 * Checks whether a character class contains multi-character sequences that can be misread as single characters.
 * @param {string} pattern Regex pattern source.
 * @param {string} flags Regex flags.
 * @param {Object} [options={}] Detection options.
 * @param {boolean} [options.allowEscape=false] Whether escaped code points are ignored.
 * @returns {boolean} `true` when the character class is misleading.
 */
export function hasMisleadingCharacterClass(pattern, flags, { allowEscape = false } = {}) {
    const isUnicodeEscapeRaw = (raw) =>
        typeof raw === "string" &&
        (/^\\(?:u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2})$/u).test(raw);

    const ast = parsePattern(pattern, flags);
    if (!ast) return false;

    let found = false;

    visitRegExpAST(ast, {
        onCharacterClassEnter(ccNode) {
            if (found) return;

            // Collect characters in order
            const chars = [];
            function collectChars(node) {
                if (node.type === "Character") {
                    chars.push({
                        value: node.value,
                        escaped: typeof node.raw === "string" && node.raw.startsWith("\\"),
                        unicodeEscape: isUnicodeEscapeRaw(node.raw),
                    });
                } else if (node.type === "CharacterClassRange") {
                    chars.push({
                        value: node.min.value,
                        escaped: typeof node.min.raw === "string" && node.min.raw.startsWith("\\"),
                        unicodeEscape: isUnicodeEscapeRaw(node.min.raw),
                    });
                    chars.push(null);
                    chars.push({
                        value: node.max.value,
                        escaped: typeof node.max.raw === "string" && node.max.raw.startsWith("\\"),
                        unicodeEscape: isUnicodeEscapeRaw(node.max.raw),
                    });
                } else if (node.type === "CharacterClass" || node.type === "ClassIntersection" || node.type === "ClassSubtraction") {
                    if (node.elements) node.elements.forEach(collectChars);
                } else {
                    // Preserve element boundaries for constructs like \q{...} in /v mode.
                    chars.push(null);
                }
            }
            if (ccNode.elements) ccNode.elements.forEach(collectChars);

            // Check for surrogate-pair sequences represented as separate characters.
            // Correctly-formed unicode escapes collapse into a single character node.
            let i = 0;
            while (i < chars.length - 1) {
                const high = chars[i];
                const low = chars[i + 1];
                i += 1;

                if (high === null || low === null) {
                    continue;
                }
                if (high.value >= 0xD800 && high.value <= 0xDBFF && low.value >= 0xDC00 && low.value <= 0xDFFF) {
                    if (allowEscape && (high.unicodeEscape || low.unicodeEscape)) {
                        continue;
                    }
                    found = true;
                    return;
                }
            }

            // Check for emoji modifier sequences (base char + modifier)
            i = 0;
            while (i < chars.length - 1) {
                const cp = chars[i];
                const next = chars[i + 1];
                i += 1;

                if (cp === null || next === null) {
                    continue;
                }
                // Emoji modifiers: U+1F3FB-U+1F3FF
                if (next.value >= 0x1F3FB && next.value <= 0x1F3FF) {
                    if (allowEscape && next.unicodeEscape) {
                        continue;
                    }
                    found = true;
                    return;
                }
                // Combining characters: U+0300-U+036F, U+1DC0-U+1DFF, U+20D0-U+20FF, U+FE20-U+FE2F
                if (
                    (next.value >= 0x0300 && next.value <= 0x036F) ||
                    (next.value >= 0x1DC0 && next.value <= 0x1DFF) ||
                    (next.value >= 0x20D0 && next.value <= 0x20FF) ||
                    (next.value >= 0xFE00 && next.value <= 0xFE0F) ||
                    (next.value >= 0xFE20 && next.value <= 0xFE2F)
                ) {
                    if (allowEscape && next.unicodeEscape) {
                        continue;
                    }
                    found = true;
                    return;
                }
            }

            // Check for regional indicator sequences (U+1F1E0-U+1F1FF pairs)
            i = 0;
            while (i < chars.length - 1) {
                const left = chars[i];
                const right = chars[i + 1];
                i += 1;

                if (left === null || right === null) {
                    continue;
                }

                if (left.value >= 0x1F1E0 && left.value <= 0x1F1FF &&
                    right.value >= 0x1F1E0 && right.value <= 0x1F1FF) {
                    if (allowEscape && (left.unicodeEscape || right.unicodeEscape)) {
                        continue;
                    }
                    found = true;
                    return;
                }
            }

            // Check for ZWJ sequences (U+200D)
            i = 0;
            while (i < chars.length) {
                const current = chars[i];
                i += 1;

                if (current === null || current.value !== 0x200D) {
                    continue;
                }

                const currentIndex = i - 1;
                const hasPrev = currentIndex > 0 && chars[currentIndex - 1] !== null;
                const hasNext = currentIndex < chars.length - 1 && chars[currentIndex + 1] !== null;

                if (hasPrev || hasNext) {
                    if (allowEscape && current.unicodeEscape) {
                        continue;
                    }
                    found = true;
                    return;
                }
            }
        },
    });

    return found;
}
