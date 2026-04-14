/**
 * no-setter-return — disallow returning values from setters.
 * Adapted from ESLint's no-setter-return rule.
 */

import { getPropertyKeyName, getStaticPropertyKeyName, isDisabledGlobal } from "./utils.js";

const DIRECT_DESCRIPTOR_CALLS = new Set(["Object.defineProperty", "Reflect.defineProperty"]);
const NESTED_DESCRIPTOR_CALLS = new Set(["Object.defineProperties", "Object.create"]);

function getCalleeInfo(node) {
    if (!node) return null;

    if (node.type === "ChainExpression") {
        return getCalleeInfo(node.expression);
    }

    if (node.type !== "MemberExpression") {
        return null;
    }

    if (node.object.type !== "Identifier") {
        return null;
    }

    let propertyName = null;
    if (node.computed) {
        propertyName = getStaticPropertyKeyName(node.property, { allowIdentifier: false });
    } else if (node.property.type === "Identifier") {
        propertyName = node.property.name;
    }

    if (!propertyName) {
        return null;
    }

    return {
        objectNode: node.object,
        objectName: node.object.name,
        propertyName,
    };
}

function isShadowedReference(identifierNode, sourceCode) {
    return Boolean(sourceCode.getResolvedVariable(identifierNode)?.defs.length);
}

function isTargetCallee(callNode, context, isDisabledGlobalName) {
    const info = getCalleeInfo(callNode.callee);
    if (!info) return false;

    const fullName = `${info.objectName}.${info.propertyName}`;

    if (!DIRECT_DESCRIPTOR_CALLS.has(fullName) && !NESTED_DESCRIPTOR_CALLS.has(fullName)) {
        return false;
    }

    if (isDisabledGlobalName(info.objectName)) {
        return false;
    }

    if (isShadowedReference(info.objectNode, context.sourceCode)) {
        return false;
    }

    return true;
}

function isDescriptorArg(objectExpr, context, isDisabledGlobalName) {
    const parent = objectExpr.parent;
    if (!parent) return false;

    if (parent.type === "CallExpression" && parent.arguments[2] === objectExpr) {
        if (!isTargetCallee(parent, context, isDisabledGlobalName)) return false;

        const info = getCalleeInfo(parent.callee);
        if (!info) return false;
        return DIRECT_DESCRIPTOR_CALLS.has(`${info.objectName}.${info.propertyName}`);
    }

    if (parent.type === "Property" && parent.value === objectExpr) {
        const grandparent = parent.parent;
        if (grandparent && grandparent.type === "ObjectExpression") {
            const callNode = grandparent.parent;
            if (callNode && callNode.type === "CallExpression" && callNode.arguments[1] === grandparent) {
                if (!isTargetCallee(callNode, context, isDisabledGlobalName)) return false;

                const info = getCalleeInfo(callNode.callee);
                if (!info) return false;
                return NESTED_DESCRIPTOR_CALLS.has(`${info.objectName}.${info.propertyName}`);
            }
        }
    }

    return false;
}

function isSetterInDescriptor(node, context, isDisabledGlobalName) {
    const parent = node.parent;
    if (!parent || parent.type !== "Property" || parent.value !== node) return false;

    if (getPropertyKeyName(parent) !== "set") return false;

    const descriptor = parent.parent;
    if (!descriptor || descriptor.type !== "ObjectExpression") return false;

    return isDescriptorArg(descriptor, context, isDisabledGlobalName);
}

function isSetter(node, context, isDisabledGlobalName) {
    const parent = node.parent;
    if (!parent) return false;

    if (parent.type === "Property" && parent.kind === "set" && parent.value === node) {
        return true;
    }

    if (parent.type === "MethodDefinition" && parent.kind === "set" && parent.value === node) {
        return true;
    }

    if (isSetterInDescriptor(node, context, isDisabledGlobalName)) {
        return true;
    }

    return false;
}

function findReturnStatements(node) {
    const returns = [];

    function walk(n) {
        if (!n || typeof n !== "object") return;

        if (
            n !== node && (
                n.type === "FunctionDeclaration" ||
                n.type === "FunctionExpression" ||
                n.type === "ArrowFunctionExpression"
            )
        ) {
            return;
        }

        if (n.type === "ReturnStatement") {
            returns.push(n);
        }

        for (const key of Object.keys(n)) {
            if (key === "parent") continue;
            const child = n[key];
            if (Array.isArray(child)) {
                child.forEach(walk);
            } else if (child && typeof child === "object" && child.type) {
                walk(child);
            }
        }
    }

    walk(node.body);
    return returns;
}

const noSetterReturnRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        const isDisabledGlobalName = name => isDisabledGlobal(context, name);

        function checkFunction(node) {
            if (!isSetter(node, context, isDisabledGlobalName)) return;

            if (node.type === "ArrowFunctionExpression" && node.expression) {
                context.report({
                    node,
                    message: "Setter cannot return a value.",
                });
                return;
            }

            const returns = findReturnStatements(node);
            for (const ret of returns) {
                if (ret.argument) {
                    context.report({
                        node: ret,
                        message: "Setter cannot return a value.",
                    });
                }
            }
        }

        return {
            FunctionExpression: checkFunction,
            ArrowFunctionExpression: checkFunction,
        };
    },
};

export default noSetterReturnRule;
