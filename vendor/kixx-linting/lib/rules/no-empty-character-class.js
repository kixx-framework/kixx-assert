/**
 * no-empty-character-class — disallow empty character classes in regular expressions.
 * Adapted from ESLint's no-empty-character-class rule.
 */

import { hasEmptyCharacterClass } from "./regex-helpers.js";

const noEmptyCharacterClassRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        return {
            Literal(node) {
                if (!node.regex) return;
                const { pattern, flags } = node.regex;
                if (hasEmptyCharacterClass(pattern, flags)) {
                    context.report({
                        node,
                        message: "Empty class.",
                    });
                }
            },
        };
    },
};

export default noEmptyCharacterClassRule;
