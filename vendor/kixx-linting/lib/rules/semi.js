/**
 * semi — require semicolons instead of ASI.
 * Adapted from ESLint's semi rule.
 */

function isSemicolonToken(token) {
    return token && token.value === ";" && token.type === "Punctuator";
}

const semiRule = {
    meta: {
        type: "layout",
        schema: [
            { enum: ["always"] },
            {
                type: "object",
                properties: {
                    omitLastInOneLineBlock: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const options = context.options[1];
        const exceptOneLine = Boolean(options && options.omitLastInOneLineBlock);
        const sourceCode = context.sourceCode;

        function isLastInOneLinerBlock(node) {
            const parent = node.parent;
            const nextToken = sourceCode.getTokenAfter(node);
            if (!nextToken || nextToken.value !== "}") return false;
            if (parent.type === "BlockStatement" || parent.type === "StaticBlock") {
                const openBraceToken = sourceCode.getFirstToken(parent, token => token.value === "{");
                return Boolean(openBraceToken) && openBraceToken.loc.start.line === nextToken.loc.start.line;
            }
            return false;
        }

        function report(node, missing) {
            const lastToken = sourceCode.getLastToken(node);
            const loc = missing
                ? lastToken.loc
                : {
                    start: lastToken.loc.end,
                    end: { line: lastToken.loc.end.line, column: lastToken.loc.end.column + 1 },
                };
            context.report({
                node,
                loc,
                message: missing ? "Extra semicolon." : "Missing semicolon.",
            });
        }

        function checkForSemicolon(node) {
            const isSemi = isSemicolonToken(sourceCode.getLastToken(node));
            const oneLinerBlock = exceptOneLine && isLastInOneLinerBlock(node);

            if (isSemi && oneLinerBlock) {
                report(node, true);
            } else if (!isSemi && !oneLinerBlock) {
                report(node);
            }
        }

        function checkForSemicolonForVariableDeclaration(node) {
            const parent = node.parent;
            if (
                (parent.type !== "ForStatement" || parent.init !== node) &&
                (!/^For(?:In|Of)Statement/u.test(parent.type) || parent.left !== node)
            ) {
                checkForSemicolon(node);
            }
        }

        return {
            VariableDeclaration: checkForSemicolonForVariableDeclaration,
            ExpressionStatement: checkForSemicolon,
            ReturnStatement: checkForSemicolon,
            ThrowStatement: checkForSemicolon,
            DoWhileStatement: checkForSemicolon,
            DebuggerStatement: checkForSemicolon,
            BreakStatement: checkForSemicolon,
            ContinueStatement: checkForSemicolon,
            ImportDeclaration: checkForSemicolon,
            ExportAllDeclaration: checkForSemicolon,
            ExportNamedDeclaration(node) {
                if (!node.declaration) checkForSemicolon(node);
            },
            ExportDefaultDeclaration(node) {
                if (!/(?:Class|Function)Declaration/u.test(node.declaration.type)) {
                    checkForSemicolon(node);
                }
            },
            PropertyDefinition: checkForSemicolon,
        };
    },
};

export default semiRule;
