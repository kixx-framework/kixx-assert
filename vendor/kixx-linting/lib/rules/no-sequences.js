/**
 * no-sequences — disallow comma operators.
 * Adapted from ESLint's no-sequences rule.
 */

const noSequencesRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    allowInParentheses: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const allowInParentheses = context.options[0]?.allowInParentheses ?? true;
        const sourceCode = context.sourceCode;

        function isForInitOrUpdate(node) {
            return (
                node.parent &&
                node.parent.type === "ForStatement" &&
                (node.parent.init === node || node.parent.update === node)
            );
        }

        function requiresExtraParens(node) {
            const parent = node.parent;
            if (!parent) {
                return false;
            }

            if (parent.type === "ForStatement") {
                return false;
            }

            if (parent.type === "ArrowFunctionExpression") {
                return parent.body === node;
            }

            return (
                parent.type === "ExpressionStatement" ||
                parent.type === "IfStatement" ||
                parent.type === "WhileStatement" ||
                parent.type === "DoWhileStatement" ||
                parent.type === "SwitchStatement" ||
                parent.type === "WithStatement" ||
                parent.type === "SequenceExpression"
            );
        }

        function isParenthesised(node, skip = 0) {
            const prevToken = sourceCode.getTokenBefore(node, { skip });
            const nextToken = sourceCode.getTokenAfter(node, { skip });
            return (
                prevToken && nextToken &&
                prevToken.value === "(" &&
                prevToken.range[1] <= node.range[0] &&
                nextToken.value === ")" &&
                nextToken.range[0] >= node.range[1]
            );
        }

        return {
            SequenceExpression(node) {
                if (isForInitOrUpdate(node)) {
                    return;
                }

                if (allowInParentheses) {
                    const skip = requiresExtraParens(node) ? 1 : 0;
                    if (isParenthesised(node, skip)) {
                        return;
                    }
                }

                context.report({
                    node,
                    loc: sourceCode.getFirstTokenBetween(
                        node.expressions[0],
                        node.expressions[1],
                        token => token.value === ",",
                    )?.loc ?? node.loc,
                    message: "Unexpected use of comma operator.",
                });
            },
        };
    },
};

export default noSequencesRule;
