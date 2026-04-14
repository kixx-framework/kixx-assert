/**
 * Reports references that occur before the relevant declaration is available.
 */

import { isFunctionLike } from "./utils.js";

function parseOptions(options) {
    if (options === "nofunc") {
        return {
            functions: false,
            classes: true,
            variables: true,
            allowNamedExports: false,
        };
    }

    if (typeof options === "object" && options !== null) {
        return {
            functions: options.functions ?? true,
            classes: options.classes ?? true,
            variables: options.variables ?? true,
            allowNamedExports: options.allowNamedExports ?? false,
        };
    }

    return {
        functions: true,
        classes: true,
        variables: true,
        allowNamedExports: false,
    };
}

function getDefinitionType(variable) {
    const definition = variable.defs[0];
    return definition?.type ?? null;
}

function isRangeInside(inner, outer) {
    return (
        Array.isArray(inner) &&
        Array.isArray(outer) &&
        inner[0] >= outer[0] &&
        inner[1] <= outer[1]
    );
}

function containsBindingIdentifier(node, name) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === "Identifier") {
        return node.name === name;
    }

    switch (node.type) {
        case "AssignmentPattern":
            return containsBindingIdentifier(node.left, name);
        case "Property":
            return containsBindingIdentifier(node.value, name);
        case "ArrayPattern":
            return node.elements.some(element => containsBindingIdentifier(element, name));
        case "ObjectPattern":
            return node.properties.some(property => containsBindingIdentifier(property, name));
        case "RestElement":
            return containsBindingIdentifier(node.argument, name);
        default:
            return false;
    }
}

function isDeferredReference(node) {
    let current = node;
    let parent = node.parent;

    while (parent) {
        if (isFunctionLike(parent)) {
            return parent.body === current;
        }

        if (parent.type === "PropertyDefinition" && parent.value === current) {
            return parent.static !== true;
        }

        if (parent.type === "StaticBlock") {
            return false;
        }

        current = parent;
        parent = parent.parent;
    }

    return false;
}

function isReferenceInClassNameInitializer(referenceNode, classNode) {
    if (isRangeInside(referenceNode.range, classNode?.superClass?.range)) {
        return true;
    }

    let current = referenceNode;
    let parent = referenceNode.parent;

    while (parent && parent !== classNode) {
        if (isFunctionLike(parent)) {
            return false;
        }

        if (parent.type === "ClassDeclaration" || parent.type === "ClassExpression") {
            return false;
        }

        if (
            (parent.type === "MethodDefinition" || parent.type === "PropertyDefinition") &&
            parent.computed === true &&
            parent.key === current
        ) {
            let owner = parent.parent;

            while (owner && owner !== classNode) {
                if (owner.type === "ClassDeclaration" || owner.type === "ClassExpression") {
                    return false;
                }
                owner = owner.parent;
            }

            return owner === classNode;
        }

        if (parent.type === "StaticBlock") {
            return false;
        }

        current = parent;
        parent = parent.parent;
    }

    return false;
}

function shouldCheckReference(variable, config, referenceNode, sourceCode) {
    const referenceScope = sourceCode.getScope(referenceNode);
    const isSameScope = referenceScope === variable.scope;

    switch (getDefinitionType(variable)) {
        case "FunctionName":
            return config.functions;
        case "ClassName":
            return isSameScope || config.classes || !isDeferredReference(referenceNode);
        case "Variable":
        case "Parameter":
            return isSameScope || config.variables || !isDeferredReference(referenceNode);
        default:
            return false;
    }
}

function getDefinitionStart(variable) {
    const definition = variable.defs[0];
    return definition?.name?.range?.[0] ?? null;
}

function isReferenceInOwnInitializer(referenceNode, variable) {
    const definition = variable.defs[0];

    if (!definition || isDeferredReference(referenceNode)) {
        return false;
    }

    switch (definition.type) {
        case "Variable":
            return (
                isRangeInside(referenceNode.range, definition.node?.init?.range) ||
                (
                    (
                        definition.node?.parent?.parent?.type === "ForInStatement" ||
                        definition.node?.parent?.parent?.type === "ForOfStatement"
                    ) &&
                    definition.node.parent.parent.left === definition.node.parent &&
                    isRangeInside(referenceNode.range, definition.node.parent.parent.right?.range)
                ) ||
                (
                    referenceNode.parent?.type === "AssignmentPattern" &&
                    referenceNode.parent.right === referenceNode &&
                    containsBindingIdentifier(referenceNode.parent.left, definition.name?.name)
                )
            );

        case "Parameter":
            return (
                referenceNode.parent?.type === "AssignmentPattern" &&
                referenceNode.parent.right === referenceNode &&
                containsBindingIdentifier(referenceNode.parent.left, definition.name?.name)
            );

        case "ClassName":
            return isReferenceInClassNameInitializer(referenceNode, definition.node);

        default:
            return false;
    }
}

function isInSameOrUpperScope(scope, candidateScope) {
    let current = scope;

    while (current) {
        if (current === candidateScope) {
            return true;
        }
        current = current.upper;
    }

    return false;
}

function isNamedExportReference(node) {
    const parent = node.parent;

    if (!parent) {
        return false;
    }

    return (
        parent.type === "ExportSpecifier" &&
        parent.local === node &&
        parent.parent?.type === "ExportNamedDeclaration"
    );
}

const noUseBeforeDefineRule = {
    meta: {
        type: "problem",
    },

    create(context) {
        const config = parseOptions(context.options[0]);
        const sourceCode = context.sourceCode;
        const ecmaVersion = context.languageOptions?.ecmaVersion ?? 2024;

        return {
            "Program:exit"() {
                const definitionCandidates = [];

                for (const scope of sourceCode.scopeManager.scopes) {
                    for (const variable of scope.variables) {
                        if (!getDefinitionType(variable)) {
                            continue;
                        }

                        const definitionStart = getDefinitionStart(variable);
                        if (definitionStart === null) {
                            continue;
                        }

                        definitionCandidates.push({
                            variable,
                            scope,
                            definition: variable.defs[0],
                            definitionStart,
                        });
                    }
                }

                for (const scope of sourceCode.scopeManager.scopes) {
                    for (const reference of scope.references) {
                        if (config.allowNamedExports && isNamedExportReference(reference.identifier)) {
                            continue;
                        }

                        const variable = reference.resolved;
                        const referenceStart = reference.identifier.range?.[0];

                        if (referenceStart === undefined) {
                            continue;
                        }

                        if (reference.isWrite() && !reference.isRead() && reference.init === true) {
                            continue;
                        }

                        if (variable) {
                            if (!shouldCheckReference(variable, config, reference.identifier, sourceCode)) {
                                continue;
                            }

                            const definitionStart = getDefinitionStart(variable);
                            if (definitionStart === null) {
                                continue;
                            }

                            if (
                                referenceStart < definitionStart ||
                                isReferenceInOwnInitializer(reference.identifier, variable)
                            ) {
                                context.report({
                                    node: reference.identifier,
                                    message: "'{{name}}' was used before it was defined.",
                                    data: { name: reference.identifier.name },
                                });
                            }
                            continue;
                        }

                        const matchingCandidate = definitionCandidates.find(candidate => {
                            if (candidate.variable.name !== reference.identifier.name) {
                                return false;
                            }

                            if (referenceStart >= candidate.definitionStart) {
                                return false;
                            }

                            if (isInSameOrUpperScope(scope, candidate.scope)) {
                                return true;
                            }

                            return (
                                ecmaVersion > 6 &&
                                candidate.definition.type === "FunctionName" &&
                                candidate.scope.type === "block" &&
                                isInSameOrUpperScope(scope, candidate.scope.upper)
                            );
                        });

                        if (matchingCandidate) {
                            context.report({
                                node: reference.identifier,
                                message: "'{{name}}' was used before it was defined.",
                                data: { name: reference.identifier.name },
                            });
                        }
                    }
                }
            },
        };
    },
};

export default noUseBeforeDefineRule;
