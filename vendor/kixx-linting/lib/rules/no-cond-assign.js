/**
 * no-cond-assign — disallow assignment operators in conditional expressions.
 * Adapted from ESLint's no-cond-assign rule.
 */

function isParenthesized(sourceCode, node) {
    const prevToken = sourceCode.getTokenBefore(node);
    const nextToken = sourceCode.getTokenAfter(node);
    return (
        prevToken && nextToken &&
        prevToken.value === "(" &&
        prevToken.range[1] <= node.range[0] &&
        nextToken.value === ")" &&
        nextToken.range[0] >= node.range[1]
    );
}

function traverse(node, visitor, parent = null) {
    if (!node || typeof node.type !== "string") {
        return;
    }

    visitor(node, parent);

    if (
        node.type === "FunctionExpression" ||
        node.type === "FunctionDeclaration" ||
        node.type === "ArrowFunctionExpression"
    ) {
        return;
    }

    for (const value of Object.values(node)) {
        if (!value) {
            continue;
        }

        if (Array.isArray(value)) {
            for (const child of value) {
                traverse(child, visitor, node);
            }
            continue;
        }

        if (value && typeof value.type === "string") {
            traverse(value, visitor, node);
        }
    }
}

function getAssignmentNodes(root) {
    const nodes = [];

    traverse(root, (node, parent) => {
        if (node.type === "AssignmentExpression") {
            nodes.push({ node, parent });
        }
    });

    return nodes;
}

function isExtraParensTarget(containerNode) {
    return (
        containerNode.type === "IfStatement" ||
        containerNode.type === "WhileStatement" ||
        containerNode.type === "DoWhileStatement" ||
        containerNode.type === "ConditionalExpression"
    );
}

function isAllowedAssignment(sourceCode, containerNode, conditionNode, assignmentEntry) {
    const { node: assignmentNode, parent } = assignmentEntry;

    if (conditionNode === assignmentNode) {
        if (isExtraParensTarget(containerNode)) {
            const before = sourceCode.getTokenBefore(assignmentNode, { skip: 1 });
            const after = sourceCode.getTokenAfter(assignmentNode, { skip: 1 });

            return (
                isParenthesized(sourceCode, assignmentNode) &&
                before &&
                after &&
                before.value === "(" &&
                after.value === ")"
            );
        }

        return isParenthesized(sourceCode, assignmentNode);
    }

    if (!isParenthesized(sourceCode, assignmentNode)) {
        return false;
    }

    return parent?.type !== "ConditionalExpression";
}

const noCondAssignRule = {
    meta: {
        type: "problem",
        schema: [{ enum: ["except-parens", "always"] }],
    },
    create(context) {
        const option = context.options[0] || "except-parens";
        const sourceCode = context.sourceCode;

        function checkCondition(conditionNode, containerNode) {
            const assignments = getAssignmentNodes(conditionNode);

            if (option === "always") {
                assignments.forEach(({ node: assignmentNode }) => {
                    context.report({
                        node: assignmentNode,
                        message: "Unexpected assignment within condition.",
                    });
                });
            } else {
                assignments
                    .filter(assignmentEntry => !isAllowedAssignment(sourceCode, containerNode, conditionNode, assignmentEntry))
                    .forEach(({ node: assignmentNode }) => {
                        context.report({
                            node: assignmentNode,
                            message: "Unexpected assignment within condition.",
                        });
                    });
            }
        }

        return {
            ConditionalExpression(node) {
                checkCondition(node.test, node);
            },
            DoWhileStatement(node) {
                checkCondition(node.test, node);
            },
            ForStatement(node) {
                if (node.test) checkCondition(node.test, node);
            },
            IfStatement(node) {
                checkCondition(node.test, node);
            },
            WhileStatement(node) {
                checkCondition(node.test, node);
            },
        };
    },
};

export default noCondAssignRule;
