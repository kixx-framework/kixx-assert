/**
 * Prefers arrow callbacks when the callback does not need a dynamic `this`.
 */

import { getImplicitArgumentsVariable } from "./utils.js";

function isFunctionName(variable) {
    return variable?.defs?.[0]?.type === "FunctionName";
}

function checkMetaProperty(node, metaName, propertyName) {
    return node.meta.name === metaName && node.property.name === propertyName;
}

function getNearestEnclosingFunctionInfo(stack) {
    let i = stack.length;

    while (i > 0) {
        i -= 1;

        const info = stack[i];

        if (info.type !== "arrow") {
            return info;
        }
    }

    return null;
}

function getBindCall(parent) {
    if (parent.parent?.type === "CallExpression" && parent.parent.callee === parent) {
        return parent.parent;
    }

    if (
        parent.parent?.type === "ChainExpression" &&
        parent.parent.parent?.type === "CallExpression" &&
        parent.parent.parent.callee === parent.parent
    ) {
        return parent.parent.parent;
    }

    return null;
}

function getCallbackInfo(node) {
    const info = { isCallback: false, isLexicalThis: false };
    let currentNode = node;
    let parent = node.parent;
    let bound = false;

    while (currentNode && parent) {
        switch (parent.type) {
            case "LogicalExpression":
            case "ChainExpression":
            case "ConditionalExpression":
                break;

            case "MemberExpression": {
                const bindCall = getBindCall(parent);

                if (
                    parent.object === currentNode &&
                    parent.property?.type === "Identifier" &&
                    parent.property.name === "bind" &&
                    parent.computed === false &&
                    bindCall
                ) {
                    if (!bound) {
                        bound = true;
                        info.isLexicalThis =
                            bindCall.arguments.length === 1 &&
                            bindCall.arguments[0].type === "ThisExpression";
                    }

                    parent = bindCall;
                } else {
                    return info;
                }
                break;
            }

            case "CallExpression":
            case "NewExpression":
                if (parent.callee === currentNode) {
                    break;
                }

                if (parent.callee !== currentNode) {
                    info.isCallback = true;
                }
                return info;

            default:
                return info;
        }

        currentNode = parent;
        parent = parent.parent;
    }

    return info;
}

const preferArrowCallbackRule = {
    meta: {
        type: "suggestion",
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const option = context.options[0] ?? {};
        const allowNamedFunctions = option.allowNamedFunctions === true;
        const allowUnboundThis = option.allowUnboundThis !== false;
        let stack = [];

        function enterScope(type) {
            stack.push({ type, this: false, super: false, meta: false });
        }

        function exitScope() {
            return stack.pop() ?? { type: "function", this: false, super: false, meta: false };
        }

        return {
            Program() {
                stack = [];
            },

            ThisExpression() {
                const info = getNearestEnclosingFunctionInfo(stack);
                if (info) {
                    info.this = true;
                }
            },

            Super() {
                const info = getNearestEnclosingFunctionInfo(stack);
                if (info) {
                    info.super = true;
                }
            },

            MetaProperty(node) {
                const info = getNearestEnclosingFunctionInfo(stack);
                if (info && checkMetaProperty(node, "new", "target")) {
                    info.meta = true;
                }
            },

            FunctionDeclaration() {
                enterScope("function");
            },
            "FunctionDeclaration:exit": exitScope,
            ArrowFunctionExpression() {
                enterScope("arrow");
            },
            "ArrowFunctionExpression:exit": exitScope,
            FunctionExpression() {
                enterScope("function");
            },
            "FunctionExpression:exit"(node) {
                const scopeInfo = exitScope();

                if (allowNamedFunctions && node.id?.name) {
                    return;
                }

                if (node.generator) {
                    return;
                }

                const nameVariable = sourceCode.getDeclaredVariables(node)[0];
                if (isFunctionName(nameVariable) && nameVariable.references.length > 0) {
                    return;
                }

                const functionScope = sourceCode.scopeManager.acquire(node, true) || sourceCode.getScope(node);
                const argumentsVariable = getImplicitArgumentsVariable(functionScope);
                if (argumentsVariable && argumentsVariable.references.length > 0) {
                    return;
                }

                const callbackInfo = getCallbackInfo(node);
                if (!callbackInfo.isCallback) {
                    return;
                }

                const supportsThisRequirement =
                    !allowUnboundThis || !scopeInfo.this || callbackInfo.isLexicalThis;

                if (!supportsThisRequirement || scopeInfo.super || scopeInfo.meta) {
                    return;
                }

                context.report({
                    node,
                    message: "Unexpected function expression.",
                });
            },
        };
    },
};

export default preferArrowCallbackRule;
