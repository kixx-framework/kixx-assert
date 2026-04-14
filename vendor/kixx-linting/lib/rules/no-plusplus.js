/**
 * no-plusplus — disallow the unary operators `++` and `--`.
 * Adapted from ESLint's no-plusplus rule.
 */

const noPlusPlusRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    allowForLoopAfterthoughts: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const allowForLoopAfterthoughts = context.options[0]?.allowForLoopAfterthoughts ?? false;

        function isForLoopAfterthought(node) {
            let current = node;

            while (current.parent) {
                const parent = current.parent;

                if (parent.type === "ForStatement") {
                    return parent.update === current;
                }

                if (parent.type !== "SequenceExpression") {
                    return false;
                }

                current = parent;
            }

            return false;
        }

        return {
            UpdateExpression(node) {
                if (
                    allowForLoopAfterthoughts &&
                    isForLoopAfterthought(node)
                ) {
                    return;
                }
                context.report({
                    node,
                    message: `Unary operator '${node.operator}' used.`,
                });
            },
        };
    },
};

export default noPlusPlusRule;
