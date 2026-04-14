/**
 * use-isnan — require calls to isNaN() when checking for NaN.
 * Adapted from ESLint's use-isnan rule.
 */

import { getMemberStaticPropertyName } from "./utils.js";

const COMPARISON_OPS = new Set(["==", "===", "!=", "!==", "<", ">", "<=", ">="]);

function isNaNExpression(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    switch (node.type) {
        case "Identifier":
            return node.name === "NaN";

        case "MemberExpression":
            return (
                node.object.type === "Identifier" &&
                node.object.name === "Number" &&
                getMemberStaticPropertyName(node) === "NaN"
            );

        case "ChainExpression":
            return isNaNExpression(node.expression);

        case "ParenthesizedExpression":
            return isNaNExpression(node.expression);

        case "SequenceExpression":
            return isNaNExpression(node.expressions[node.expressions.length - 1]);

        default:
            return false;
    }
}

function isTargetIndexMethod(node) {
    return node.type === "MemberExpression" && ["indexOf", "lastIndexOf"].includes(getMemberStaticPropertyName(node));
}

function isNaNIndex(node) {
    if (node.type !== "CallExpression") {
        return false;
    }

    const callee = node.callee.type === "ChainExpression" ? node.callee.expression : node.callee;

    return (
        isTargetIndexMethod(callee) &&
        (node.arguments.length === 1 || node.arguments.length === 2) &&
        isNaNExpression(node.arguments[0])
    );
}

const useIsnanRule = {
    meta: {
        type: "problem",
        schema: [
            {
                type: "object",
                properties: {
                    enforceForIndexOf: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const options = context.options[0] || {};
        const enforceForIndexOf = options.enforceForIndexOf ?? false;

        return {
            BinaryExpression(node) {
                if (
                    COMPARISON_OPS.has(node.operator) &&
                    (isNaNExpression(node.left) || isNaNExpression(node.right))
                ) {
                    context.report({
                        node,
                        message: "Use the isNaN function to compare with NaN.",
                    });
                }
            },

            CallExpression(node) {
                if (enforceForIndexOf && isNaNIndex(node)) {
                    const callee = node.callee.type === "ChainExpression" ? node.callee.expression : node.callee;
                    const method = getMemberStaticPropertyName(callee) ?? "indexOf";

                    context.report({
                        node,
                        message: "Array prototype method '{{method}}' is overwritten by NaN."
                            .replace("{{method}}", method),
                    });
                }
            },
        };
    },
};

export default useIsnanRule;
