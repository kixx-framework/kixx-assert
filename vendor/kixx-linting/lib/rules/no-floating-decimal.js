/**
 * no-floating-decimal — disallow leading or trailing decimal points in numeric literals.
 * Adapted from ESLint's no-floating-decimal rule.
 */

const noFloatingDecimalRule = {
    meta: {
        type: "suggestion",
        schema: [],
    },

    create(context) {
        return {
            Literal(node) {
                if (typeof node.value === "number") {
                    if (node.raw.startsWith(".")) {
                        context.report({
                            node,
                            message: "A leading decimal point can be confused with a dot.",
                        });
                    } else if (node.raw.indexOf(".") === node.raw.length - 1) {
                        context.report({
                            node,
                            message: "A trailing decimal point can be confused with a dot.",
                        });
                    }
                }
            },
        };
    },
};

export default noFloatingDecimalRule;
