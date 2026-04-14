/**
 * Reports `this` expressions that occur outside valid runtime contexts.
 */

import { isFunctionLike } from "./utils.js";

function hasUseStrictDirective(bodyNode) {
    if (!bodyNode || (bodyNode.type !== "BlockStatement" && bodyNode.type !== "Program")) {
        return false;
    }

    const statements = bodyNode.body || [];

    for (const stmt of statements) {
        if (stmt.type !== "ExpressionStatement") {
            return false;
        }
        if (stmt.expression.type !== "Literal" || stmt.expression.value !== "use strict") {
            return false;
        }
        return true;
    }

    return false;
}

function isInStrictCode(node, sourceType) {
    let current = node;

    while (current) {
        if (current.type === "Program") {
            if (sourceType === "module") {
                return true;
            }
            return hasUseStrictDirective(current);
        }

        if (current.type === "ClassBody" || current.type === "StaticBlock") {
            return true;
        }

        if (isFunctionLike(current) && hasUseStrictDirective(current.body)) {
            return true;
        }

        current = current.parent;
    }

    return false;
}

function getThisBindingTarget(node) {
    let current = node.parent;

    while (current) {
        if (current.type === "ArrowFunctionExpression") {
            current = current.parent;
            continue;
        }

        if (
            current.type === "FunctionDeclaration" ||
            current.type === "FunctionExpression" ||
            current.type === "Program" ||
            current.type === "StaticBlock" ||
            current.type === "PropertyDefinition"
        ) {
            return current;
        }

        current = current.parent;
    }

    return null;
}

function isMethodFunction(node) {
    const parent = node.parent;

    return (
        parent?.type === "MethodDefinition" ||
        (parent?.type === "Property" && parent.value === node)
    );
}

function isBoundOrInvokedFunction(node) {
    const parent = node.parent;

    if (parent?.type === "MemberExpression" && parent.object === node) {
        const propName = parent.property?.name;
        return propName === "bind" || propName === "call" || propName === "apply";
    }

    if (parent?.type === "ChainExpression") {
        return isBoundOrInvokedFunction(parent);
    }

    if (parent?.type === "CallExpression") {
        if (parent.callee === node) {
            return false;
        }

        if (parent.callee?.type === "MemberExpression" && parent.callee.object === node) {
            const propName = parent.callee.property?.name;
            return propName === "bind" || propName === "call" || propName === "apply";
        }

        const argIndex = parent.arguments.indexOf(node);
        if (argIndex !== -1 && parent.arguments.length > argIndex + 1) {
            // Heuristic: callback with explicit thisArg
            return true;
        }
    }

    return false;
}

function isAssignedToMember(node) {
    let current = node;
    let parent = current.parent;

    while (parent) {
        if (parent.type === "LogicalExpression" && parent.right === current) {
            current = parent;
            parent = current.parent;
            continue;
        }

        if (
            parent.type === "ConditionalExpression" &&
            (parent.consequent === current || parent.alternate === current)
        ) {
            current = parent;
            parent = current.parent;
            continue;
        }

        if (parent.type === "ChainExpression") {
            current = parent;
            parent = current.parent;
            continue;
        }

        break;
    }

    return (
        parent?.type === "AssignmentExpression" &&
        parent.right === current &&
        parent.left?.type === "MemberExpression"
    );
}

function isLikelyConstructorFunction(node, capIsConstructor) {
    if (!capIsConstructor) {
        return false;
    }

    if (node.id?.name && /^[A-Z]/u.test(node.id.name)) {
        return true;
    }

    const parent = node.parent;

    if (parent?.type === "VariableDeclarator" && parent.init === node && parent.id?.type === "Identifier") {
        return /^[A-Z]/u.test(parent.id.name);
    }

    if (parent?.type === "AssignmentExpression" && parent.right === node) {
        if (parent.left?.type === "Identifier") {
            return /^[A-Z]/u.test(parent.left.name);
        }
        if (parent.left?.type === "MemberExpression" && parent.left.property?.type === "Identifier") {
            return /^[A-Z]/u.test(parent.left.property.name);
        }
    }

    return false;
}

function isValidFunctionThisContext(node, capIsConstructor) {
    return (
        isMethodFunction(node) ||
        isBoundOrInvokedFunction(node) ||
        isAssignedToMember(node) ||
        isLikelyConstructorFunction(node, capIsConstructor)
    );
}

const noInvalidThisRule = {
    meta: {
        type: "suggestion",
    },

    create(context) {
        const capIsConstructor = context.options[0]?.capIsConstructor !== false;
        const sourceType = context.languageOptions?.sourceType ?? "module";

        return {
            ThisExpression(node) {
                if (!isInStrictCode(node, sourceType)) {
                    return;
                }

                const bindingTarget = getThisBindingTarget(node);

                if (!bindingTarget) {
                    return;
                }

                if (bindingTarget.type === "StaticBlock" || bindingTarget.type === "PropertyDefinition") {
                    return;
                }

                if (bindingTarget.type === "Program") {
                    if (sourceType !== "module") {
                        return;
                    }
                    context.report({
                        node,
                        message: "Unexpected 'this'.",
                    });
                    return;
                }

                if (!isValidFunctionThisContext(bindingTarget, capIsConstructor)) {
                    context.report({
                        node,
                        message: "Unexpected 'this'.",
                    });
                }
            },
        };
    },
};

export default noInvalidThisRule;
