/**
 * no-control-regex — disallow control characters in regular expressions.
 * Adapted from ESLint's no-control-regex rule.
 */

import { getControlCharacters } from "./regex-helpers.js";

function getRegExpFromConstructor(node) {
    if (node.type !== "CallExpression" && node.type !== "NewExpression") return null;
    const callee = node.callee;
    if (callee.type !== "Identifier" || callee.name !== "RegExp") return null;
    const [patternArg, flagsArg] = node.arguments;
    if (!patternArg) return null;
    if (patternArg.type !== "Literal" || typeof patternArg.value !== "string") return null;
    const flags = (flagsArg && flagsArg.type === "Literal" && typeof flagsArg.value === "string") ? flagsArg.value : "";
    return { pattern: patternArg.value, flags };
}

const noControlRegexRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        function check(node, pattern, flags) {
            const controls = getControlCharacters(pattern, flags);
            if (controls.length > 0) {
                context.report({
                    node,
                    message: `Unexpected control character(s) in regular expression: ${controls.join(", ")}.`,
                });
            }
        }

        return {
            Literal(node) {
                if (!node.regex) return;
                check(node, node.regex.pattern, node.regex.flags);
            },
            CallExpression(node) {
                const re = getRegExpFromConstructor(node);
                if (re) check(node, re.pattern, re.flags);
            },
            NewExpression(node) {
                const re = getRegExpFromConstructor(node);
                if (re) check(node, re.pattern, re.flags);
            },
        };
    },
};

export default noControlRegexRule;
