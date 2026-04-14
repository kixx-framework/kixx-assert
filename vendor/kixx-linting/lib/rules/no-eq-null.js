/**
 * no-eq-null — disallow null comparisons without type-checking operators.
 * Adapted from ESLint's no-eq-null rule.
 */

function isNullLiteral(node) {
    return node.type === "Literal" && node.value === null;
}

const noEqNullRule = {
    meta: {
        type: "suggestion",
        schema: [],
    },

    create(context) {
        return {
            BinaryExpression(node) {
                if (
                    (node.operator === "==" || node.operator === "!=") &&
                    (isNullLiteral(node.left) || isNullLiteral(node.right))
                ) {
                    context.report({
                        node,
                        message: "Use '===' to compare with null.",
                    });
                }
            },
        };
    },
};

export default noEqNullRule;
