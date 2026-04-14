/**
 * no-throw-literal — disallow throwing literals as exceptions.
 * Adapted from ESLint's no-throw-literal rule.
 */

function couldBeError(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    switch (node.type) {
        case "Identifier":
            return node.name !== "undefined";
        case "CallExpression":
        case "NewExpression":
        case "MemberExpression":
        case "TaggedTemplateExpression":
        case "YieldExpression":
        case "AwaitExpression":
        case "ChainExpression":
            return true;
        case "AssignmentExpression":
            if (node.operator === "=") {
                return couldBeError(node.right);
            }
            if (node.operator === "&&=") {
                return false;
            }
            if (node.operator === "||=" || node.operator === "??=") {
                return couldBeError(node.left) || couldBeError(node.right);
            }
            return false;
        case "TemplateLiteral":
        case "Literal":
        case "ObjectExpression":
        case "ArrayExpression":
            return false;
        case "ParenthesizedExpression":
            return couldBeError(node.expression);
        case "UnaryExpression":
            return false;
        case "UpdateExpression":
            return false;
        case "BinaryExpression":
            return false;
        case "ThisExpression":
            return true;
        case "SequenceExpression":
            return couldBeError(node.expressions[node.expressions.length - 1]);
        case "LogicalExpression":
            if (node.operator === "&&") {
                if (isAlwaysTruthy(node.left)) {
                    return couldBeError(node.right);
                }
                if (isAlwaysFalsy(node.left)) {
                    return couldBeError(node.left);
                }
                return couldBeError(node.left) && couldBeError(node.right);
            }
            if (node.operator === "||") {
                if (isAlwaysTruthy(node.left)) {
                    return couldBeError(node.left);
                }
                if (isAlwaysFalsy(node.left)) {
                    return couldBeError(node.right);
                }
                return couldBeError(node.left) && couldBeError(node.right);
            }
            if (node.operator === "??") {
                if (isAlwaysNullish(node.left)) {
                    return couldBeError(node.right);
                }
                if (isNeverNullish(node.left)) {
                    return couldBeError(node.left);
                }
                return couldBeError(node.left) && couldBeError(node.right);
            }
            return couldBeError(node.left) || couldBeError(node.right);
        case "ConditionalExpression":
            return couldBeError(node.consequent) || couldBeError(node.alternate);
        default:
            return false;
    }
}

function isAlwaysTruthy(node) {
    if (!node || typeof node !== "object") return false;
    if (node.type === "Literal") return Boolean(node.value);
    if (node.type === "TemplateLiteral") return node.expressions.length === 0 && node.quasis[0].value.cooked.length > 0;
    if (
        node.type === "ObjectExpression" ||
        node.type === "ArrayExpression" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression" ||
        node.type === "ClassExpression" ||
        node.type === "NewExpression"
    ) {
        return true;
    }
    return false;
}

function isAlwaysFalsy(node) {
    if (!node || typeof node !== "object") return false;
    if (node.type === "Literal") {
        return node.value === 0 || node.value === "" || node.value === false || node.value === null;
    }
    if (node.type === "Identifier" && node.name === "undefined") {
        return true;
    }
    if (node.type === "TemplateLiteral") {
        return node.expressions.length === 0 && node.quasis[0].value.cooked.length === 0;
    }
    return false;
}

function isAlwaysNullish(node) {
    if (!node || typeof node !== "object") return false;
    return (
        (node.type === "Literal" && node.value === null) ||
        (node.type === "Identifier" && node.name === "undefined")
    );
}

function isNeverNullish(node) {
    return isAlwaysTruthy(node) || isAlwaysFalsy(node);
}

const noThrowLiteralRule = {
    meta: {
        type: "suggestion",
        schema: [],
    },

    create(context) {
        return {
            ThrowStatement(node) {
                if (node.argument && !couldBeError(node.argument)) {
                    context.report({
                        node,
                        message: "Expected an object to be thrown.",
                    });
                }
            },
        };
    },
};

export default noThrowLiteralRule;
