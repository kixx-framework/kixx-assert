/**
 * no-else-return — disallow else blocks after return statements in if statements.
 * Adapted from ESLint's no-else-return rule.
 */

function alwaysReturns(node) {
    if (!node) return false;
    if (node.type === "ReturnStatement" || node.type === "ThrowStatement") return true;
    if (node.type === "BlockStatement") {
        const lastStatement = node.body.at(-1);
        return alwaysReturns(lastStatement);
    }
    if (node.type === "IfStatement") {
        return Boolean(node.alternate) && alwaysReturns(node.consequent) && alwaysReturns(node.alternate);
    }
    return false;
}

function isElseIf(node) {
    return node.parent?.type === "IfStatement" && node.parent.alternate === node;
}

function hasUnnecessaryElse(node, allowElseIf) {
    if (!node.alternate) {
        return false;
    }

    if (isElseIf(node) && !alwaysReturns(node.parent.consequent)) {
        return false;
    }

    if (allowElseIf && node.alternate.type === "IfStatement") {
        return false;
    }

    return alwaysReturns(node.consequent);
}

function isNestedInsideReportableConsequent(node, allowElseIf) {
    let current = node.parent;

    while (current) {
        if (current.type === "IfStatement" && current.alternate && current.consequent) {
            let branchNode = node;

            while (branchNode.parent && branchNode.parent !== current) {
                branchNode = branchNode.parent;
            }

            if (branchNode.parent === current && hasUnnecessaryElse(current, allowElseIf)) {
                return true;
            }
        }

        current = current.parent;
    }

    return false;
}

function isDanglingElseContext(node) {
    if (!node.alternate) {
        return false;
    }

    const parent = node.parent;

    if (!parent) {
        return false;
    }

    if (
        parent.type === "IfStatement" &&
        parent.consequent === node &&
        parent.alternate &&
        parent.consequent.type !== "BlockStatement"
    ) {
        return true;
    }

    return (
        (parent.type === "WhileStatement" ||
            parent.type === "DoWhileStatement" ||
            parent.type === "ForStatement" ||
            parent.type === "ForInStatement" ||
            parent.type === "ForOfStatement" ||
            parent.type === "LabeledStatement" ||
            parent.type === "WithStatement") &&
        parent.body === node
    );
}

const noElseReturnRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    allowElseIf: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const allowElseIf = context.options[0]?.allowElseIf ?? true;

        return {
            IfStatement(node) {
                if (
                    !isDanglingElseContext(node) &&
                    hasUnnecessaryElse(node, allowElseIf) &&
                    !isNestedInsideReportableConsequent(node, allowElseIf)
                ) {
                    context.report({
                        node: node.alternate,
                        message: "Unnecessary 'else' after 'return'.",
                    });
                }
            },
        };
    },
};

export default noElseReturnRule;
