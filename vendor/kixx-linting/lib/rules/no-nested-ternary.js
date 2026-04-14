/**
 * no-nested-ternary — disallow nested ternary expressions.
 * Adapted from ESLint's no-nested-ternary rule.
 */

const noNestedTernaryRule = {
    meta: {
        type: "suggestion",
        schema: [],
    },

    create(context) {
        return {
            ConditionalExpression(node) {
                if (
                    node.parent.type === "ConditionalExpression"
                ) {
                    context.report({
                        node,
                        message: "Do not nest ternary expressions.",
                    });
                }
            },
        };
    },
};

export default noNestedTernaryRule;
