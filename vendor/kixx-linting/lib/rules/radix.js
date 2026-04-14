/**
 * Requires a valid radix when calling `parseInt`.
 */

import { getMemberStaticPropertyName, isEnabledGlobalReference } from "./utils.js";

const VALID_RADIX_VALUES = new Set(Array.from({ length: 35 }, (_, index) => index + 2));

function getChainTarget(node) {
    if (node.type !== "ChainExpression") {
        return node;
    }

    if (node.expression.type === "CallExpression") {
        return node.expression.callee;
    }

    return node.expression;
}

function isValidRadix(node) {
    return !(
        (node.type === "Literal" && !VALID_RADIX_VALUES.has(node.value)) ||
        (node.type === "Identifier" && node.name === "undefined")
    );
}

function isParseIntCall(context, node) {
    const callee = getChainTarget(node.callee);

    if (callee.type === "Identifier") {
        return callee.name === "parseInt" && isEnabledGlobalReference(context, callee, "parseInt");
    }

    return (
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.object.name === "Number" &&
        getMemberStaticPropertyName(callee) === "parseInt" &&
        isEnabledGlobalReference(context, callee.object, "Number")
    );
}

const radixRule = {
    meta: {
        type: "suggestion",
    },

    create(context) {
        return {
            CallExpression(node) {
                if (!isParseIntCall(context, node)) {
                    return;
                }

                if (node.arguments.length === 0) {
                    context.report({
                        node,
                        message: "Missing parameters.",
                    });
                    return;
                }

                if (node.arguments.length === 1) {
                    context.report({
                        node,
                        message: "Missing radix parameter.",
                    });
                    return;
                }

                if (!isValidRadix(node.arguments[1])) {
                    context.report({
                        node,
                        message: "Invalid radix parameter, must be an integer between 2 and 36.",
                    });
                }
            },
        };
    },
};

export default radixRule;
