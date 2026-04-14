/**
 * no-multi-assign — disallow chained assignment expressions.
 * Adapted from ESLint's no-multi-assign rule.
 */

const noMultiAssignRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    ignoreNonDeclaration: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const ignoreNonDeclaration = context.options[0]?.ignoreNonDeclaration ?? false;

        return {
            AssignmentExpression(node) {
                const parentType = node.parent?.type;
                const isClassFieldInitializer = (
                    (parentType === "PropertyDefinition" || parentType === "FieldDefinition") &&
                    node.parent.value === node
                );
                const isDeclarationInitializer = parentType === "VariableDeclarator" || isClassFieldInitializer;
                const startsAssignmentChain = node.right.type === "AssignmentExpression" && parentType !== "AssignmentExpression";

                if (!isDeclarationInitializer && !startsAssignmentChain) {
                    return;
                }

                if (ignoreNonDeclaration && !isDeclarationInitializer) {
                    return;
                }

                context.report({
                    node,
                    message: "Unexpected chained assignment.",
                });
            },
        };
    },
};

export default noMultiAssignRule;
