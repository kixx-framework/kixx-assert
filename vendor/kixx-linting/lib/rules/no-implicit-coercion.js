/**
 * no-implicit-coercion — disallow implicit type coercions.
 * Adapted from ESLint's no-implicit-coercion rule.
 */

const DEFAULT_OPTIONS = {
    boolean: true,
    number: true,
    string: true,
    allow: [],
};

function normalizeOptions(opts) {
    return Object.assign({}, DEFAULT_OPTIONS, opts);
}

/** Returns true if node is a numeric literal (number or bigint). */
function isNumericLiteral(node) {
    return node.type === "Literal" && (typeof node.value === "number" || typeof node.value === "bigint");
}

/** Returns true if node is a string or template literal with no expressions. */
function isEmptyStringLiteral(node) {
    if (node.type === "Literal" && node.value === "") return true;
    if (node.type === "TemplateLiteral" && node.expressions.length === 0 && node.quasis.length === 1 && node.quasis[0].value.cooked === "") return true;
    return false;
}

/**
 * Returns true if node is a call to Number(), parseInt(), or parseFloat(),
 * or is a numeric literal, or is a unary - - expression (double negation).
 */
function isExplicitNumberConversion(node) {
    if (isNumericLiteral(node)) return true;
    if (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        (node.callee.name === "Number" || node.callee.name === "parseInt" || node.callee.name === "parseFloat")
    ) {
        return true;
    }
    // - -expr is double negation = explicit conversion
    if (
        node.type === "UnaryExpression" &&
        node.operator === "-" &&
        node.argument.type === "UnaryExpression" &&
        node.argument.operator === "-"
    ) {
        return true;
    }
    return false;
}

/**
 * Returns true if the node already contains "numeric context" — a non-unit numeric literal,
 * or an explicit conversion call, somewhere in a multiplication chain.
 * This means the expression is already numeric and `* 1` is not an implicit coercion.
 */
function containsNumericContext(node) {
    if (isNumericLiteral(node)) return true;
    if (isExplicitNumberConversion(node)) return true;
    if (
        node.type === "BinaryExpression" &&
        (node.operator === "*" || node.operator === "/" || node.operator === "+" || node.operator === "-")
    ) {
        return containsNumericContext(node.left) || containsNumericContext(node.right);
    }
    return false;
}

/**
 * Returns true if the binary expression node represents implicit multiplication coercion:
 * one side is exactly 1 (the multiplier) and the other side is NOT an explicit number conversion.
 *
 * Special case: `a * 1 / b` (no explicit parens) is considered fraction notation and is valid.
 * Detection: the `* 1` node starts at the same position as its parent `/` node (no parens).
 */
function isMultiplicationCoercion(node) {
    if (node.operator !== "*") return false;
    const { left, right } = node;

    if (isNumericLiteral(left) && left.value === 1 && !isExplicitNumberConversion(right) && !isNumericLiteral(right)) {
        // 1 * expr — always coercion regardless of parent context
        return true;
    }

    if (isNumericLiteral(right) && right.value === 1) {
        // expr * 1 — valid if expr already has numeric context (contains literals/explicit conversions)
        if (containsNumericContext(left)) return false;

        // Also valid if this is a fraction-like pattern: `a * 1 / N` (no explicit parens)
        // When the parent is a `/` division and this node starts at the same position
        // as the parent (no explicit parentheses), AND the RHS is not itself a coercion.
        const parent = node.parent;
        if (
            parent &&
            parent.type === "BinaryExpression" &&
            parent.operator === "/" &&
            parent.left === node &&
            node.start === parent.start &&
            !isMultiplicationCoercion(parent.right)
        ) {
            return false; // fraction pattern: a * 1 / b
        }

        return true;
    }

    return false;
}

/**
 * Returns true if the member expression's property is "indexOf" (non-computed).
 */
function isMemberIndexOf(memberNode) {
    return (
        memberNode.type === "MemberExpression" &&
        !memberNode.computed &&
        memberNode.property.type === "Identifier" &&
        memberNode.property.name === "indexOf"
    );
}

/**
 * Returns true if node is a call to `...indexOf(...)`, including optional chaining variants:
 * - foo.indexOf(1)
 * - foo?.indexOf(1)       → ChainExpression { CallExpression { callee: MemberExpression(optional) } }
 * - (foo?.indexOf)(1)     → CallExpression { callee: ChainExpression { MemberExpression } }
 */
function isIndexOfCall(node) {
    // ~foo?.indexOf(1): argument is ChainExpression wrapping a CallExpression
    if (node.type === "ChainExpression") {
        return isIndexOfCall(node.expression);
    }

    if (node.type !== "CallExpression") return false;
    const callee = node.callee;

    // foo.indexOf(...)  or  foo?.indexOf(...)
    if (isMemberIndexOf(callee)) return true;

    // (foo?.indexOf)(...) — callee is a ChainExpression
    if (callee.type === "ChainExpression" && isMemberIndexOf(callee.expression)) return true;

    return false;
}

/** Returns the "allow" set as a Set of strings. */
function getAllow(options) {
    return new Set(options.allow ?? []);
}

const noImplicitCoercionRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    boolean: { type: "boolean" },
                    number: { type: "boolean" },
                    string: { type: "boolean" },
                    allow: {
                        type: "array",
                        items: {
                            type: "string",
                            enum: ["~", "!!", "+", "- -", "-", "*"],
                        },
                        uniqueItems: true,
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const options = normalizeOptions(context.options[0]);
        const allow = getAllow(options);

        return {
            UnaryExpression(node) {
                // !! — boolean coercion
                if (
                    node.operator === "!" &&
                    node.argument.type === "UnaryExpression" &&
                    node.argument.operator === "!"
                ) {
                    if (options.boolean && !allow.has("!!")) {
                        context.report({
                            node,
                            message: "Use 'Boolean(x)' instead of '!!'.",
                        });
                    }
                    return;
                }

                // +foo — number coercion (unary plus)
                if (node.operator === "+") {
                    // Skip numeric literals (+42) or explicit conversions (+Number(x))
                    if (isNumericLiteral(node.argument) || isExplicitNumberConversion(node.argument)) return;
                    if (options.number && !allow.has("+")) {
                        context.report({
                            node,
                            message: "Use 'Number(x)' instead of unary '+'.",
                        });
                    }
                    return;
                }

                // -(-foo) — number coercion (double minus)
                // Skip when the inner expression is a numeric literal or explicit conversion
                if (
                    node.operator === "-" &&
                    node.argument.type === "UnaryExpression" &&
                    node.argument.operator === "-"
                ) {
                    const inner = node.argument.argument;
                    if (!isNumericLiteral(inner) && !isExplicitNumberConversion(inner) && options.number && !allow.has("- -")) {
                        context.report({
                            node,
                            message: "Use 'Number(x)' instead of '- -'.",
                        });
                    }
                    return;
                }

                // ~foo.indexOf(...) — boolean coercion via tilde-indexOf
                if (node.operator === "~") {
                    // Only flag when the operand is an indexOf call
                    if (isIndexOfCall(node.argument)) {
                        if (options.boolean && !allow.has("~")) {
                            context.report({
                                node,
                                message: "Use '.includes()' or '!== -1' instead of '~...indexOf()'.",
                            });
                        }
                    }
                }
            },

            BinaryExpression(node) {
                // "" + foo or foo + "" — string coercion
                if (node.operator === "+") {
                    const leftEmpty = isEmptyStringLiteral(node.left);
                    const rightEmpty = isEmptyStringLiteral(node.right);

                    if (leftEmpty || rightEmpty) {
                        // Skip if both sides are literals/templates (no coercion needed)
                        const otherSide = leftEmpty ? node.right : node.left;
                        if (isEmptyStringLiteral(otherSide)) return;
                        if (otherSide.type === "Literal" && typeof otherSide.value === "string") return;
                        if (otherSide.type === "TemplateLiteral") return;
                        // Check if other side is String(x)
                        if (
                            otherSide.type === "CallExpression" &&
                            otherSide.callee.type === "Identifier" &&
                            otherSide.callee.name === "String"
                        ) return;

                        if (options.string && !allow.has("+")) {
                            context.report({
                                node,
                                message: "Use 'String(x)' instead of string concatenation.",
                            });
                        }
                    }
                    return;
                }

                // foo - 0 — number coercion via subtraction
                if (node.operator === "-") {
                    if (
                        node.right.type === "Literal" &&
                        node.right.value === 0 &&
                        !isExplicitNumberConversion(node.left)
                    ) {
                        if (options.number && !allow.has("-")) {
                            context.report({
                                node,
                                message: "Use 'Number(x)' instead of 'x - 0'.",
                            });
                        }
                    }
                    return;
                }

                // foo * 1 or 1 * foo — number coercion via multiplication
                if (isMultiplicationCoercion(node)) {
                    if (options.number && !allow.has("*")) {
                        context.report({
                            node,
                            message: "Use 'Number(x)' instead of 'x * 1'.",
                        });
                    }
                }
            },

            AssignmentExpression(node) {
                // foo += "" — string coercion
                if (node.operator === "+=" && isEmptyStringLiteral(node.right)) {
                    if (options.string && !allow.has("+")) {
                        context.report({
                            node,
                            message: "Use 'String(x)' instead of string concatenation.",
                        });
                    }
                }
            },
        };
    },
};

export default noImplicitCoercionRule;
