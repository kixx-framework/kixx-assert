/**
 * Reports `var` declarations and recommends `let` or `const`.
 */

const noVarRule = {
    meta: {
        type: "suggestion",
    },

    create(context) {
        return {
            VariableDeclaration(node) {
                if (node.kind !== "var") {
                    return;
                }

                context.report({
                    node,
                    message: "Unexpected var, use let or const instead.",
                });
            },
        };
    },
};

export default noVarRule;
