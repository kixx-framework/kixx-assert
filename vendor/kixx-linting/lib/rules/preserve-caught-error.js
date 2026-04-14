/**
 * Checks that rethrown errors preserve the caught error as `cause`.
 */

import { getPropertyKeyName } from "./utils.js";

const UNKNOWN_CAUSE = Symbol("unknown_cause");

const BUILT_IN_ERROR_TYPES = new Set([
    "Error",
    "EvalError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError",
    "AggregateError",
]);

function isOpeningParenToken(token) {
    return token.value === "(";
}

function findParentCatch(node) {
    let currentNode = node;

    while (currentNode && currentNode.type !== "CatchClause") {
        if (
            currentNode.type === "FunctionDeclaration" ||
            currentNode.type === "FunctionExpression" ||
            currentNode.type === "ArrowFunctionExpression" ||
            currentNode.type === "StaticBlock"
        ) {
            return null;
        }

        currentNode = currentNode.parent;
    }

    return currentNode;
}

function isGlobalReference(sourceCode, identifierNode) {
    const variable = sourceCode.getResolvedVariable(identifierNode);

    if (!variable) {
        return true;
    }

    return variable.defs.length === 0;
}

function getErrorCause(throwStatement) {
    const throwExpression = throwStatement.argument;
    const optionsIndex = throwExpression.callee.name === "AggregateError" ? 2 : 1;

    const spreadExpressionIndex = throwExpression.arguments.findIndex(
        arg => arg.type === "SpreadElement",
    );

    if (spreadExpressionIndex >= 0 && spreadExpressionIndex <= optionsIndex) {
        return UNKNOWN_CAUSE;
    }

    const errorOptions = throwExpression.arguments[optionsIndex];

    if (!errorOptions) {
        return null;
    }

    if (errorOptions.type !== "ObjectExpression") {
        return UNKNOWN_CAUSE;
    }

    if (errorOptions.properties.some(property => property.type === "SpreadElement")) {
        return UNKNOWN_CAUSE;
    }

    const causeProperties = errorOptions.properties.filter(
        property => property.type === "Property" && getPropertyKeyName(property) === "cause",
    );

    const causeProperty = causeProperties.at(-1);

    return causeProperty
        ? {
            value: causeProperty.value,
            multipleDefinitions: causeProperties.length > 1,
        }
        : null;
}

const MESSAGES = {
    missingCause: "There is no `cause` attached to the symptom error being thrown.",
    incorrectCause: "The symptom error is being thrown with an incorrect `cause`.",
    missingCatchErrorParam: "The caught error is not accessible because the catch clause lacks the error parameter. Start referencing the caught error using the catch parameter.",
    partiallyLostError: "Re-throws cannot preserve the caught error as a part of it is being lost due to destructuring.",
    caughtErrorShadowed: "The caught error is being attached as `cause`, but is shadowed by a closer scoped redeclaration.",
};

const preserveCaughtErrorRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    requireCatchParameter: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const requireCatchParameter = context.options[0]?.requireCatchParameter ?? false;

        function isThrowingNewError(throwStatement) {
            return (
                (throwStatement.argument.type === "NewExpression" ||
                    throwStatement.argument.type === "CallExpression") &&
                throwStatement.argument.callee.type === "Identifier" &&
                BUILT_IN_ERROR_TYPES.has(throwStatement.argument.callee.name) &&
                isGlobalReference(sourceCode, throwStatement.argument.callee)
            );
        }

        function getCaughtErrorVariable(catchClause) {
            return sourceCode.getDeclaredVariables(catchClause).at(0) ?? null;
        }

        return {
            ThrowStatement(node) {
                const parentCatch = findParentCatch(node);

                if (!parentCatch || !isThrowingNewError(node)) {
                    return;
                }

                if (parentCatch.param && parentCatch.param.type !== "Identifier") {
                    context.report({
                        node: parentCatch,
                        message: MESSAGES.partiallyLostError,
                    });
                    return;
                }

                const caughtError = parentCatch.param?.type === "Identifier"
                    ? parentCatch.param
                    : null;

                if (!caughtError) {
                    if (requireCatchParameter) {
                        context.report({
                            node,
                            message: MESSAGES.missingCatchErrorParam,
                        });
                    }
                    return;
                }

                const errorCauseInfo = getErrorCause(node);

                if (errorCauseInfo === UNKNOWN_CAUSE) {
                    return;
                }

                if (errorCauseInfo === null) {
                    context.report({
                        node,
                        message: MESSAGES.missingCause,
                    });
                    return;
                }

                const caughtErrorVariable = getCaughtErrorVariable(parentCatch);
                const thrownErrorCause = errorCauseInfo.value;

                if (thrownErrorCause.type !== "Identifier" || thrownErrorCause.name !== caughtError.name) {
                    context.report({
                        node: thrownErrorCause,
                        message: MESSAGES.incorrectCause,
                    });
                    return;
                }

                const causeVariable = sourceCode.getResolvedVariable(thrownErrorCause);

                if (!caughtErrorVariable || causeVariable !== caughtErrorVariable) {
                    context.report({
                        node,
                        message: MESSAGES.caughtErrorShadowed,
                    });
                    return;
                }

                const throwExpression = node.argument;
                const optionsIndex = throwExpression.callee.name === "AggregateError" ? 2 : 1;
                const optionsNode = throwExpression.arguments[optionsIndex];

                if (!optionsNode) {
                    context.report({
                        node,
                        message: MESSAGES.missingCause,
                    });
                    return;
                }

                if (optionsNode.type !== "ObjectExpression") {
                    return;
                }

                const lastToken = sourceCode.getLastToken(throwExpression);
                const lastCalleeToken = sourceCode.getLastToken(throwExpression.callee);
                const parenToken = sourceCode.getFirstTokenBetween(
                    lastCalleeToken,
                    lastToken,
                    isOpeningParenToken,
                );

                if (!parenToken) {
                    return;
                }
            },
        };
    },
};

export default preserveCaughtErrorRule;
