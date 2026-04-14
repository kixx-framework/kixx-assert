/**
 * no-case-declarations — disallow lexical declarations in case clauses.
 * Adapted from ESLint's no-case-declarations rule.
 */

function isLexicalDeclaration(node) {
    switch (node.type) {
        case "FunctionDeclaration":
        case "ClassDeclaration":
            return true;
        case "VariableDeclaration":
            return node.kind !== "var";
        default:
            return false;
    }
}

const noCaseDeclarationsRule = {
    meta: { type: "suggestion", schema: [] },
    create(context) {
        return {
            SwitchCase(node) {
                for (const statement of node.consequent) {
                    if (isLexicalDeclaration(statement)) {
                        context.report({
                            node: statement,
                            message: "Unexpected lexical declaration in case clause.",
                        });
                    }
                }
            },
        };
    },
};

export default noCaseDeclarationsRule;
