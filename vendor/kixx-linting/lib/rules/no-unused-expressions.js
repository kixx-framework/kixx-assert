/**
 * no-unused-expressions — disallow unused expressions.
 * Adapted from ESLint's no-unused-expressions rule.
 */

function isAllowedShortCircuit(node, allowShortCircuit) {
    if (!allowShortCircuit) return false;
    return node.type === "LogicalExpression" && (node.operator === "||" || node.operator === "&&" || node.operator === "??");
}

function isAllowedTernary(node, allowTernary) {
    if (!allowTernary) return false;
    return node.type === "ConditionalExpression";
}

function isAllowedTaggedTemplateExpression(node, allowTaggedTemplates) {
    if (!allowTaggedTemplates) return false;
    return node.type === "TaggedTemplateExpression";
}

function isDirective(node) {
    // A string expression statement at the top of a script/function body is a directive
    if (node.type !== "ExpressionStatement") return false;
    const expr = node.expression;
    if (expr.type !== "Literal" || typeof expr.value !== "string") return false;
    const parent = node.parent;
    if (!parent) return false;

    // Directives are only recognized in Program or Function body statements.
    if (parent.type !== "Program" && parent.type !== "BlockStatement") {
        return false;
    }

    const grandParent = parent.parent;
    if (parent.type === "BlockStatement" && grandParent &&
        grandParent.type !== "FunctionDeclaration" &&
        grandParent.type !== "FunctionExpression" &&
        grandParent.type !== "ArrowFunctionExpression") {
        return false;
    }

    const body = parent.body;
    if (!Array.isArray(body)) return false;
    // Must be at the beginning before any non-directive statements
    let i = 0;
    while (i < body.length && body[i] !== node) {
        if (body[i].type !== "ExpressionStatement" || !body[i].expression || body[i].expression.type !== "Literal") {
            return false;
        }
        i += 1;
    }
    return true;
}

function isUsefulExpression(node, opts) {
    const { allowShortCircuit, allowTernary, allowTaggedTemplates } = opts;

    if (node.type === "AssignmentExpression") return true;
    if (node.type === "AwaitExpression") return true;
    if (node.type === "CallExpression") return true;
    if (node.type === "ChainExpression" && node.expression && node.expression.type === "CallExpression") return true;
    if (node.type === "ImportExpression") return true;
    if (node.type === "NewExpression") return true;
    if (node.type === "UpdateExpression") return true;
    if (node.type === "UnaryExpression" && (node.operator === "void" || node.operator === "delete")) return true;
    if (node.type === "YieldExpression") return true;
    if (isAllowedShortCircuit(node, allowShortCircuit)) {
        // Recurse to check the right side
        return isUsefulExpression(node.right, opts);
    }
    if (isAllowedTernary(node, allowTernary)) {
        // Both branches must be useful
        return isUsefulExpression(node.consequent, opts) && isUsefulExpression(node.alternate, opts);
    }
    if (isAllowedTaggedTemplateExpression(node, allowTaggedTemplates)) return true;

    return false;
}

const noUnusedExpressionsRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    allowShortCircuit: { type: "boolean" },
                    allowTernary: { type: "boolean" },
                    allowTaggedTemplates: { type: "boolean" },
                    enforceForJSX: { type: "boolean" },
                    ignoreDirectives: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const ecmaVersion = Number(context.languageOptions?.ecmaVersion ?? 2024);
        const reportedBodies = new WeakSet();
        const opts = {
            allowShortCircuit: context.options[0]?.allowShortCircuit ?? false,
            allowTernary: context.options[0]?.allowTernary ?? false,
            allowTaggedTemplates: context.options[0]?.allowTaggedTemplates ?? false,
            ignoreDirectives: context.options[0]?.ignoreDirectives ?? false,
        };

        return {
            ExpressionStatement(node) {
                if (isDirective(node) && (ecmaVersion >= 5 || opts.ignoreDirectives)) {
                    return;
                }

                const expr = node.expression;
                if (!isUsefulExpression(expr, opts)) {
                    const bodyContainer = node.parent;
                    if (bodyContainer && (
                        bodyContainer.type === "Program" ||
                        bodyContainer.type === "BlockStatement" ||
                        bodyContainer.type === "StaticBlock"
                    )) {
                        if (reportedBodies.has(bodyContainer)) {
                            return;
                        }
                        reportedBodies.add(bodyContainer);
                    }

                    context.report({
                        node,
                        message: "Expected an assignment or function call and instead saw an expression.",
                    });
                }
            },
        };
    },
};

export default noUnusedExpressionsRule;
