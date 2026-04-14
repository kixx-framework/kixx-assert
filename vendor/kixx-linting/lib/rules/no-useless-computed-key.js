/**
 * no-useless-computed-key — disallow unnecessary computed property keys in objects and classes.
 * Adapted from ESLint's no-useless-computed-key rule.
 */

function isUselessComputedKey(key) {
    if (!key) return false;
    // ["foo"] — string literal
    if (key.type === "Literal" && typeof key.value === "string") return true;
    // [0] or [1.5] — number literal (but not NaN/Infinity as identifiers)
    if (key.type === "Literal" && typeof key.value === "number") return true;
    return false;
}

function getKeyName(key) {
    if (key.type === "Literal") return JSON.stringify(key.value);
    return null;
}

function isProtoKey(node) {
    return node.type === "Property" &&
        node.parent?.type === "ObjectExpression" &&
        node.key?.type === "Literal" &&
        node.key.value === "__proto__";
}

function isSpecialClassMemberName(node) {
    if (node.key?.type !== "Literal" || typeof node.key.value !== "string") {
        return false;
    }

    if (node.type === "PropertyDefinition") {
        return node.key.value === "constructor" ||
            (node.static && node.key.value === "prototype");
    }

    return (!node.static && node.key.value === "constructor") ||
        (node.static && node.key.value === "prototype");
}

function shouldReport(node, enforceForClassMembers) {
    if (!node.computed || !isUselessComputedKey(node.key)) {
        return false;
    }

    if (node.type === "Property") {
        return !isProtoKey(node);
    }

    if (node.type === "MethodDefinition" || node.type === "PropertyDefinition") {
        return enforceForClassMembers && !isSpecialClassMemberName(node);
    }

    return false;
}

const noUselessComputedKeyRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    enforceForClassMembers: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const enforceForClassMembers = context.options[0]?.enforceForClassMembers ?? true;

        function checkNode(node) {
            if (!shouldReport(node, enforceForClassMembers)) {
                return;
            }

            context.report({
                node,
                message: `Unnecessarily computed property [${getKeyName(node.key)}] found.`,
            });
        }

        return {
            Property: checkNode,
            MethodDefinition: checkNode,
            PropertyDefinition: checkNode,
        };
    },
};

export default noUselessComputedKeyRule;
