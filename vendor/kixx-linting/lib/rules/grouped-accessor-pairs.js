/**
 * grouped-accessor-pairs — require grouped accessor pairs in object literals and classes.
 * Adapted from ESLint's grouped-accessor-pairs rule.
 */

function getStaticComputedKey(node) {
    if (!node.computed || !node.key) {
        return null;
    }

    if (node.key.type === "Literal") {
        return String(node.key.value);
    }

    if (
        node.key.type === "TemplateLiteral" &&
        node.key.expressions.length === 0
    ) {
        return node.key.quasis[0]?.value.cooked ?? "";
    }

    return null;
}

function getNormalizedPropertyKey(node, sourceCode) {
    if (!node.key) return null;

    const staticComputedKey = getStaticComputedKey(node);
    if (staticComputedKey !== null) {
        return { compare: `public:${staticComputedKey}`, display: staticComputedKey };
    }

    if (node.computed) {
        const text = `[${sourceCode.getText(node.key)}]`;
        return { compare: `computed:${text}`, display: text };
    }

    if (node.key.type === "Identifier") {
        return { compare: `public:${node.key.name}`, display: node.key.name };
    }
    if (node.key.type === "PrivateIdentifier") {
        return { compare: `private:#${node.key.name}`, display: `#${node.key.name}` };
    }
    if (node.key.type === "Literal") {
        return { compare: `public:${String(node.key.value)}`, display: String(node.key.value) };
    }
    if (
        node.key.type === "TemplateLiteral" &&
        node.key.expressions.length === 0
    ) {
        const text = node.key.quasis[0]?.value.cooked ?? "";
        return { compare: `public:${text}`, display: text };
    }

    const text = sourceCode.getText(node.key);
    return { compare: `public:${text}`, display: text };
}

function checkAccessors(nodes, context, order, sourceCode) {
    // Build a map of key -> [{kind, node, index}]
    const accessorMap = new Map();

    nodes.forEach((member, index) => {
        const kind = member.kind; // "get" or "set" for property, "get"/"set" for method
        if (kind !== "get" && kind !== "set") return;
        const key = getNormalizedPropertyKey(member, sourceCode);
        if (key === null) return;
        const isStatic = member.static || false;
        const mapKey = `${isStatic ? "static:" : ""}${key.compare}`;
        if (!accessorMap.has(mapKey)) {
            accessorMap.set(mapKey, []);
        }
        accessorMap.get(mapKey).push({ kind, node: member, index });
    });

    for (const [, accessors] of accessorMap) {
        if (accessors.length < 2) continue;
        const getterCount = accessors.filter(a => a.kind === "get").length;
        const setterCount = accessors.filter(a => a.kind === "set").length;
        if (getterCount > 1 || setterCount > 1) continue;
        const getter = accessors.find(a => a.kind === "get");
        const setter = accessors.find(a => a.kind === "set");
        if (!getter || !setter) continue;

        // Check adjacency: they should be next to each other
        const diff = Math.abs(getter.index - setter.index);
        if (diff !== 1) {
            context.report({
                node: setter.node,
                message: `Accessor pair for '${getNormalizedPropertyKey(setter.node, sourceCode).display}' should be grouped.`,
            });
            continue;
        }

        // Check order
        if (order === "getBeforeSet" && getter.index > setter.index) {
            context.report({
                node: getter.node,
                message: `Getter should come before setter for '${getNormalizedPropertyKey(getter.node, sourceCode).display}'.`,
            });
        } else if (order === "setBeforeGet" && setter.index > getter.index) {
            context.report({
                node: setter.node,
                message: `Setter should come before getter for '${getNormalizedPropertyKey(setter.node, sourceCode).display}'.`,
            });
        }
    }
}

const groupedAccessorPairsRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                enum: ["anyOrder", "getBeforeSet", "setBeforeGet"],
            },
        ],
    },
    create(context) {
        const order = context.options[0] ?? "anyOrder";
        const sourceCode = context.sourceCode;

        return {
            ObjectExpression(node) {
                checkAccessors(node.properties, context, order, sourceCode);
            },
            ClassBody(node) {
                checkAccessors(node.body, context, order, sourceCode);
            },
        };
    },
};

export default groupedAccessorPairsRule;
