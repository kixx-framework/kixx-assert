/**
 * no-misleading-character-class — disallow characters which are made with multiple code points in character class syntax.
 * Adapted from ESLint's no-misleading-character-class rule.
 */

import { hasMisleadingCharacterClass } from "./regex-helpers.js";

const noMisleadingCharacterClassRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        const allowEscape = context.options[0]?.allowEscape ?? false;

        function isRegExpBuiltinEnabled() {
            const globals = context.languageOptions?.globals;

            if (!globals || !Object.hasOwn(globals, "RegExp")) {
                return true;
            }

            const value = globals.RegExp;
            return value !== "off" && value !== false;
        }

        function checkPattern(node, pattern, flags) {
            if (hasMisleadingCharacterClass(pattern, flags, { allowEscape })) {
                context.report({
                    node,
                    message: "Unexpected surrogate pair in character class. Use the 'u' flag.",
                });
            }
        }

        function getStaticString(node) {
            if (!node) {
                return null;
            }

            if (node.type === "Literal" && typeof node.value === "string") {
                return { value: node.value, raw: node.raw, fromIdentifier: false };
            }

            if (node.type === "Literal" && node.regex) {
                return {
                    value: node.regex.pattern,
                    raw: node.regex.pattern,
                    regexFlags: node.regex.flags,
                    fromIdentifier: false,
                };
            }

            if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
                return {
                    value: node.quasis.map(quasi => quasi.value.cooked ?? "").join(""),
                    raw: node.quasis.map(quasi => quasi.value.raw ?? "").join(""),
                    fromIdentifier: false,
                };
            }

            if (node.type === "TemplateLiteral") {
                let value = "";
                let raw = "";

                for (let i = 0; i < node.quasis.length; i += 1) {
                    value += node.quasis[i].value.cooked ?? "";
                    raw += node.quasis[i].value.raw ?? "";

                    if (i < node.expressions.length) {
                        const expression = node.expressions[i];
                        if (expression.type !== "Literal") {
                            return null;
                        }
                        value += String(expression.value);
                        raw += String(expression.raw ?? expression.value ?? "");
                    }
                }

                return { value, raw, fromIdentifier: false };
            }

            return null;
        }

        function resolveConstIdentifierString(identifierNode) {
            if (!identifierNode || identifierNode.type !== "Identifier") {
                return null;
            }

            let scope = context.sourceCode.getScope(identifierNode);

            while (scope) {
                const variable = scope.variables.find(candidate =>
                    candidate.name === identifierNode.name &&
                    candidate.defs.length > 0,
                );

                if (variable) {
                    if (variable.defs.length !== 1) {
                        return null;
                    }

                    const def = variable.defs[0];
                    if (def.type !== "Variable" || def.parent?.kind !== "const") {
                        return null;
                    }

                    const resolved = getStaticString(def.node.init);
                    if (!resolved) {
                        return null;
                    }

                    return { ...resolved, fromIdentifier: true };
                }

                scope = scope.upper;
            }

            return null;
        }

        function getResolvableString(node) {
            return getStaticString(node) ?? resolveConstIdentifierString(node);
        }

        function hasEscapedUnicodeInCharacterClass(rawPattern) {
            if (typeof rawPattern !== "string") {
                return false;
            }

            const hasEscapedUnicode = /\\u\{[0-9a-fA-F]+\}|\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}/u.test(rawPattern);
            return hasEscapedUnicode && rawPattern.includes("[") && rawPattern.includes("]");
        }

        function checkRegExpConstructor(node) {
            const isIdentifierRegExp = node.callee.type === "Identifier" && node.callee.name === "RegExp";
            const isGlobalThisRegExp = (
                node.callee.type === "MemberExpression" &&
                node.callee.object.type === "Identifier" &&
                node.callee.object.name === "globalThis" &&
                (
                    (!node.callee.computed && node.callee.property.type === "Identifier" && node.callee.property.name === "RegExp") ||
                    (node.callee.computed && node.callee.property.type === "Literal" && node.callee.property.value === "RegExp")
                )
            );

            if (!isIdentifierRegExp && !isGlobalThisRegExp) {
                return;
            }

            if (isIdentifierRegExp && !isRegExpBuiltinEnabled()) {
                return;
            }

            const patternInfo = getResolvableString(node.arguments[0]);
            if (!patternInfo) {
                return;
            }

            const flagsInfo = getResolvableString(node.arguments[1]);
            if (node.arguments[1] && !flagsInfo) {
                return;
            }

            // In constructor calls, JavaScript string parsing erases escape intent in `value`.
            // Preserve ESLint-compatible behavior for allowEscape by skipping when the raw
            // pattern text clearly used unicode/hex escapes within a character class.
            if (
                allowEscape &&
                !patternInfo.fromIdentifier &&
                hasEscapedUnicodeInCharacterClass(patternInfo.raw)
            ) {
                return;
            }

            const effectiveFlags = flagsInfo?.value ?? patternInfo.regexFlags ?? "";
            checkPattern(node.arguments[0], patternInfo.value, effectiveFlags);
        }

        return {
            Literal(node) {
                if (!node.regex) return;

                const parent = node.parent;
                if (
                    parent &&
                    (parent.type === "CallExpression" || parent.type === "NewExpression") &&
                    parent.arguments[0] === node
                ) {
                    const callee = parent.callee;
                    const isRegExpIdentifier = callee.type === "Identifier" && callee.name === "RegExp";
                    const isGlobalThisRegExp = (
                        callee.type === "MemberExpression" &&
                        callee.object.type === "Identifier" &&
                        callee.object.name === "globalThis" &&
                        (
                            (!callee.computed && callee.property.type === "Identifier" && callee.property.name === "RegExp") ||
                            (callee.computed && callee.property.type === "Literal" && callee.property.value === "RegExp")
                        )
                    );

                    if (
                        isGlobalThisRegExp ||
                        (isRegExpIdentifier && isRegExpBuiltinEnabled())
                    ) {
                        return;
                    }
                }

                const { pattern, flags } = node.regex;
                checkPattern(node, pattern, flags);
            },
            CallExpression(node) {
                checkRegExpConstructor(node);
            },
            NewExpression(node) {
                checkRegExpConstructor(node);
            },
        };
    },
};

export default noMisleadingCharacterClassRule;
