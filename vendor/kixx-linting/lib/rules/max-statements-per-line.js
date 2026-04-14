/**
 * max-statements-per-line — enforce a maximum number of statements per line.
 * Adapted from ESLint's max-statements-per-line rule.
 */

const SINGLE_CHILD_ALLOWED = /^(?:(?:DoWhile|For|ForIn|ForOf|If|Labeled|While)Statement|Export(?:Default|Named)Declaration)$/u;

function isNotSemicolonToken(token) {
    return !(token.value === ";" && token.type === "Punctuator");
}

const maxStatementsPerLineRule = {
    meta: {
        type: "layout",
        schema: [
            {
                type: "object",
                properties: {
                    max: { type: "integer", minimum: 1 },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const options = context.options[0] || {};
        const maxStatementsPerLine = typeof options.max !== "undefined" ? options.max : 1;

        let lastStatementLine = 0;
        let numberOfStatementsOnThisLine = 0;
        let firstExtraStatement = null;

        function reportFirstExtraStatementAndClear() {
            if (firstExtraStatement) {
                context.report({
                    node: firstExtraStatement,
                    message: `This line has ${numberOfStatementsOnThisLine} ${numberOfStatementsOnThisLine === 1 ? "statement" : "statements"}. Maximum allowed is ${maxStatementsPerLine}.`,
                });
            }
            firstExtraStatement = null;
        }

        function getActualLastToken(node) {
            return sourceCode.getLastToken(node, isNotSemicolonToken);
        }

        function enterStatement(node) {
            const line = node.loc.start.line;

            if (
                SINGLE_CHILD_ALLOWED.test(node.parent.type) &&
                node.parent.alternate !== node
            ) {
                return;
            }

            if (line === lastStatementLine) {
                numberOfStatementsOnThisLine += 1;
            } else {
                reportFirstExtraStatementAndClear();
                numberOfStatementsOnThisLine = 1;
                lastStatementLine = line;
            }

            if (numberOfStatementsOnThisLine === maxStatementsPerLine + 1) {
                firstExtraStatement = firstExtraStatement || node;
            }
        }

        function leaveStatement(node) {
            const lastToken = getActualLastToken(node);
            if (!lastToken) return;
            const line = lastToken.loc.end.line;

            if (line !== lastStatementLine) {
                reportFirstExtraStatementAndClear();
                numberOfStatementsOnThisLine = 1;
                lastStatementLine = line;
            }
        }

        return {
            BreakStatement: enterStatement,
            ClassDeclaration: enterStatement,
            ContinueStatement: enterStatement,
            DebuggerStatement: enterStatement,
            DoWhileStatement: enterStatement,
            ExpressionStatement: enterStatement,
            ForInStatement: enterStatement,
            ForOfStatement: enterStatement,
            ForStatement: enterStatement,
            FunctionDeclaration: enterStatement,
            IfStatement: enterStatement,
            ImportDeclaration: enterStatement,
            LabeledStatement: enterStatement,
            ReturnStatement: enterStatement,
            SwitchStatement: enterStatement,
            ThrowStatement: enterStatement,
            TryStatement: enterStatement,
            VariableDeclaration: enterStatement,
            WhileStatement: enterStatement,
            WithStatement: enterStatement,
            ExportNamedDeclaration: enterStatement,
            ExportDefaultDeclaration: enterStatement,
            ExportAllDeclaration: enterStatement,

            "BreakStatement:exit": leaveStatement,
            "ClassDeclaration:exit": leaveStatement,
            "ContinueStatement:exit": leaveStatement,
            "DebuggerStatement:exit": leaveStatement,
            "DoWhileStatement:exit": leaveStatement,
            "ExpressionStatement:exit": leaveStatement,
            "ForInStatement:exit": leaveStatement,
            "ForOfStatement:exit": leaveStatement,
            "ForStatement:exit": leaveStatement,
            "FunctionDeclaration:exit": leaveStatement,
            "IfStatement:exit": leaveStatement,
            "ImportDeclaration:exit": leaveStatement,
            "LabeledStatement:exit": leaveStatement,
            "ReturnStatement:exit": leaveStatement,
            "SwitchStatement:exit": leaveStatement,
            "ThrowStatement:exit": leaveStatement,
            "TryStatement:exit": leaveStatement,
            "VariableDeclaration:exit": leaveStatement,
            "WhileStatement:exit": leaveStatement,
            "WithStatement:exit": leaveStatement,
            "ExportNamedDeclaration:exit": leaveStatement,
            "ExportDefaultDeclaration:exit": leaveStatement,
            "ExportAllDeclaration:exit": leaveStatement,
            "Program:exit": reportFirstExtraStatementAndClear,
        };
    },
};

export default maxStatementsPerLineRule;
