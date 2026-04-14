/**
 * Prefers `const` for bindings that are never reassigned.
 */

const PATTERN_TYPE = /^(?:.+?Pattern|RestElement|SpreadProperty|ExperimentalRestProperty|Property)$/u;
const DECLARATION_HOST_TYPE = /^(?:Program|BlockStatement|StaticBlock|SwitchCase)$/u;
const DESTRUCTURING_HOST_TYPE = /^(?:VariableDeclarator|AssignmentExpression)$/u;

function isInitOfForStatement(node) {
    return node.parent?.type === "ForStatement" && node.parent.init === node;
}

function canBecomeVariableDeclaration(identifier) {
    let node = identifier.parent;

    while (node && PATTERN_TYPE.test(node.type)) {
        node = node.parent;
    }

    return Boolean(
        node && (
            node.type === "VariableDeclarator" ||
            (
                node.type === "AssignmentExpression" &&
                node.parent?.type === "ExpressionStatement" &&
                DECLARATION_HOST_TYPE.test(node.parent.parent?.type ?? "")
            )
        ),
    );
}

function getVariableByName(scope, name) {
    let current = scope;

    while (current) {
        const variable = current.set?.get(name);

        if (variable) {
            return variable;
        }

        current = current.upper;
    }

    return null;
}

function isOuterVariableInDestructuring(name, initScope) {
    if (!name) {
        return false;
    }

    if (
        initScope.through.some((reference) => {
            return reference.resolved && reference.resolved.name === name;
        })
    ) {
        return true;
    }

    const variable = getVariableByName(initScope, name);

    if (variable !== null) {
        return variable.defs.some(definition => definition.type === "Parameter");
    }

    return false;
}

function getDestructuringHost(reference) {
    if (!reference.isWrite()) {
        return null;
    }

    let node = reference.identifier.parent;

    while (node && PATTERN_TYPE.test(node.type)) {
        node = node.parent;
    }

    if (!node || !DESTRUCTURING_HOST_TYPE.test(node.type)) {
        return null;
    }

    return node;
}

function hasMemberExpressionAssignment(node) {
    if (!node) {
        return false;
    }

    switch (node.type) {
        case "ObjectPattern":
            return node.properties.some(property => {
                if (!property) {
                    return false;
                }

                return hasMemberExpressionAssignment(property.argument || property.value);
            });

        case "ArrayPattern":
            return node.elements.some(element => hasMemberExpressionAssignment(element));

        case "AssignmentPattern":
            return hasMemberExpressionAssignment(node.left);

        case "MemberExpression":
            return true;

        default:
            return false;
    }
}

function isNestedExecutionScope(reference, variable) {
    let scope = reference.from;

    while (scope && scope !== variable.scope) {
        if (
            scope.type === "function" ||
            scope.type === "module" ||
            scope.type === "global" ||
            scope.type === "class-field-initializer" ||
            scope.type === "class-static-block"
        ) {
            return true;
        }

        scope = scope.upper;
    }

    return false;
}

function getAssignedName(node) {
    if (!node) {
        return null;
    }

    switch (node.type) {
        case "Identifier":
            return node.name;
        case "AssignmentPattern":
            return getAssignedName(node.left);
        default:
            return null;
    }
}

function getIdentifierIfShouldBeConst(variable, ignoreReadBeforeAssign, excludedNames) {
    if (!variable || variable.defs.length === 0) {
        return null;
    }

    if (variable.eslintUsed && variable.scope.type === "global") {
        return null;
    }

    if (excludedNames.has(variable.name)) {
        return null;
    }

    let writer = null;
    let isReadBeforeInit = false;

    for (const reference of variable.references) {
        if (reference.isWrite()) {
            const isReassigned =
                writer !== null && writer.identifier !== reference.identifier;

            if (isReassigned) {
                return null;
            }

            if (reference.init !== true && isNestedExecutionScope(reference, variable)) {
                return null;
            }

            const destructuringHost = getDestructuringHost(reference);

            if (destructuringHost !== null && destructuringHost.left !== undefined) {
                const leftNode = destructuringHost.left;
                let hasOuterVariables = false;
                let hasNonIdentifiers = false;

                if (leftNode.type === "ObjectPattern") {
                    hasOuterVariables = leftNode.properties
                        .map(property => getAssignedName(property?.value ?? property?.argument))
                        .some(name => isOuterVariableInDestructuring(name, variable.scope));
                    hasNonIdentifiers = hasMemberExpressionAssignment(leftNode);
                } else if (leftNode.type === "ArrayPattern") {
                    hasOuterVariables = leftNode.elements
                        .map(element => getAssignedName(element))
                        .some(name => isOuterVariableInDestructuring(name, variable.scope));
                    hasNonIdentifiers = hasMemberExpressionAssignment(leftNode);
                }

                if (hasOuterVariables || hasNonIdentifiers) {
                    return null;
                }
            }

            writer = reference;
        } else if (reference.isRead() && writer === null) {
            if (ignoreReadBeforeAssign) {
                return null;
            }

            isReadBeforeInit = true;
        }
    }

    const shouldBeConst =
        writer !== null &&
        writer.from === variable.scope &&
        canBecomeVariableDeclaration(writer.identifier);

    if (!shouldBeConst) {
        return null;
    }

    if (isReadBeforeInit) {
        return variable.defs[0]?.name ?? null;
    }

    return writer.identifier;
}

function groupByDestructuring(variables, ignoreReadBeforeAssign, excludedNames) {
    const identifierMap = new Map();

    for (const variable of variables) {
        const identifier = getIdentifierIfShouldBeConst(
            variable,
            ignoreReadBeforeAssign,
            excludedNames,
        );

        let previousIdentifier = null;
        let groupedByDestructuring = false;

        for (const reference of variable.references) {
            const currentIdentifier = reference.identifier;

            if (currentIdentifier === previousIdentifier) {
                continue;
            }
            previousIdentifier = currentIdentifier;

            const group = getDestructuringHost(reference);

            if (!group) {
                continue;
            }

            groupedByDestructuring = true;

            const nodes = identifierMap.get(group);

            if (nodes) {
                nodes.push(identifier);
            } else {
                identifierMap.set(group, [identifier]);
            }
        }

        if (!identifier) {
            continue;
        }

        if (!groupedByDestructuring && !identifierMap.has(identifier)) {
            identifierMap.set(identifier, [identifier]);
        }
    }

    return identifierMap;
}

function parseExcludedVariableNames(sourceCode) {
    const excluded = new Set();

    for (const statement of sourceCode.ast.body) {
        if (statement.type === "ExportNamedDeclaration") {
            if (statement.declaration) {
                for (const variable of sourceCode.getDeclaredVariables(statement.declaration)) {
                    excluded.add(variable.name);
                }
            }

            for (const specifier of statement.specifiers ?? []) {
                if (specifier.local?.type === "Identifier") {
                    excluded.add(specifier.local.name);
                }
            }
        }

        if (statement.type === "ExportDefaultDeclaration" && statement.declaration) {
            for (const variable of sourceCode.getDeclaredVariables(statement.declaration)) {
                excluded.add(variable.name);
            }
        }
    }

    for (const comment of sourceCode.getAllComments()) {
        const exportedMatch = comment.value.match(/^\s*exported\s+([^*]+?)\s*$/u);

        if (exportedMatch) {
            for (const name of exportedMatch[1].split(/\s*,\s*|\s+/u)) {
                if (name) {
                    excluded.add(name);
                }
            }
        }

    }

    return excluded;
}

const DEFAULT_OPTIONS = {
    destructuring: "any",
    ignoreReadBeforeAssign: false,
};

const MESSAGE = "'{{name}}' is never reassigned. Use 'const' instead.";

const preferConstRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    destructuring: { enum: ["any", "all"] },
                    ignoreReadBeforeAssign: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const option = { ...DEFAULT_OPTIONS, ...(context.options[0] ?? {}) };
        const shouldMatchAnyDestructuredVariable = option.destructuring !== "all";
        const variables = [];

        return {
            VariableDeclaration(node) {
                if (node.kind !== "let" || isInitOfForStatement(node)) {
                    return;
                }

                variables.push(...sourceCode.getDeclaredVariables(node));
            },

            "Program:exit"() {
                const excludedNames = parseExcludedVariableNames(sourceCode);
                const grouped = groupByDestructuring(
                    variables,
                    option.ignoreReadBeforeAssign,
                    excludedNames,
                );

                for (const nodes of grouped.values()) {
                    const nodesToReport = nodes.filter(Boolean);

                    if (
                        nodes.length === 0 ||
                        (
                            !shouldMatchAnyDestructuredVariable &&
                            nodesToReport.length !== nodes.length
                        )
                    ) {
                        continue;
                    }

                    for (const node of nodesToReport) {
                        context.report({
                            node,
                            message: MESSAGE,
                            data: { name: node.name },
                        });
                    }
                }
            },
        };
    },
};

export default preferConstRule;
