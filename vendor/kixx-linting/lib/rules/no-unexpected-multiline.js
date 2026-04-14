/**
 * no-unexpected-multiline — disallow confusing multiline expressions.
 * Adapted from ESLint's no-unexpected-multiline rule.
 */

const REGEX_FLAGS = new Set([ "d", "g", "i", "m", "s", "u", "v", "y" ]);

function getTokenStartingAt(tokens, start) {
    return tokens.find(token => token.start === start) || null;
}

function isRegexLikeLine(line) {
    if (!line.startsWith("/")) {
        return false;
    }

    const closingSlashIndex = line.indexOf("/", 1);

    if (closingSlashIndex === -1) {
        return false;
    }

    let index = closingSlashIndex + 1;
    const flagsStart = index;

    while (REGEX_FLAGS.has(line[index])) {
        index += 1;
    }

    if (index === flagsStart) {
        return false;
    }

    const rest = line.slice(index);

    return rest === "" ||
        rest.startsWith(".test(") ||
        rest.startsWith(".test (") ||
        !/[A-Za-z0-9_$]/u.test(rest[0]);
}

const noUnexpectedMultilineRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        const sourceCode = context.sourceCode;

        function isParenthesized(node) {
            const before = sourceCode.getTokenBefore(node);
            const after = sourceCode.getTokenAfter(node);
            return Boolean(
                before &&
                after &&
                before.value === "(" &&
                after.value === ")" &&
                before.range[1] <= node.range[0] &&
                after.range[0] >= node.range[1],
            );
        }

        return {
            // (expr)\n(args) — function call where paren is on next line
            CallExpression(node) {
                const calleeLastToken = sourceCode.getLastToken(node.callee);
                let openParen = null;

                if (node.arguments.length > 0) {
                    openParen = sourceCode.getFirstTokenBetween(
                        node.callee,
                        node.arguments[0],
                        token => token.value === "(",
                    );
                } else {
                    openParen = sourceCode.getTokenAfter(calleeLastToken, token => token.value === "(");
                }

                if (!openParen || openParen.value !== "(") return;
                const prevToken = sourceCode.getTokenBefore(openParen);
                if (prevToken && prevToken.loc.end.line < openParen.loc.start.line) {
                    if (prevToken.value === "?.") {
                        return;
                    }
                    context.report({
                        node,
                        message: "Unexpected newline between function and ( of function call.",
                    });
                    return;
                }
            },
            // expr\n[prop] — member access where bracket is on next line
            MemberExpression(node) {
                if (!node.computed) return;
                const objectLastToken = sourceCode.getLastToken(node.object);
                const openBracket = sourceCode.getTokenAfter(objectLastToken);
                if (!openBracket || openBracket.value !== "[") return;
                if (objectLastToken.loc.end.line < openBracket.loc.start.line) {
                    context.report({
                        node,
                        message: "Unexpected newline between object and [ of property access.",
                    });
                }
            },
            // expr\n`template` — tagged template where tag ends before backtick
            TaggedTemplateExpression(node) {
                const tagLastToken = sourceCode.getLastToken(node.tag);
                const quasi = node.quasi;
                if (isParenthesized(node.tag)) {
                    return;
                }
                if (tagLastToken.loc.end.line < quasi.loc.start.line) {
                    context.report({
                        node,
                        message: "Unexpected newline between template tag and template literal.",
                    });
                }
            },
            Program(node) {
                const lines = sourceCode.getLines();
                const tokens = sourceCode.getTokens(node);
                let lineStart = lines[0].length + 1;

                for (let i = 1; i < lines.length; i += 1) {
                    const current = lines[i].trimStart();
                    const previous = lines[i - 1].trim();
                    const column = lines[i].length - current.length;
                    const token = getTokenStartingAt(tokens, lineStart + column);

                    if (
                        previous &&
                        current.startsWith("/") &&
                        token?.type !== "RegularExpression" &&
                        isRegexLikeLine(current)
                    ) {
                        context.report({
                            node,
                            loc: {
                                start: { line: i + 1, column },
                                end: { line: i + 1, column: column + 1 },
                            },
                            message: "Unexpected newline between numerator and division operator.",
                        });
                    }

                    lineStart += lines[i].length + 1;
                }
            },
        };
    },
};

export default noUnexpectedMultilineRule;
