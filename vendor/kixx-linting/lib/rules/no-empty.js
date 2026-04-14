/**
 * no-empty — disallow empty block statements.
 * Adapted from ESLint's no-empty rule.
 */

import { isFunctionLike } from "./utils.js";

function hasCommentsInsideSwitchBody(sourceCode, node) {
    const openingBrace = sourceCode.getFirstToken(node, token => token.value === "{");
    const closingBrace = sourceCode.getLastToken(node, token => token.value === "}");

    if (!openingBrace || !closingBrace) {
        return false;
    }

    return sourceCode.commentsExistBetween(openingBrace, closingBrace);
}

const noEmptyRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    allowEmptyCatch: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const allowEmptyCatch = context.options[0]?.allowEmptyCatch ?? false;
        const sourceCode = context.sourceCode;

        return {
            BlockStatement(node) {
                if (node.body.length !== 0) return;
                if (isFunctionLike(node.parent)) return;
                if (allowEmptyCatch && node.parent.type === "CatchClause") return;
                if (sourceCode.getCommentsInside(node).length > 0) return;

                context.report({
                    node,
                    message: "Empty block statement.",
                });
            },

            SwitchStatement(node) {
                if (node.cases.length !== 0) return;
                if (hasCommentsInsideSwitchBody(sourceCode, node)) return;
                context.report({
                    node,
                    message: "Empty switch statement.",
                });
            },
        };
    },
};

export default noEmptyRule;
