/**
 * no-caller — disallow the use of `arguments.caller` or `arguments.callee`.
 * Adapted from ESLint's no-caller rule.
 */

const noCallerRule = {
    meta: {
        type: "suggestion",
        schema: [],
    },

    create(context) {
        return {
            MemberExpression(node) {
                if (
                    node.object.type === "Identifier" &&
                    node.object.name === "arguments" &&
                    !node.computed &&
                    node.property.type === "Identifier" &&
                    (node.property.name === "caller" || node.property.name === "callee")
                ) {
                    context.report({
                        node,
                        message: `'${node.property.name}' is deprecated and not allowed.`,
                    });
                }
            },
        };
    },
};

export default noCallerRule;
