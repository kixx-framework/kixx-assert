/**
 * rest-spread-spacing — enforce spacing between rest/spread operators and their expressions.
 * Adapted from ESLint's rest-spread-spacing rule.
 */

const restSpreadSpacingRule = {
    meta: {
        type: "layout",
        schema: [{ enum: ["always", "never"] }],
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const alwaysSpace = context.options[0] === "always";

        function checkWhiteSpace(node) {
            const operator = sourceCode.getFirstToken(node);
            if (!operator) return;
            const nextToken = sourceCode.getTokenAfter(operator);
            if (!nextToken) return;

            const hasWhitespace = sourceCode.isSpaceBetween(operator, nextToken);

            let type;
            switch (node.type) {
                case "SpreadElement":
                    type = node.parent.type === "ObjectExpression" ? "spread property" : "spread";
                    break;
                case "RestElement":
                    type = node.parent.type === "ObjectPattern" ? "rest property" : "rest";
                    break;
                default:
                    return;
            }

            if (alwaysSpace && !hasWhitespace) {
                context.report({
                    node,
                    loc: operator.loc,
                    message: `Expected whitespace after ${type} operator.`,
                });
            } else if (!alwaysSpace && hasWhitespace) {
                context.report({
                    node,
                    loc: {
                        start: operator.loc.end,
                        end: nextToken.loc.start,
                    },
                    message: `Unexpected whitespace after ${type} operator.`,
                });
            }
        }

        return {
            SpreadElement: checkWhiteSpace,
            RestElement: checkWhiteSpace,
        };
    },
};

export default restSpreadSpacingRule;
