/**
 * Reports `new Symbol()` and `new BigInt()` because those globals are not constructors.
 */

import { hasShadowingDefinition } from "./utils.js";

const NON_CONSTRUCTOR_NAMES = new Set(["Symbol", "BigInt"]);

const noNewNativeNonconstructorRule = {
    meta: {
        type: "problem",
    },

    create(context) {
        return {
            NewExpression(node) {
                if (node.callee.type !== "Identifier" || !NON_CONSTRUCTOR_NAMES.has(node.callee.name)) {
                    return;
                }

                if (hasShadowingDefinition(context.sourceCode, node, node.callee.name, { includeGlobal: false })) {
                    return;
                }

                context.report({
                    node: node.callee,
                    message: "`{{name}}` cannot be called as a constructor.",
                    data: { name: node.callee.name },
                });
            },
        };
    },
};

export default noNewNativeNonconstructorRule;
