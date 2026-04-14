/**
 * no-constant-binary-expression — disallow expressions where the operation doesn't change the value.
 * Adapted from ESLint's no-constant-binary-expression rule.
 */

import {
    getStaticValue as evaluateSharedStaticValue,
    hasStaticTemplateText,
    isStaticTemplateLiteral,
    isUnshadowedGlobalName,
} from "./constant-eval.js";

function evaluateStaticValue(node, sourceCode) {
    return evaluateSharedStaticValue(node, sourceCode, {
        evaluateAssignment: true,
        evaluateBooleanCall: true,
        evaluateEmptyObject: true,
        evaluateSequence: true,
        getConstantTruthiness,
    });
}

function getConstantTruthiness(node, sourceCode) {
    if (!node) {
        return null;
    }

    const staticValue = evaluateStaticValue(node, sourceCode);

    if (staticValue.resolved) {
        return Boolean(staticValue.value);
    }

    switch (node.type) {
        case "ArrayExpression":
        case "ObjectExpression":
        case "FunctionExpression":
        case "ArrowFunctionExpression":
        case "ClassExpression":
        case "NewExpression":
            return true;
        case "TemplateLiteral":
            if (isStaticTemplateLiteral(node)) {
                return node.quasis[0].value.cooked !== "";
            }
            if (hasStaticTemplateText(node)) {
                return true;
            }
            return null;
        case "UnaryExpression":
            if (node.operator === "!") {
                const argumentTruthiness = getConstantTruthiness(node.argument, sourceCode);
                return argumentTruthiness === null ? null : !argumentTruthiness;
            }
            if (node.operator === "void") {
                return false;
            }
            if (node.operator === "typeof") {
                return true;
            }
            return null;
        case "CallExpression":
            if (
                node.callee.type === "Identifier" &&
                isUnshadowedGlobalName(node.callee, sourceCode, "Boolean", node) &&
                !node.arguments.some(argument => argument.type === "SpreadElement")
            ) {
                if (node.arguments.length === 0) {
                    return false;
                }
                if (node.arguments.length >= 1) {
                    return getConstantTruthiness(node.arguments[0], sourceCode);
                }
            }
            return null;
        case "LogicalExpression": {
            const leftTruthiness = getConstantTruthiness(node.left, sourceCode);
            const rightTruthiness = getConstantTruthiness(node.right, sourceCode);

            if (node.operator === "&&") {
                if (leftTruthiness === false) {
                    return false;
                }
                if (rightTruthiness === false) {
                    return false;
                }
                if (leftTruthiness === true) {
                    return rightTruthiness;
                }
                return null;
            }

            if (node.operator === "||") {
                if (leftTruthiness === true) {
                    return true;
                }
                if (rightTruthiness === true) {
                    return true;
                }
                if (leftTruthiness === false) {
                    return rightTruthiness;
                }
                return null;
            }

            if (node.operator === "??") {
                if (isAlwaysNullish(node.left, sourceCode)) {
                    return rightTruthiness;
                }
                if (isNeverNullish(node.left, sourceCode)) {
                    return leftTruthiness;
                }
                return null;
            }

            return null;
        }
        default:
            return null;
    }
}

function isAlwaysNullish(node, sourceCode) {
    if (!node) {
        return false;
    }

    const staticValue = evaluateStaticValue(node, sourceCode);

    if (staticValue.resolved) {
        // eslint-disable-next-line no-eq-null, eqeqeq
        return staticValue.value == null;
    }

    if (node.type === "UnaryExpression" && node.operator === "void") {
        return true;
    }

    if (node.type === "LogicalExpression" && node.operator === "??") {
        return (
            isAlwaysNullish(node.left, sourceCode) &&
            isAlwaysNullish(node.right, sourceCode)
        );
    }

    return false;
}

function isNeverNullish(node, sourceCode) {
    if (!node) {
        return false;
    }

    const staticValue = evaluateStaticValue(node, sourceCode);

    if (staticValue.resolved) {
        // eslint-disable-next-line no-eq-null, eqeqeq
        return staticValue.value != null;
    }

    switch (node.type) {
        case "ArrayExpression":
        case "ObjectExpression":
        case "FunctionExpression":
        case "ArrowFunctionExpression":
        case "ClassExpression":
        case "NewExpression":
        case "UpdateExpression":
            return true;
        case "Literal":
            return node.value !== null;
        case "TemplateLiteral":
            return true;
        case "UnaryExpression":
            return node.operator !== "void";
        case "BinaryExpression":
            return true;
        case "CallExpression":
            if (
                node.callee.type === "Identifier" &&
                (
                    isUnshadowedGlobalName(node.callee, sourceCode, "Boolean", node) ||
                    isUnshadowedGlobalName(node.callee, sourceCode, "String", node) ||
                    isUnshadowedGlobalName(node.callee, sourceCode, "Number", node)
                )
            ) {
                return true;
            }
            return false;
        case "AssignmentExpression":
            if (node.operator === "=") {
                return isNeverNullish(node.right, sourceCode);
            }
            return true;
        case "SequenceExpression":
            return isNeverNullish(node.expressions[node.expressions.length - 1], sourceCode);
        case "ConditionalExpression":
            return (
                isNeverNullish(node.consequent, sourceCode) &&
                isNeverNullish(node.alternate, sourceCode)
            );
        case "LogicalExpression":
            if (node.operator === "??") {
                return (
                    isNeverNullish(node.left, sourceCode) ||
                    isNeverNullish(node.right, sourceCode)
                );
            }
            return false;
        default:
            return false;
    }
}

function isAlwaysBoolean(node, sourceCode) {
    if (!node) {
        return false;
    }

    const staticValue = evaluateStaticValue(node, sourceCode);

    if (staticValue.resolved) {
        return typeof staticValue.value === "boolean";
    }

    switch (node.type) {
        case "UnaryExpression":
            return node.operator === "!" || node.operator === "delete";
        case "BinaryExpression":
            return [
                "==",
                "!=",
                "===",
                "!==",
                "<",
                "<=",
                ">",
                ">=",
                "in",
                "instanceof",
            ].includes(node.operator);
        case "LogicalExpression":
            return false;
        case "CallExpression":
            return (
                node.callee.type === "Identifier" &&
                isUnshadowedGlobalName(node.callee, sourceCode, "Boolean", node)
            );
        default:
            return false;
    }
}

function isDefinitelyNonBoolean(node, sourceCode) {
    if (!node) {
        return false;
    }

    const staticValue = evaluateStaticValue(node, sourceCode);

    if (staticValue.resolved) {
        return typeof staticValue.value !== "boolean";
    }

    switch (node.type) {
        case "ArrayExpression":
        case "ObjectExpression":
        case "FunctionExpression":
        case "ArrowFunctionExpression":
        case "ClassExpression":
        case "NewExpression":
            return true;
        case "Literal":
            return typeof node.value !== "boolean";
        case "TemplateLiteral":
            return true;
        case "UnaryExpression":
            return node.operator !== "!" && node.operator !== "delete";
        case "UpdateExpression":
            return true;
        case "BinaryExpression":
            return ![
                "==",
                "!=",
                "===",
                "!==",
                "<",
                "<=",
                ">",
                ">=",
                "in",
                "instanceof",
            ].includes(node.operator);
        case "AssignmentExpression":
            if (node.operator === "=") {
                return isDefinitelyNonBoolean(node.right, sourceCode);
            }
            return true;
        case "SequenceExpression":
            return isDefinitelyNonBoolean(node.expressions[node.expressions.length - 1], sourceCode);
        case "ConditionalExpression":
            return (
                isDefinitelyNonBoolean(node.consequent, sourceCode) &&
                isDefinitelyNonBoolean(node.alternate, sourceCode)
            );
        case "CallExpression":
            if (
                node.callee.type === "Identifier" &&
                (
                    isUnshadowedGlobalName(node.callee, sourceCode, "String", node) ||
                    isUnshadowedGlobalName(node.callee, sourceCode, "Number", node)
                )
            ) {
                return true;
            }
            return false;
        default:
            return false;
    }
}

function isKnownFreshObjectConstruction(node, sourceCode) {
    return (
        node.type === "NewExpression" &&
        node.callee.type === "Identifier" &&
        (
            isUnshadowedGlobalName(node.callee, sourceCode, "Boolean", node) ||
            isUnshadowedGlobalName(node.callee, sourceCode, "Promise", node) ||
            isUnshadowedGlobalName(node.callee, sourceCode, "WeakSet", node)
        )
    );
}

function isDefinitelyFreshObject(node, sourceCode, oppositeNode = null) {
    if (!node) {
        return false;
    }

    if (
        node.type === "ObjectExpression" ||
        node.type === "ArrayExpression" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression" ||
        node.type === "ClassExpression"
    ) {
        return true;
    }

    if (node.type === "Literal" && node.regex) {
        return true;
    }

    if (isKnownFreshObjectConstruction(node, sourceCode)) {
        return true;
    }

    if (node.type === "SequenceExpression") {
        return isDefinitelyFreshObject(node.expressions[node.expressions.length - 1], sourceCode, oppositeNode);
    }

    if (node.type === "ConditionalExpression") {
        return (
            isDefinitelyFreshObject(node.consequent, sourceCode, oppositeNode) &&
            isDefinitelyFreshObject(node.alternate, sourceCode, oppositeNode)
        );
    }

    if (node.type === "AssignmentExpression" && node.operator === "=") {
        return isDefinitelyFreshObject(node.right, sourceCode, oppositeNode);
    }

    return false;
}

function isBooleanLiteral(node, sourceCode) {
    const staticValue = evaluateStaticValue(node, sourceCode);
    return staticValue.resolved && typeof staticValue.value === "boolean";
}

function isNullishLiteral(node, sourceCode) {
    const staticValue = evaluateStaticValue(node, sourceCode);
    // eslint-disable-next-line no-eq-null, eqeqeq
    return staticValue.resolved && staticValue.value == null;
}

function hasConstantLooseBooleanComparison(node, booleanValue, sourceCode) {
    const staticValue = evaluateStaticValue(node, sourceCode);

    if (staticValue.resolved) {
        // eslint-disable-next-line eqeqeq
        return staticValue.value == booleanValue;
    }

    if (
        node.type === "ObjectExpression" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression" ||
        node.type === "ClassExpression" ||
        (node.type === "Literal" && node.regex)
    ) {
        return false;
    }

    if (node.type === "ArrayExpression") {
        if (node.elements.length === 0) {
            // eslint-disable-next-line eqeqeq
            return [] == booleanValue;
        }

        if (
            node.elements.length >= 2 &&
            node.elements.every(element => element && element.type !== "SpreadElement")
        ) {
            return false;
        }

        return null;
    }

    if (node.type === "UnaryExpression" && node.operator === "typeof") {
        return false;
    }

    if (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        isUnshadowedGlobalName(node.callee, sourceCode, "Boolean", node)
    ) {
        const evaluated = evaluateStaticValue(node, sourceCode);
        // eslint-disable-next-line eqeqeq
        return evaluated.resolved ? evaluated.value == booleanValue : null;
    }

    if (node.type === "SequenceExpression") {
        return hasConstantLooseBooleanComparison(
            node.expressions[node.expressions.length - 1],
            booleanValue,
            sourceCode,
        );
    }

    if (node.type === "AssignmentExpression" && node.operator === "=") {
        return hasConstantLooseBooleanComparison(node.right, booleanValue, sourceCode);
    }

    return null;
}

function report(node, context, message) {
    context.report({ node, message });
}

function isComparisonOperator(operator) {
    return [
        "==",
        "!=",
        "===",
        "!==",
        "<",
        "<=",
        ">",
        ">=",
    ].includes(operator);
}

const noConstantBinaryExpressionRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        const sourceCode = context.sourceCode;

        return {
            LogicalExpression(node) {
                const { operator, left } = node;

                if (operator === "&&") {
                    const truthiness = getConstantTruthiness(left, sourceCode);

                    if (truthiness === false) {
                        report(node, context, "Unexpected constant condition. The expression is always falsy.");
                    } else if (truthiness === true) {
                        report(node, context, "Unexpected constant condition. The left operand is always truthy.");
                    }
                } else if (operator === "||") {
                    const truthiness = getConstantTruthiness(left, sourceCode);

                    if (truthiness === true) {
                        report(node, context, "Unexpected constant condition. The left operand is always truthy.");
                    } else if (truthiness === false) {
                        report(node, context, "Unexpected constant condition. The expression always evaluates to the right operand.");
                    }
                } else if (operator === "??") {
                    if (isAlwaysNullish(left, sourceCode)) {
                        report(node, context, "Unexpected constant nullishness. The left operand is always nullish.");
                    } else if (isNeverNullish(left, sourceCode)) {
                        report(node, context, "Unexpected constant nullishness. The left operand is never nullish.");
                    }
                }
            },

            BinaryExpression(node) {
                const { operator, left, right } = node;
                const leftStatic = evaluateStaticValue(left, sourceCode);
                const rightStatic = evaluateStaticValue(right, sourceCode);

                if (isComparisonOperator(operator) && leftStatic.resolved && rightStatic.resolved) {
                    report(node, context, "Unexpected constant binary expression.");
                    return;
                }

                if (operator === "===" || operator === "!==") {
                    if (
                        isDefinitelyFreshObject(left, sourceCode, right) ||
                        isDefinitelyFreshObject(right, sourceCode, left)
                    ) {
                        report(
                            node,
                            context,
                            `Unexpected constant condition. Comparisons with newly created objects using '${operator}' are always ${operator === "===" ? "false" : "true"}.`,
                        );
                        return;
                    }

                    if (
                        (isNullishLiteral(left, sourceCode) && isNeverNullish(right, sourceCode)) ||
                        (isNullishLiteral(right, sourceCode) && isNeverNullish(left, sourceCode))
                    ) {
                        report(node, context, "Unexpected constant condition. This strict comparison is always constant.");
                        return;
                    }

                    if (
                        (isBooleanLiteral(left, sourceCode) && isDefinitelyNonBoolean(right, sourceCode)) ||
                        (isBooleanLiteral(right, sourceCode) && isDefinitelyNonBoolean(left, sourceCode))
                    ) {
                        report(node, context, "Unexpected constant condition. This strict boolean comparison is always constant.");
                    }

                    return;
                }

                if (operator === "==" || operator === "!=") {
                    if (
                        (isNullishLiteral(left, sourceCode) && isNeverNullish(right, sourceCode)) ||
                        (isNullishLiteral(right, sourceCode) && isNeverNullish(left, sourceCode))
                    ) {
                        report(node, context, "Unexpected constant condition. This loose nullish comparison is always constant.");
                        return;
                    }

                    if (
                        isDefinitelyFreshObject(left, sourceCode, right) &&
                        isDefinitelyFreshObject(right, sourceCode, left)
                    ) {
                        report(node, context, "Unexpected constant condition. Both sides are newly created objects.");
                        return;
                    }

                    if (isAlwaysBoolean(left, sourceCode)) {
                        const result = hasConstantLooseBooleanComparison(right, leftStatic.resolved ? leftStatic.value : null, sourceCode);

                        if (result !== null) {
                            report(node, context, "Unexpected constant condition. This loose boolean comparison is always constant.");
                            return;
                        }
                    }

                    if (isAlwaysBoolean(right, sourceCode)) {
                        const result = hasConstantLooseBooleanComparison(left, rightStatic.resolved ? rightStatic.value : null, sourceCode);

                        if (result !== null) {
                            report(node, context, "Unexpected constant condition. This loose boolean comparison is always constant.");
                        }
                    }
                }
            },
        };
    },
};

export default noConstantBinaryExpressionRule;
