/**
 * no-dupe-keys — disallow duplicate keys in object literals.
 * Adapted from ESLint's no-dupe-keys rule.
 */

function getStaticPropertyValue(node, sourceCode) {
    if (node.type === "Identifier") return node.name;
    if (node.type === "Literal") {
        if (node.regex) {
            return sourceCode.getText(node);
        }
        if (typeof node.value === "bigint") {
            return String(node.value);
        }
        return String(node.value);
    }
    if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
        return node.quasis[0].value.cooked;
    }
    return null;
}

function getPropertyName(property, sourceCode) {
    if (!property.computed) {
        return getStaticPropertyValue(property.key, sourceCode);
    }

    if (
        property.key.type === "Literal" ||
        (property.key.type === "TemplateLiteral" && property.key.expressions.length === 0)
    ) {
        return getStaticPropertyValue(property.key, sourceCode);
    }

    return null;
}

function getPropertyKind(property) {
    if (property.kind === "get" || property.kind === "set") {
        return property.kind;
    }

    return "value";
}

function isProtoSetter(property, sourceCode) {
    return (
        property.type === "Property" &&
        property.kind === "init" &&
        !property.computed &&
        !property.shorthand &&
        !property.method &&
        getStaticPropertyValue(property.key, sourceCode) === "__proto__"
    );
}

function isDuplicatePropertyKind(kind, state) {
    if (kind === "get") {
        return state.get || state.value;
    }

    if (kind === "set") {
        return state.set || state.value;
    }

    return state.get || state.set || state.value;
}

const noDupeKeysRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        const sourceCode = context.sourceCode;

        return {
            ObjectExpression(node) {
                const seenKeys = new Map();

                for (const prop of node.properties) {
                    if (prop.type !== "Property" || isProtoSetter(prop, sourceCode)) {
                        continue;
                    }

                    const name = getPropertyName(prop, sourceCode);
                    if (name === null) continue;

                    const kind = getPropertyKind(prop);
                    const state = seenKeys.get(name) ?? { get: false, set: false, value: false };
                    const isDuplicate = isDuplicatePropertyKind(kind, state);

                    if (isDuplicate) {
                        context.report({
                            node: prop,
                            message: `Duplicate key '${name}'.`,
                        });
                    }

                    state[kind] = true;
                    seenKeys.set(name, state);
                }
            },
        };
    },
};

export default noDupeKeysRule;
