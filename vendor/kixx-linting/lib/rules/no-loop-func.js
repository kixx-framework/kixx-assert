/**
 * Reports functions defined in loops when they can capture loop state unsafely.
 */

const CONSTANT_BINDINGS = new Set(["const", "using", "await using"]);

function isIIFE(node) {
    return (
        (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") &&
        node.parent?.type === "CallExpression" &&
        node.parent.callee === node
    );
}

function getContainingLoopNode(node, skippedIifeNodes) {
    for (let currentNode = node; currentNode.parent; currentNode = currentNode.parent) {
        const parent = currentNode.parent;

        switch (parent.type) {
            case "WhileStatement":
            case "DoWhileStatement":
                return parent;

            case "ForStatement":
                if (parent.init !== currentNode) {
                    return parent;
                }
                break;

            case "ForInStatement":
            case "ForOfStatement":
                if (parent.right !== currentNode) {
                    return parent;
                }
                break;

            case "ArrowFunctionExpression":
            case "FunctionExpression":
            case "FunctionDeclaration":
                if (skippedIifeNodes.has(parent)) {
                    break;
                }
                return null;

            default:
                break;
        }
    }

    return null;
}

function getTopLoopNode(node, skippedIifeNodes, excludedNode) {
    const border = excludedNode ? excludedNode.range[1] : 0;
    let result = node;
    let containingLoopNode = node;

    while (containingLoopNode && containingLoopNode.range[0] >= border) {
        result = containingLoopNode;
        containingLoopNode = getContainingLoopNode(containingLoopNode, skippedIifeNodes);
    }

    return result;
}

function isSafe(loopNode, reference, skippedIifeNodes) {
    const variable = reference.resolved;
    const definition = variable?.defs?.[0];
    const declaration = definition?.parent;
    const kind =
        declaration?.type === "VariableDeclaration"
            ? declaration.kind
            : "";

    if (CONSTANT_BINDINGS.has(kind)) {
        return true;
    }

    if (
        kind === "let" &&
        declaration.range[0] > loopNode.range[0] &&
        declaration.range[1] < loopNode.range[1]
    ) {
        return true;
    }

    const border = getTopLoopNode(
        loopNode,
        skippedIifeNodes,
        kind === "let" ? declaration : null,
    ).range[0];

    return variable.references.every(upperReference => {
        const identifier = upperReference.identifier;
        return (
            !upperReference.isWrite() ||
            (variable.scope.variableScope === upperReference.from.variableScope &&
                identifier.range[0] < border)
        );
    });
}

const noLoopFuncRule = {
    meta: {
        type: "suggestion",
    },

    create(context) {
        const skippedIifeNodes = new Set();
        const sourceCode = context.sourceCode;

        function getReferences(node) {
            const scope = sourceCode.scopeManager.acquire(node, true) || sourceCode.getScope(node);
            return scope.through;
        }

        function checkForLoops(node) {
            const loopNode = getContainingLoopNode(node, skippedIifeNodes);
            if (!loopNode) {
                return;
            }

            const references = getReferences(node);

            if (!(node.async || node.generator) && isIIFE(node)) {
                const isFunctionReferenced =
                    node.type === "FunctionExpression" &&
                    node.id &&
                    references.some(reference => reference.identifier.name === node.id.name);

                if (!isFunctionReferenced) {
                    skippedIifeNodes.add(node);
                    return;
                }
            }

            const unsafeReferences = [
                ...new Set(
                    references
                        .filter(reference => reference.resolved && !isSafe(loopNode, reference, skippedIifeNodes))
                        .map(reference => reference.identifier.name),
                ),
            ];

            if (unsafeReferences.length === 0) {
                return;
            }

            context.report({
                node,
                message:
                    "Function declared in a loop contains unsafe references to variable(s) {{names}}.",
                data: { names: `'${unsafeReferences.join("', '")}'` },
            });
        }

        return {
            ArrowFunctionExpression: checkForLoops,
            FunctionExpression: checkForLoops,
            FunctionDeclaration: checkForLoops,
        };
    },
};

export default noLoopFuncRule;
