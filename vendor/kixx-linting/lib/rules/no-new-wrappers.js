/**
 * Reports wrapper-object construction with `String`, `Number`, or `Boolean`.
 */

import { isEnabledGlobalReference } from "./utils.js";

const WRAPPER_NAMES = new Set(["String", "Number", "Boolean"]);

const noNewWrappersRule = {
    meta: {
        type: "suggestion",
    },

    create(context) {
        return {
            NewExpression(node) {
                if (node.callee.type !== "Identifier" || !WRAPPER_NAMES.has(node.callee.name)) {
                    return;
                }

                if (!isEnabledGlobalReference(context, node, node.callee.name)) {
                    return;
                }

                context.report({
                    node,
                    message: "Do not use {{name}} as a constructor.",
                    data: { name: node.callee.name },
                });
            },
        };
    },
};

export default noNewWrappersRule;
