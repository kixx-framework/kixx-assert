/**
 * no-constant-condition — disallow constant expressions in conditions.
 * Adapted from ESLint's no-constant-condition rule.
 */

import { isFunctionLike } from "./utils.js";
import {
    getStaticValue as evaluateSharedStaticValue,
    hasStaticTemplateText,
    isBuiltinConstantIdentifier,
    isUnshadowedGlobalName,
} from "./constant-eval.js";

function isConstantTemplateLiteral(node, sourceCode) {
    return node.expressions.every(expression => isConstantExpression(expression, sourceCode, false));
}

function hasYield(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === "YieldExpression") {
        return true;
    }

    // Yield in nested functions doesn't make the outer loop body suspend.
    if (isFunctionLike(node)) {
        return false;
    }

    for (const value of Object.values(node)) {
        if (!value) {
            continue;
        }

        if (Array.isArray(value)) {
            if (value.some(child => hasYield(child))) {
                return true;
            }
            continue;
        }

        if (typeof value === "object" && hasYield(value)) {
            return true;
        }
    }

    return false;
}

function isAlwaysNullish(node, sourceCode) {
    return (
        (node.type === "Literal" && node.value === null) ||
        (node.type === "Identifier" && isBuiltinConstantIdentifier(node, sourceCode) && node.name === "undefined")
    );
}

function evaluateStaticValue(node, sourceCode) {
    return evaluateSharedStaticValue(node, sourceCode, {
        allowArrayHoles: true,
        allowArraySpread: true,
        evaluateBinary: true,
        evaluateTemplateExpressions: true,
        evaluateTypeof: true,
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
        case "Literal":
            return Boolean(node.value);
        case "Identifier":
            if (!isBuiltinConstantIdentifier(node, sourceCode)) {
                return null;
            }
            if (node.name === "undefined" || node.name === "NaN") {
                return false;
            }
            return true;
        case "ArrayExpression":
        case "ObjectExpression":
        case "FunctionExpression":
        case "ArrowFunctionExpression":
        case "ClassExpression":
        case "NewExpression":
            return true;
        case "TemplateLiteral":
            if (node.expressions.length === 0) {
                return node.quasis[0].value.cooked !== "";
            }
            if (hasStaticTemplateText(node)) {
                return true;
            }
            if (node.expressions.every(expression => isConstantExpression(expression, sourceCode, false))) {
                return true;
            }
            return null;
        case "UnaryExpression": {
            const argumentTruthiness = getConstantTruthiness(node.argument, sourceCode);

            if (node.operator === "!") {
                return argumentTruthiness === null ? null : !argumentTruthiness;
            }

            if (node.operator === "void") {
                return false;
            }

            if (node.operator === "typeof") {
                return true;
            }

            return null;
        }
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
                if (node.left.type === "Literal" && node.left.value === null) {
                    return rightTruthiness;
                }
                if (node.left.type === "Identifier" && node.left.name === "undefined") {
                    return rightTruthiness;
                }
                if (leftTruthiness !== null) {
                    return leftTruthiness;
                }
                return null;
            }

            return null;
        }
        case "AssignmentExpression": {
            const rightTruthiness = getConstantTruthiness(node.right, sourceCode);

            if (node.operator === "=") {
                return rightTruthiness;
            }

            if (node.operator === "||=") {
                if (rightTruthiness === true) {
                    return true;
                }
                return null;
            }

            if (node.operator === "&&=") {
                if (rightTruthiness === false) {
                    return false;
                }
                return null;
            }

            return null;
        }
        case "CallExpression":
            if (
                node.callee.type === "Identifier" &&
                isUnshadowedGlobalName(node.callee, sourceCode, "Boolean", node) &&
                !node.arguments.some(argument => argument.type === "SpreadElement")
            ) {
                if (node.arguments.length === 0) {
                    return false;
                }
                if (node.arguments.length === 1) {
                    return getConstantTruthiness(node.arguments[0], sourceCode);
                }
            }
            return null;
        default:
            return null;
    }
}

function isConstantExpression(node, sourceCode, inBooleanPosition = true) {
    if (!node) return false;

    if (inBooleanPosition && getConstantTruthiness(node, sourceCode) !== null) {
        return true;
    }

    switch (node.type) {
        case "Literal":
            return true;
        case "ArrayExpression":
        case "ObjectExpression":
        case "FunctionExpression":
        case "ArrowFunctionExpression":
        case "ClassExpression":
        case "NewExpression":
            return inBooleanPosition;
        case "TemplateLiteral":
            return isConstantTemplateLiteral(node, sourceCode);
        case "Identifier":
            return isBuiltinConstantIdentifier(node, sourceCode);
        case "UnaryExpression":
            if (node.operator === "!") {
                return getConstantTruthiness(node.argument, sourceCode) !== null;
            }
            if (node.operator === "void") {
                return true;
            }
            return isConstantExpression(node.argument, sourceCode, false);
        case "BinaryExpression":
            // `in` depends on property lookup semantics and is not treated as a
            // constant condition by this rule's test suite.
            if (node.operator === "in") {
                return false;
            }
            return isConstantExpression(node.left, sourceCode, false) && isConstantExpression(node.right, sourceCode, false);
        case "LogicalExpression":
            if (node.operator === "&&") {
                const leftTruthiness = getConstantTruthiness(node.left, sourceCode);

                if (leftTruthiness === true) {
                    return isConstantExpression(node.right, sourceCode, false);
                }
                if (leftTruthiness === false) {
                    return isConstantExpression(node.left, sourceCode, false);
                }
                return false;
            }
            if (node.operator === "||") {
                const leftTruthiness = getConstantTruthiness(node.left, sourceCode);

                if (leftTruthiness === true) {
                    return isConstantExpression(node.left, sourceCode, false);
                }
                if (leftTruthiness === false) {
                    return isConstantExpression(node.right, sourceCode, false);
                }
                return false;
            }
            if (node.operator === "??") {
                if (isAlwaysNullish(node.left, sourceCode)) {
                    return isConstantExpression(node.right, sourceCode, false);
                }
                if (isConstantExpression(node.left, sourceCode, false)) {
                    return true;
                }
                return false;
            }
            return false;
        case "ConditionalExpression":
            return isConstantExpression(node.test, sourceCode);
        case "SequenceExpression":
            return isConstantExpression(node.expressions[node.expressions.length - 1], sourceCode);
        case "AssignmentExpression":
            if (node.operator === "=") {
                return isConstantExpression(node.right, sourceCode, true);
            }
            return false;
        default:
            return false;
    }
}

const noConstantConditionRule = {
    meta: {
        type: "problem",
        schema: [
            {
                type: "object",
                properties: {
                    checkLoops: {
                        oneOf: [
                            { type: "boolean" },
                            { enum: ["all", "allExceptWhileTrue", "none"] },
                        ],
                    },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const hasExplicitCheckLoopsOption = Object.hasOwn(context.options[0] ?? {}, "checkLoops");
        const checkLoops = context.options[0]?.checkLoops ?? true;
        const sourceCode = context.sourceCode;

        function isAllowedConstantLoop(node) {
            let current = node;

            while (current) {
                if (current.type === "FunctionDeclaration" || current.type === "FunctionExpression") {
                    return current.generator && hasYield(node.body);
                }

                if (current.type === "ArrowFunctionExpression") {
                    return false;
                }

                current = current.parent;
            }

            return false;
        }

        function report(node) {
            context.report({
                node,
                message: "Unexpected constant condition.",
            });
        }

        return {
            IfStatement(node) {
                if (isConstantExpression(node.test, sourceCode)) {
                    report(node.test);
                }
            },
            ConditionalExpression(node) {
                if (isConstantExpression(node.test, sourceCode)) {
                    report(node.test);
                }
            },
            WhileStatement(node) {
                if (checkLoops === false || checkLoops === "none") return;
                if (checkLoops === "allExceptWhileTrue") {
                    if (node.test.type === "Literal" && node.test.value === true) return;
                }
                if (!hasExplicitCheckLoopsOption && checkLoops === true) {
                    if (node.test.type === "Literal" && node.test.value === true) return;
                }
                if (node.test.type === "Literal" && node.test.value === true && isAllowedConstantLoop(node)) {
                    return;
                }
                if (isConstantExpression(node.test, sourceCode)) {
                    report(node.test);
                }
            },
            DoWhileStatement(node) {
                if (checkLoops === false || checkLoops === "none") return;
                if (checkLoops === "allExceptWhileTrue") {
                    if (node.test.type === "Literal" && node.test.value === true) return;
                }
                if (node.test.type === "Literal" && node.test.value === true && isAllowedConstantLoop(node)) {
                    return;
                }
                if (isConstantExpression(node.test, sourceCode)) {
                    report(node.test);
                }
            },
            ForStatement(node) {
                if (checkLoops === false || checkLoops === "none") return;
                if (!node.test) return; // for (;;) is allowed
                if (node.test.type === "Literal" && node.test.value === true && isAllowedConstantLoop(node)) {
                    return;
                }
                if (isConstantExpression(node.test, sourceCode)) {
                    report(node.test);
                }
            },
        };
    },
};

export default noConstantConditionRule;
