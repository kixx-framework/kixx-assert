/**
 * no-return-assign — disallow assignment operators in return statements.
 * Adapted from ESLint's no-return-assign rule.
 */

function isParenthesised(sourceCode, node) {
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

function checkAssignment(context, sourceCode, node, option) {
    function findAssignment(expression) {
        if (!expression || typeof expression !== "object") {
            return null;
        }

        if (expression.type === "AssignmentExpression") {
            return expression;
        }

        if (
            expression.type === "FunctionDeclaration" ||
            expression.type === "FunctionExpression" ||
            expression.type === "ArrowFunctionExpression" ||
            expression.type === "ClassDeclaration" ||
            expression.type === "ClassExpression"
        ) {
            return null;
        }

        for (const [ key, child ] of Object.entries(expression)) {
            if (key === "parent") {
                continue;
            }

            if (Array.isArray(child)) {
                for (const item of child) {
                    if (item && typeof item === "object" && item.type) {
                        const found = findAssignment(item);
                        if (found) {
                            return found;
                        }
                    }
                }
                continue;
            }

            if (child && typeof child === "object" && child.type) {
                const found = findAssignment(child);
                if (found) {
                    return found;
                }
            }
        }

        return null;
    }

    const assignment = option === "always" ? findAssignment(node) : node;

    if (
        assignment &&
        assignment.type === "AssignmentExpression" &&
        (option === "always" || !isParenthesised(sourceCode, assignment))
    ) {
        context.report({
            node: assignment,
            message: "Return statement should not contain assignment.",
        });
    }
}

const noReturnAssignRule = {
    meta: {
        type: "suggestion",
        schema: [{ enum: ["except-parens", "always"] }],
    },

    create(context) {
        const option = context.options[0] || "except-parens";
        const sourceCode = context.sourceCode;

        return {
            ReturnStatement(node) {
                checkAssignment(context, sourceCode, node.argument, option);
            },
            ArrowFunctionExpression(node) {
                if (node.expression) {
                    checkAssignment(context, sourceCode, node.body, option);
                }
            },
        };
    },
};

export default noReturnAssignRule;
