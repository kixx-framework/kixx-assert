/**
 * no-unused-private-class-members — disallow unused private class members.
 * Adapted from ESLint's no-unused-private-class-members rule.
 */

function isExpressionValueUsed(node) {
    let current = node;
    let parent = node.parent;

    while (parent) {
        switch (parent.type) {
            case "ChainExpression":
                current = parent;
                parent = parent.parent;
                continue;

            case "ExpressionStatement":
                return false;

            case "SequenceExpression":
                if (parent.expressions[parent.expressions.length - 1] !== current) {
                    return true;
                }
                current = parent;
                parent = parent.parent;
                continue;

            default:
                return true;
        }
    }

    return true;
}

function isInWriteOnlyPattern(node) {
    let current = node;
    let parent = node.parent;

    while (parent) {
        switch (parent.type) {
            case "Property":
                if (parent.value !== current) {
                    return false;
                }
                current = parent;
                parent = parent.parent;
                continue;

            case "AssignmentPattern":
                if (parent.left !== current) {
                    return false;
                }
                current = parent;
                parent = parent.parent;
                continue;

            case "ArrayPattern":
            case "ObjectPattern":
                current = parent;
                parent = parent.parent;
                continue;

            case "RestElement":
                if (parent.argument !== current) {
                    return false;
                }
                current = parent;
                parent = parent.parent;
                continue;

            case "AssignmentExpression":
            case "ForInStatement":
            case "ForOfStatement":
            case "VariableDeclarator":
                return parent.left === current || parent.id === current;

            default:
                return false;
        }
    }

    return false;
}

function getUsage(node) {
    const parent = node.parent;

    if (!parent) {
        return { read: true, write: false, compound: false, update: false };
    }

    switch (parent.type) {
        case "AssignmentExpression":
            if (parent.left !== node) {
                return { read: true, write: false, compound: false, update: false };
            }

            if (parent.operator === "=") {
                return { read: false, write: true, compound: false, update: false };
            }

            return {
                read: isExpressionValueUsed(parent),
                write: true,
                compound: true,
                update: false,
            };

        case "UpdateExpression":
            return {
                read: isExpressionValueUsed(parent),
                write: true,
                compound: false,
                update: true,
            };

        case "ForInStatement":
        case "ForOfStatement":
            if (parent.left === node) {
                return { read: false, write: true, compound: false, update: false };
            }
            return { read: true, write: false, compound: false, update: false };

        default:
            if (isInWriteOnlyPattern(node)) {
                return { read: false, write: true, compound: false, update: false };
            }
            return { read: true, write: false, compound: false, update: false };
    }
}

function createEntry(node, kind) {
    return {
        node,
        kind,
        hasGetter: kind === "getter",
        hasSetter: kind === "setter",
    };
}

const noUnusedPrivateClassMembersRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        // Stack of class info objects, one per class body
        const classStack = [];

        function currentClassWithDefinition(name) {
            let i = classStack.length - 1;

            while (i >= 0) {
                if (classStack[i].defined.has(name)) {
                    return classStack[i];
                }

                i -= 1;
            }
            return null;
        }

        return {
            ClassBody() {
                classStack.push({
                    defined: new Map(), // name -> definitionNode
                    used: new Set(),    // names used
                });
            },
            "ClassBody:exit"() {
                const info = classStack.pop();
                if (!info) return;
                for (const [name, defEntry] of info.defined) {
                    if (!info.used.has(name)) {
                        context.report({
                            node: defEntry.node,
                            message: `'#${name}' is defined but never used.`,
                        });
                    }
                }
            },
            // Track private field/method definitions
            PropertyDefinition(node) {
                if (!node.key || node.key.type !== "PrivateIdentifier") return;
                const info = classStack[classStack.length - 1] || null;
                if (!info) return;
                info.defined.set(node.key.name, createEntry(node, "field"));
            },
            MethodDefinition(node) {
                if (!node.key || node.key.type !== "PrivateIdentifier") return;
                const info = classStack[classStack.length - 1] || null;
                if (!info) return;
                const name = node.key.name;
                const existing = info.defined.get(name);

                if (node.kind === "get" || node.kind === "set") {
                    const entry = existing ?? createEntry(node, node.kind === "get" ? "getter" : "setter");
                    if (!entry.node) {
                        entry.node = node;
                    }
                    entry.hasGetter ||= node.kind === "get";
                    entry.hasSetter ||= node.kind === "set";
                    info.defined.set(name, entry);
                    return;
                }

                info.defined.set(name, createEntry(node, "method"));
            },
            // Track private member accesses
            MemberExpression(node) {
                if (!node.property || node.property.type !== "PrivateIdentifier") return;
                const info = currentClassWithDefinition(node.property.name);
                if (!info) {
                    return;
                }

                const entry = info.defined.get(node.property.name);
                const usage = getUsage(node);

                if (!entry) {
                    return;
                }

                if (entry.kind === "field" || entry.kind === "method") {
                    if (usage.read) {
                        info.used.add(node.property.name);
                    }
                    return;
                }

                if (usage.read && entry.hasGetter) {
                    info.used.add(node.property.name);
                    return;
                }

                if (usage.write && entry.hasSetter) {
                    info.used.add(node.property.name);
                    return;
                }

                if ((usage.compound || usage.update) && entry.hasGetter && entry.hasSetter) {
                    info.used.add(node.property.name);
                }
            },
        };
    },
};

export default noUnusedPrivateClassMembersRule;
