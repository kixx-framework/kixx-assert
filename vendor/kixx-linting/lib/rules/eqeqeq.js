/**
 * eqeqeq — require the use of `===` and `!==`.
 * Adapted from ESLint's eqeqeq rule.
 */

function isNullLiteral(node) {
    return node.type === "Literal" && node.value === null;
}

const eqeqeqRule = {
    meta: {
        type: "suggestion",
        schema: [
            { enum: ["always", "smart", "allow-null"] },
            {
                type: "object",
                properties: { null: { enum: ["always", "never", "ignore"] } },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const config = context.options[0] || "always";
        const options = context.options[1] || {};
        const sourceCode = context.sourceCode;

        const nullOption = config === "always" ? (options.null || "always") : "ignore";
        const enforceForNull = nullOption === "always";
        const enforceNeverForNull = nullOption === "never";

        function isTypeOf(node) {
            return node.type === "UnaryExpression" && node.operator === "typeof";
        }

        function isTypeOfBinary(node) {
            return isTypeOf(node.left) || isTypeOf(node.right);
        }

        function areLiteralsAndSameType(node) {
            return (
                node.left.type === "Literal" &&
                node.right.type === "Literal" &&
                typeof node.left.value === typeof node.right.value
            );
        }

        function isNullCheck(node) {
            return isNullLiteral(node.right) || isNullLiteral(node.left);
        }

        return {
            BinaryExpression(node) {
                const op = node.operator;

                if (op === "===" || op === "!==") {
                    if (enforceNeverForNull && isNullCheck(node)) {
                        const expectedOp = op === "===" ? "==" : "!=";
                        context.report({
                            node,
                            message: `Expected '${expectedOp}' and instead saw '${op}'.`,
                        });
                    }
                    return;
                }

                if (op !== "==" && op !== "!=") return;

                // Skip if the parent is also a loose equality — the outer node will be reported.
                const parent = node.parent;
                if (parent && parent.type === "BinaryExpression" &&
                    (parent.operator === "==" || parent.operator === "!=")) {
                    return;
                }

                const isNull = isNullCheck(node);

                if (config === "smart") {
                    if (isNull || isTypeOfBinary(node) || areLiteralsAndSameType(node)) {
                        return;
                    }
                }

                if (config === "allow-null" && isNull) return;

                if (enforceNeverForNull && isNull) return;

                if (!enforceForNull && isNull) return;

                const expectedOp = op === "==" ? "===" : "!==";
                const operatorToken = sourceCode.getFirstTokenBetween(
                    node.left,
                    node.right,
                    token => token.value === op,
                );

                context.report({
                    node,
                    loc: operatorToken ? operatorToken.loc : node.loc,
                    message: `Expected '${expectedOp}' and instead saw '${op}'.`,
                });
            },
        };
    },
};

export default eqeqeqRule;
