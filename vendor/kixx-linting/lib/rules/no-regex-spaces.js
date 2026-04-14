/**
 * no-regex-spaces — disallow multiple spaces in regular expressions.
 * Adapted from ESLint's no-regex-spaces rule.
 */

import { isEnabledGlobalReference } from "./utils.js";
import { findRedundantSpaces, parseRegExpConstructorArgs } from "./regex-helpers.js";

const noRegexSpacesRule = {
    meta: { type: "suggestion", schema: [] },
    create(context) {
        function reportFirstRedundantSpace(node, pattern, flags) {
            const spaces = findRedundantSpaces(pattern, flags);
            if (spaces.length === 0) {
                return;
            }

            const { length } = spaces[0];
            context.report({
                node,
                message: `Spaces are hard to count. Use {${length}}.`,
            });
        }

        return {
            Literal(node) {
                if (!node.regex) {
                    return;
                }

                reportFirstRedundantSpace(node, node.regex.pattern, node.regex.flags);
            },
            CallExpression(node) {
                if (
                    node.callee.type !== "Identifier" ||
                    node.callee.name !== "RegExp" ||
                    !isEnabledGlobalReference(context, node.callee, "RegExp")
                ) {
                    return;
                }

                const parsed = parseRegExpConstructorArgs(node);
                if (!parsed) {
                    return;
                }

                const patternArg = node.arguments[0];
                const rawContent = typeof patternArg.raw === "string"
                    ? patternArg.raw.slice(1, -1)
                    : "";

                if (!/ {2,}/u.test(rawContent)) {
                    return;
                }

                reportFirstRedundantSpace(node, parsed.pattern, parsed.flags);
            },
            NewExpression(node) {
                if (
                    node.callee.type !== "Identifier" ||
                    node.callee.name !== "RegExp" ||
                    !isEnabledGlobalReference(context, node.callee, "RegExp")
                ) {
                    return;
                }

                const parsed = parseRegExpConstructorArgs(node);
                if (!parsed) {
                    return;
                }

                const patternArg = node.arguments[0];
                const rawContent = typeof patternArg.raw === "string"
                    ? patternArg.raw.slice(1, -1)
                    : "";

                if (!/ {2,}/u.test(rawContent)) {
                    return;
                }

                reportFirstRedundantSpace(node, parsed.pattern, parsed.flags);
            },
        };
    },
};

export default noRegexSpacesRule;
