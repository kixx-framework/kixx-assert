/**
 * Reports direct access to `Object.prototype` methods on target objects.
 */

import { getMemberStaticPropertyName } from "./utils.js";

const DISALLOWED_PROPERTIES = new Set([
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
]);

const noPrototypeBuiltinsRule = {
    meta: {
        type: "problem",
    },

    create(context) {
        function getMemberFromCallee(callee) {
            if (callee.type === "MemberExpression") {
                return callee;
            }

            if (callee.type === "ChainExpression") {
                return getMemberFromCallee(callee.expression);
            }

            if (callee.type === "CallExpression") {
                return getMemberFromCallee(callee.callee);
            }

            return null;
        }

        function checkCall(node) {
            const memberExpression = getMemberFromCallee(node.callee);

            if (!memberExpression) {
                return;
            }

            const propertyName = getMemberStaticPropertyName(memberExpression);
            if (!propertyName || !DISALLOWED_PROPERTIES.has(propertyName)) {
                return;
            }

            context.report({
                node,
                message: "Do not access Object.prototype method '{{prop}}' from target object.",
                data: { prop: propertyName },
            });
        }

        return {
            CallExpression: checkCall,
        };
    },
};

export default noPrototypeBuiltinsRule;
