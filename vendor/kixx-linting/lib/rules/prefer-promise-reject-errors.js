/**
 * Requires Promise rejection reasons to be Error-like values.
 */

function couldBeError(node) {
    if (!node) {
        return false;
    }

    if (node.type === "ChainExpression") {
        return couldBeError(node.expression);
    }

    if (node.type === "NewExpression" && node.callee.type === "Identifier" && /Error$/.test(node.callee.name)) {
        return true;
    }

    switch (node.type) {
        case "Literal":
            return typeof node.value === "object" && node.value !== null;

        case "Identifier":
            return node.name !== "undefined";

        case "TemplateLiteral":
        case "ArrayExpression":
        case "ObjectExpression":
            return false;

        case "AwaitExpression":
            return true;

        case "UnaryExpression":
            return false;

        case "AssignmentExpression":
            if (node.operator === "=") {
                return couldBeError(node.right);
            }

            if (node.operator === "||=" || node.operator === "??=") {
                return true;
            }

            return false;

        case "LogicalExpression":
            if (node.operator === "&&") {
                return node.left.type === "Literal" && Boolean(node.left.value) && couldBeError(node.right);
            }

            if (node.operator === "||" || node.operator === "??") {
                return couldBeError(node.left) || couldBeError(node.right);
            }

            return false;

        default:
            return true;
    }
}

function isPromiseRejectCall(node) {
    const callee = node.callee.type === "ChainExpression" ? node.callee.expression : node.callee;

    return (
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.object.name === "Promise" &&
        callee.property.type === "Identifier" &&
        callee.property.name === "reject" &&
        callee.computed === false
    );
}

const preferPromiseRejectErrorsRule = {
    meta: {
        type: "suggestion",
    },

    create(context) {
        const allowEmptyReject = context.options[0]?.allowEmptyReject === true;

        function checkRejectCall(node) {
            if (node.arguments.length === 0) {
                if (allowEmptyReject) {
                    return;
                }

                context.report({
                    node,
                    message: "Expected the Promise rejection reason to be an Error.",
                });
                return;
            }

            if (!couldBeError(node.arguments[0])) {
                context.report({
                    node,
                    message: "Expected the Promise rejection reason to be an Error.",
                });
            }
        }

        return {
            CallExpression(node) {
                if (isPromiseRejectCall(node)) {
                    checkRejectCall(node);
                }
            },

            "NewExpression:exit"(node) {
                if (
                    node.callee.type !== "Identifier" ||
                    node.callee.name !== "Promise" ||
                    node.arguments.length === 0
                ) {
                    return;
                }

                const executor = node.arguments[0];
                if (
                    (executor.type !== "FunctionExpression" && executor.type !== "ArrowFunctionExpression") ||
                    executor.params.length < 2 ||
                    executor.params[1].type !== "Identifier"
                ) {
                    return;
                }

                const rejectName = executor.params[1].name;
                const rejectVariable = context.sourceCode
                    .getDeclaredVariables(executor)
                    .find(variable => variable.name === rejectName);

                if (!rejectVariable) {
                    return;
                }

                for (const reference of rejectVariable.references) {
                    if (
                        !reference.isRead() ||
                        reference.identifier.parent?.type !== "CallExpression" ||
                        reference.identifier.parent.callee !== reference.identifier
                    ) {
                        continue;
                    }

                    checkRejectCall(reference.identifier.parent);
                }
            },
        };
    },
};

export default preferPromiseRejectErrorsRule;
