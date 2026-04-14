/**
 * no-compare-neg-zero — disallow comparing against `-0`.
 * Adapted from ESLint's no-compare-neg-zero rule.
 */

const OPERATORS = new Set([">", ">=", "<", "<=", "==", "===", "!=", "!=="]);

function isNegZero(node) {
    return (
        node.type === "UnaryExpression" &&
        node.operator === "-" &&
        node.argument.type === "Literal" &&
        node.argument.value === 0
    );
}

const noCompareNegZeroRule = {
    meta: {
        type: "problem",
        schema: [],
    },

    create(context) {
        return {
            BinaryExpression(node) {
                if (OPERATORS.has(node.operator)) {
                    if (isNegZero(node.left) || isNegZero(node.right)) {
                        context.report({
                            node,
                            message: `Do not use the '${node.operator}' operator to compare against -0.`,
                        });
                    }
                }
            },
        };
    },
};

export default noCompareNegZeroRule;
