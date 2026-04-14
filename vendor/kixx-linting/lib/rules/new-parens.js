/**
 * new-parens — enforce or disallow parentheses when invoking a constructor with no arguments.
 * Adapted from ESLint's new-parens rule.
 */

function isClosingParenToken(token) {
    return token && token.value === ")" && token.type === "Punctuator";
}

function isOpeningParenToken(token) {
    return token && token.value === "(" && token.type === "Punctuator";
}

const newParensRule = {
    meta: {
        type: "layout",
        schema: [{ enum: ["always", "never"] }],
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const always = context.options[0] !== "never"; // Default is "always"

        return {
            NewExpression(node) {
                if (node.arguments.length !== 0) {
                    return; // If there are arguments, parens are required
                }

                const lastToken = sourceCode.getLastToken(node);
                const hasLastParen = lastToken && isClosingParenToken(lastToken);

                // hasParens is true only if the NewExpression ends with its own parens
                const hasParens =
                    hasLastParen &&
                    isOpeningParenToken(sourceCode.getTokenBefore(lastToken)) &&
                    node.callee.range[1] < node.range[1];

                if (always && !hasParens) {
                    context.report({
                        node,
                        message: "Missing '()' invoking a constructor.",
                    });
                } else if (!always && hasParens) {
                    context.report({
                        node,
                        message: "Unnecessary '()' invoking a constructor with no arguments.",
                    });
                }
            },
        };
    },
};

export default newParensRule;
