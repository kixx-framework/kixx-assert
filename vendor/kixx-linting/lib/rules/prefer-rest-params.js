/**
 * Prefers rest parameters over `arguments`.
 */

import { getImplicitArgumentsVariable } from "./utils.js";

function isNotNormalMemberAccess(reference) {
    const identifier = reference.identifier;
    const parent = identifier.parent;

    return !(
        parent?.type === "MemberExpression" &&
        parent.object === identifier &&
        parent.computed === false
    );
}

const preferRestParamsRule = {
    meta: {
        type: "suggestion",
    },

    create(context) {
        const sourceCode = context.sourceCode;

        function checkForArguments(node) {
            const argumentsVariable = getImplicitArgumentsVariable(sourceCode.getScope(node));
            if (!argumentsVariable) {
                return;
            }

            for (const reference of argumentsVariable.references) {
                if (!isNotNormalMemberAccess(reference)) {
                    continue;
                }

                context.report({
                    node: reference.identifier,
                    message: "Use the rest parameters instead of 'arguments'.",
                });
            }
        }

        return {
            "FunctionDeclaration:exit": checkForArguments,
            "FunctionExpression:exit": checkForArguments,
        };
    },
};

export default preferRestParamsRule;
