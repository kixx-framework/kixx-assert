/**
 * func-style — enforce the consistent use of either function declarations or expressions.
 * Adapted from ESLint's func-style rule.
 */

const funcStyleRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                enum: ["declaration", "expression"],
            },
            {
                type: "object",
                properties: {
                    allowArrowFunctions: { type: "boolean" },
                    allowTypeAnnotation: { type: "boolean" },
                    overrides: {
                        type: "object",
                        properties: {
                            namedExports: { enum: ["declaration", "expression", "ignore"] },
                        },
                        additionalProperties: false,
                    },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const style = context.options[0] ?? "expression";
        const allowArrowFunctions = context.options[1]?.allowArrowFunctions ?? false;
        const namedExportsOverride = context.options[1]?.overrides?.namedExports;

        function arrowFunctionUsesLexicalBindings(node) {
            let found = false;

            visit(node.body, node);
            return found;

            function visit(child, parent) {
                if (!child || found) {
                    return;
                }

                if (Array.isArray(child)) {
                    child.forEach(entry => visit(entry, parent));
                    return;
                }

                if (typeof child !== "object" || typeof child.type !== "string") {
                    return;
                }

                if (child.type === "ThisExpression" || child.type === "Super") {
                    found = true;
                    return;
                }

                if (
                    child.type === "MetaProperty" &&
                    child.meta?.type === "Identifier" &&
                    child.meta.name === "new" &&
                    child.property?.type === "Identifier" &&
                    child.property.name === "target"
                ) {
                    found = true;
                    return;
                }

                if (
                    child.type === "FunctionDeclaration" ||
                    child.type === "FunctionExpression" ||
                    child.type === "ArrowFunctionExpression"
                ) {
                    return;
                }

                for (const value of Object.values(child)) {
                    visit(value, child);
                }
            }
        }

        function getNamedExportOverride(node) {
            const parent = node.parent;

            if (parent?.type === "ExportDefaultDeclaration") {
                return "ignore";
            }

            if (parent?.type === "ExportNamedDeclaration") {
                return namedExportsOverride ?? style;
            }

            if (
                parent?.type === "VariableDeclarator" &&
                parent.parent?.type === "VariableDeclaration" &&
                parent.parent.parent?.type === "ExportNamedDeclaration"
            ) {
                return namedExportsOverride ?? style;
            }

            return style;
        }

        return {
            FunctionDeclaration(node) {
                if (getNamedExportOverride(node) === "expression") {
                    context.report({
                        node,
                        message: "Expected a function expression.",
                    });
                }
            },
            FunctionExpression(node) {
                const parent = node.parent;

                if (
                    parent &&
                    parent.type === "VariableDeclarator" &&
                    parent.id &&
                    parent.id.type === "Identifier"
                ) {
                    if (getNamedExportOverride(node) === "declaration") {
                        context.report({
                            node,
                            message: "Expected a function declaration.",
                        });
                    }
                }
            },
            ArrowFunctionExpression(node) {
                const parent = node.parent;

                if (
                    parent &&
                    parent.type === "VariableDeclarator" &&
                    parent.id &&
                    parent.id.type === "Identifier"
                ) {
                    if (
                        getNamedExportOverride(node) === "declaration" &&
                        !allowArrowFunctions &&
                        !arrowFunctionUsesLexicalBindings(node)
                    ) {
                        context.report({
                            node,
                            message: "Expected a function declaration.",
                        });
                    }
                }
            },
        };
    },
};

export default funcStyleRule;
