/**
 * valid-typeof — enforce comparing typeof expressions against valid strings.
 * Adapted from ESLint's valid-typeof rule.
 */

const VALID_TYPES = new Set([
    "symbol", "undefined", "object", "boolean", "number", "string", "function", "bigint",
]);
const TYPEOF_OPERATORS = new Set(["==", "===", "!=", "!=="]);

const validTypeofRule = {
    meta: {
        type: "problem",
        schema: [
            {
                type: "object",
                properties: {
                    requireStringLiterals: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const requireStringLiterals = context.options[0]?.requireStringLiterals ?? false;
        const sourceCode = context.sourceCode;

        function isTypeofExpression(node) {
            return node.type === "UnaryExpression" && node.operator === "typeof";
        }

        function getStaticStringValue(node) {
            if (node.type === "Literal" && typeof node.value === "string") {
                return node.value;
            }

            if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
                return node.quasis[0]?.value.cooked ?? null;
            }

            return null;
        }

        function isGlobalUndefinedIdentifier(node) {
            if (node.type !== "Identifier" || node.name !== "undefined") {
                return false;
            }

            return !sourceCode.getResolvedVariable(node)?.defs.length;
        }

        return {
            UnaryExpression(node) {
                if (node.operator !== "typeof") return;

                const parent = node.parent;
                if (
                    parent.type === "BinaryExpression" &&
                    TYPEOF_OPERATORS.has(parent.operator) &&
                    (parent.left === node || parent.right === node)
                ) {
                    const sibling = parent.left === node ? parent.right : parent.left;
                    const staticStringValue = getStaticStringValue(sibling);

                    if (staticStringValue !== null) {
                        if (!VALID_TYPES.has(staticStringValue)) {
                            context.report({
                                node: sibling,
                                message: `Invalid typeof comparison value "${staticStringValue}".`,
                            });
                        }
                    } else if (isGlobalUndefinedIdentifier(sibling)) {
                        context.report({
                            node: sibling,
                            message: "Invalid typeof comparison value \"undefined\".",
                        });
                    } else if (requireStringLiterals && !isTypeofExpression(sibling)) {
                        context.report({
                            node: sibling,
                            message: "Typeof comparisons should be to string literals.",
                        });
                    }
                }
            },
        };
    },
};

export default validTypeofRule;
