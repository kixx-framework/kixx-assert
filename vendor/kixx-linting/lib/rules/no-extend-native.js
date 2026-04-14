/**
 * no-extend-native — disallow extending native types.
 * Adapted from ESLint's no-extend-native rule.
 */

import { hasShadowingDefinition } from "./utils.js";

// Native prototype objects whose .prototype should not be modified
const NATIVE_OBJECTS = new Set([
    "Array", "ArrayBuffer", "Boolean", "DataView", "Date",
    "Error", "EvalError", "Float32Array", "Float64Array", "Function",
    "Int16Array", "Int32Array", "Int8Array", "JSON", "Map", "Math",
    "Number", "Object", "Promise", "Proxy", "RangeError", "ReferenceError",
    "RegExp", "Set", "String", "Symbol", "SyntaxError", "TypeError",
    "Uint16Array", "Uint32Array", "Uint8Array", "Uint8ClampedArray",
    "URIError", "WeakMap", "WeakSet", "BigInt", "WeakRef",
    "FinalizationRegistry", "AggregateError",
]);

function unwrapExpression(node) {
    while (node?.type === "ChainExpression") {
        node = node.expression;
    }

    return node;
}

function isPropertyNamed(node, name) {
    return (
        (node?.type === "Identifier" && node.name === name) ||
        (node?.type === "Literal" && node.value === name)
    );
}

function isGlobalBuiltinIdentifier(node, name, sourceCode) {
    if (node?.type !== "Identifier" || node.name !== name) {
        return false;
    }

    return !hasShadowingDefinition(sourceCode, node, name, { includeGlobal: false });
}

function getNativePrototypeBase(node, sourceCode) {
    const target = unwrapExpression(node);
    if (target?.type !== "MemberExpression") return null;

    const prototypeObject = isPropertyNamed(target.property, "prototype")
        ? target
        : unwrapExpression(target.object);
    if (prototypeObject?.type !== "MemberExpression") return null;
    if (!isPropertyNamed(prototypeObject.property, "prototype")) return null;

    const object = unwrapExpression(prototypeObject.object);
    if (object?.type !== "Identifier") return null;
    if (!NATIVE_OBJECTS.has(object.name)) return null;
    if (!isGlobalBuiltinIdentifier(object, object.name, sourceCode)) return null;

    return object.name;
}

function isNativePrototypeAssignment(node, sourceCode) {
    if (node.type !== "AssignmentExpression") return null;

    return getNativePrototypeBase(node.left, sourceCode);
}

function isNativePrototypeDefineProperty(node, sourceCode) {
    const call = unwrapExpression(node);
    if (call?.type !== "CallExpression") return null;

    const callee = unwrapExpression(call.callee);
    if (callee?.type !== "MemberExpression") return null;
    if (!isPropertyNamed(callee.property, "defineProperty") && !isPropertyNamed(callee.property, "defineProperties")) {
        return null;
    }
    if (!isGlobalBuiltinIdentifier(unwrapExpression(callee.object), "Object", sourceCode)) {
        return null;
    }

    const target = call.arguments?.[0];
    if (!target) return null;

    return getNativePrototypeBase(target, sourceCode);
}

const noExtendNativeRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    exceptions: {
                        type: "array",
                        items: { type: "string" },
                        uniqueItems: true,
                    },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const exceptions = new Set(context.options[0]?.exceptions ?? []);

        return {
            AssignmentExpression(node) {
                const nativeName = isNativePrototypeAssignment(node, context.sourceCode);
                if (nativeName && !exceptions.has(nativeName)) {
                    context.report({
                        node,
                        message: `${nativeName} prototype is read only, properties should not be added.`,
                    });
                }
            },
            CallExpression(node) {
                const nativeName = isNativePrototypeDefineProperty(node, context.sourceCode);
                if (nativeName && !exceptions.has(nativeName)) {
                    context.report({
                        node,
                        message: `${nativeName} prototype is read only, properties should not be added.`,
                    });
                }
            },
        };
    },
};

export default noExtendNativeRule;
