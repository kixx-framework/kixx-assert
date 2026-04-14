/**
 * no-async-promise-executor — disallow using an async function as a Promise executor.
 * Adapted from ESLint's no-async-promise-executor rule.
 */

const noAsyncPromiseExecutorRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        return {
            NewExpression(node) {
                if (
                    node.callee.type === "Identifier" &&
                    node.callee.name === "Promise" &&
                    node.arguments.length > 0
                ) {
                    const executor = node.arguments[0];
                    if (
                        (executor.type === "FunctionExpression" || executor.type === "ArrowFunctionExpression") &&
                        executor.async
                    ) {
                        context.report({
                            node: executor,
                            message: "Promise executor functions should not be async.",
                        });
                    }
                }
            },
        };
    },
};

export default noAsyncPromiseExecutorRule;
