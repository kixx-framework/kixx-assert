/**
 * Reports variables that are read but never assigned a value.
 */

const noUnassignedVarsRule = {
    meta: {
        type: "problem",
    },

    create(context) {
        const sourceCode = context.sourceCode;

        return {
            VariableDeclarator(node) {
                const declaration = node.parent;
                const shouldSkip =
                    node.init ||
                    node.id.type !== "Identifier" ||
                    declaration.kind === "const";

                if (shouldSkip) {
                    return;
                }

                const [variable] = sourceCode.getDeclaredVariables(node);
                if (!variable) {
                    return;
                }

                let hasRead = false;

                for (const reference of variable.references) {
                    if (reference.isWrite()) {
                        return;
                    }

                    if (reference.isRead()) {
                        hasRead = true;
                    }
                }

                if (!hasRead) {
                    return;
                }

                context.report({
                    node,
                    message: "'{{name}}' is always 'undefined' because it's never assigned.",
                    data: { name: node.id.name },
                });
            },
        };
    },
};

export default noUnassignedVarsRule;
