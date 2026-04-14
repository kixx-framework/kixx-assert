/**
 * indent — enforce consistent indentation.
 * Adapted from ESLint's indent rule.
 *
 * Implementation approach:
 * - Walk the AST and build a map from line number to expected indentation
 * - Check the first token on each tracked line against expected indentation
 * - Handles blocks, functions, classes, switch/case, if/else, loops
 * - Multi-line expressions (member chains, call arguments) are not checked
 *   to avoid false positives in this simplified implementation
 */

function getIndentString(level, indentType, indentSize) {
    return indentType === "tab" ? "\t".repeat(level) : " ".repeat(level * indentSize);
}

function getActualIndentString(line, indentType) {
    const match = indentType === "tab" ? line.match(/^\t*/) : line.match(/^ */);
    return match ? match[0] : "";
}

function buildFirstTokenByLine(sourceCode) {
    const firstTokenByLine = new Map();

    for (const token of sourceCode.getTokens(sourceCode.ast, { includeComments: true })) {
        const line = token.loc.start.line;
        if (!firstTokenByLine.has(line)) {
            firstTokenByLine.set(line, token);
        }
    }

    return firstTokenByLine;
}

function reportUnexpectedIndent({ context, firstToken, lineNum, actualIndent, expectedLevel, indentType, indentSize }) {
    const actualSpaces = actualIndent.length;
    const expectedSpaces = indentType === "tab" ? expectedLevel : expectedLevel * indentSize;
    const unit = indentType === "tab" ? "tab" : "space";

    context.report({
        node: firstToken,
        loc: {
            start: { line: lineNum, column: 0 },
            end: { line: lineNum, column: actualIndent.length },
        },
        message: `Expected indentation of ${expectedSpaces} ${unit}${expectedSpaces === 1 ? "" : "s"} but found ${actualSpaces}.`,
    });
}

function validateIndentation({ context, sourceCode, lineExpectedIndent, skipLines, indentType, indentSize }) {
    const lines = sourceCode.getLines();
    const firstTokenByLine = buildFirstTokenByLine(sourceCode);

    for (const [lineNum, expectedLevel] of lineExpectedIndent) {
        if (skipLines.has(lineNum)) continue;

        const lineIndex = lineNum - 1;
        const line = lines[lineIndex];
        if (!line || line.trim() === "") continue;

        const firstToken = firstTokenByLine.get(lineNum);
        if (!firstToken) continue;

        const actualIndent = getActualIndentString(line, indentType);
        const expectedIndent = getIndentString(expectedLevel, indentType, indentSize);

        if (actualIndent !== expectedIndent) {
            reportUnexpectedIndent({
                context,
                firstToken,
                lineNum,
                actualIndent,
                expectedLevel,
                indentType,
                indentSize,
            });
        }
    }
}

const indentRule = {
    meta: {
        type: "layout",
        schema: [
            { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["tab"] }] },
            {
                type: "object",
                properties: {
                    SwitchCase: { type: "integer", minimum: 0, default: 0 },
                    VariableDeclarator: {
                        oneOf: [
                            { type: "integer", minimum: 0 },
                            { type: "object" },
                        ],
                    },
                    outerIIFEBody: { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["off"] }] },
                    MemberExpression: { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["off"] }] },
                    FunctionDeclaration: { type: "object" },
                    FunctionExpression: { type: "object" },
                    StaticBlock: { type: "object" },
                    CallExpression: { type: "object" },
                    ArrayExpression: { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first", "off"] }] },
                    ObjectExpression: { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first", "off"] }] },
                    ImportDeclaration: { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first", "off"] }] },
                    flatTernaryExpressions: { type: "boolean" },
                    offsetTernaryExpressions: { type: "boolean" },
                    ignoredNodes: { type: "array", items: { type: "string" } },
                    ignoreComments: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const rawIndent = context.options[0];
        const indentType = rawIndent === "tab" ? "tab" : "space";
        const indentSize = typeof rawIndent === "number" ? rawIndent : 4;
        const options = context.options[1] || {};
        const switchCaseIndent = options.SwitchCase ?? 0;
        const sourceCode = context.sourceCode;

        // Map from 1-based line number to expected indent in "units" (tabs or spaces)
        const lineExpectedIndent = new Map();
        // Set of lines to skip (e.g., template literal bodies)
        const skipLines = new Set();

        function setExpected(lineNumber, level) {
            if (!skipLines.has(lineNumber) && !lineExpectedIndent.has(lineNumber)) {
                lineExpectedIndent.set(lineNumber, level);
            }
        }

        /**
         * Mark lines inside template literals as skipped (their indentation is content).
         */
        function markTemplateLiteralLines(node) {
            for (const quasi of node.quasis) {
                const startLine = quasi.loc.start.line;
                const endLine = quasi.loc.end.line;
                for (let ln = startLine + 1; ln <= endLine; ln += 1) {
                    skipLines.add(ln);
                }
            }
        }

        /**
         * Set expected indentation for a list of statements/nodes (e.g. block body).
         */
        function processStatements(statements, level) {
            if (!statements || statements.length === 0) return;
            for (const stmt of statements) {
                if (stmt) {
                    setExpected(stmt.loc.start.line, level);
                    processNode(stmt, level);
                }
            }
        }

        /**
         * Process a block statement (e.g. function body, if body).
         * The opening brace is at parentLevel. Contents are at parentLevel + 1.
         */
        function processBlock(blockNode, parentLevel) {
            if (!blockNode) return;
            if (blockNode.type === "BlockStatement") {
                // Closing brace at parent level
                if (blockNode.loc.start.line !== blockNode.loc.end.line) {
                    setExpected(blockNode.loc.end.line, parentLevel);
                }
                processStatements(blockNode.body, parentLevel + 1);
            } else {
                // Non-block body (e.g. `if (x) stmt;`)
                setExpected(blockNode.loc.start.line, parentLevel + 1);
                processNode(blockNode, parentLevel + 1);
            }
        }

        /**
         * Process an arbitrary AST node to set expected indentation for its sub-parts.
         */
        function processNode(node, level) {
            if (!node || typeof node !== "object") return;

            switch (node.type) {
                case "FunctionDeclaration":
                case "FunctionExpression":
                case "ArrowFunctionExpression": {
                    if (node.body && node.body.type === "BlockStatement") {
                        if (node.body.loc.start.line !== node.body.loc.end.line) {
                            setExpected(node.body.loc.end.line, level);
                        }
                        processStatements(node.body.body, level + 1);
                    }
                    break;
                }

                case "BlockStatement": {
                    if (node.loc.start.line !== node.loc.end.line) {
                        setExpected(node.loc.end.line, level - 1);
                    }
                    processStatements(node.body, level);
                    break;
                }

                case "IfStatement": {
                    processBlock(node.consequent, level);
                    if (node.alternate) {
                        // else clause - else keyword is at parent level
                        if (node.alternate.type === "IfStatement") {
                            // else if
                            setExpected(node.alternate.loc.start.line, level);
                            processNode(node.alternate, level);
                        } else {
                            setExpected(node.alternate.loc.start.line, level + 1);
                            if (node.alternate.type === "BlockStatement") {
                                if (node.alternate.loc.start.line !== node.alternate.loc.end.line) {
                                    setExpected(node.alternate.loc.end.line, level);
                                }
                                processStatements(node.alternate.body, level + 1);
                            } else {
                                processNode(node.alternate, level + 1);
                            }
                        }
                    }
                    break;
                }

                case "WhileStatement":
                case "ForStatement":
                case "ForInStatement":
                case "ForOfStatement":
                case "DoWhileStatement":
                case "LabeledStatement":
                case "WithStatement": {
                    const body = node.body || node.statement;
                    if (body) processBlock(body, level);
                    break;
                }

                case "SwitchStatement": {
                    if (node.loc.start.line !== node.loc.end.line) {
                        setExpected(node.loc.end.line, level);
                    }
                    for (const caseNode of node.cases) {
                        setExpected(caseNode.loc.start.line, level + switchCaseIndent);
                        processStatements(caseNode.consequent, level + switchCaseIndent + 1);
                    }
                    break;
                }

                case "TryStatement": {
                    processBlock(node.block, level);
                    if (node.handler) {
                        setExpected(node.handler.loc.start.line, level);
                        processBlock(node.handler.body, level);
                    }
                    if (node.finalizer) {
                        setExpected(node.finalizer.loc.start.line, level);
                        processBlock(node.finalizer, level);
                    }
                    break;
                }

                case "ClassDeclaration":
                case "ClassExpression": {
                    if (node.body) {
                        if (node.body.loc.start.line !== node.body.loc.end.line) {
                            setExpected(node.body.loc.end.line, level);
                        }
                        for (const member of node.body.body) {
                            setExpected(member.loc.start.line, level + 1);
                            processNode(member, level + 1);
                        }
                    }
                    break;
                }

                case "ExportNamedDeclaration":
                case "ExportDefaultDeclaration": {
                    if (node.declaration) {
                        setExpected(node.declaration.loc.start.line, level);
                        processNode(node.declaration, level);
                    }
                    break;
                }

                case "MethodDefinition":
                case "PropertyDefinition": {
                    if (node.value) processNode(node.value, level);
                    break;
                }

                case "TemplateLiteral": {
                    markTemplateLiteralLines(node);
                    break;
                }

                case "Program": {
                    processStatements(node.body, 0);
                    break;
                }

                default:
                    break;
            }
        }

        return {
            Program(node) {
                // First mark all template literal lines as skip
                // We do this by walking all TemplateLiteral nodes via AST visitor
                // so we handle it in the TemplateLiteral visitor

                // Start processing from the program root
                // Program body is at level 0
                processStatements(node.body, 0);
            },

            TemplateLiteral(node) {
                markTemplateLiteralLines(node);
            },

            "Program:exit"() {
                validateIndentation({
                    context,
                    sourceCode,
                    lineExpectedIndent,
                    skipLines,
                    indentType,
                    indentSize,
                });
            },
        };
    },
};

export default indentRule;
