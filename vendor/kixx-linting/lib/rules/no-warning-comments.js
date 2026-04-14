/**
 * no-warning-comments — disallow specified warning terms in comments.
 * Adapted from ESLint's no-warning-comments rule.
 */

const CHAR_LIMIT = 40;

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNoWarningCommentsDirective(comment) {
    return comment.type === "Block" && /^\s*eslint(?:-[^\s]+)?\s+no-warning-comments\b/iu.test(comment.value);
}

const noWarningCommentsRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    terms: { type: "array", items: { type: "string" } },
                    location: { enum: ["start", "anywhere"] },
                    decoration: {
                        type: "array",
                        items: { type: "string" },
                        minItems: 1,
                        uniqueItems: true,
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const options = context.options[0] || {};
        const warningTerms = options.terms || ["todo", "fixme", "xxx"];
        const location = options.location || "start";
        const decoration = options.decoration || [];
        const escapedDecoration = escapeRegExp(decoration.join(""));

        function convertToRegExp(term) {
            const escaped = escapeRegExp(term);
            const wordBoundary = "\\b";

            let prefix = "";
            if (location === "start") {
                prefix = `^[\\s${escapedDecoration}]*`;
            } else if (/^\w/u.test(term)) {
                prefix = wordBoundary;
            }

            const suffix = /\w$/u.test(term) ? wordBoundary : "";
            return new RegExp(`${prefix}${escaped}${suffix}`, "iu");
        }

        const warningRegExps = warningTerms.map(convertToRegExp);

        function commentContainsWarningTerm(comment) {
            const matches = [];
            warningRegExps.forEach((regex, index) => {
                if (regex.test(comment)) {
                    matches.push(warningTerms[index]);
                }
            });
            return matches;
        }

        function checkComment(node) {
            if (isNoWarningCommentsDirective(node)) {
                return;
            }

            const comment = node.value;
            const matches = commentContainsWarningTerm(comment);

            matches.forEach(matchedTerm => {
                let commentToDisplay = "";
                let truncated = false;

                for (const c of comment.trim().split(/\s+/u)) {
                    const tmp = commentToDisplay ? `${commentToDisplay} ${c}` : c;
                    if (tmp.length <= CHAR_LIMIT) {
                        commentToDisplay = tmp;
                    } else {
                        truncated = true;
                        break;
                    }
                }

                context.report({
                    node,
                    message: `Unexpected '${matchedTerm}' comment: '${commentToDisplay}${truncated ? "..." : ""}'.`,
                });
            });
        }

        return {
            Program() {
                const comments = sourceCode.getAllComments();
                comments
                    .filter(token => token.type !== "Shebang")
                    .forEach(checkComment);
            },
        };
    },
};

export default noWarningCommentsRule;
