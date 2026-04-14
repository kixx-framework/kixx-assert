/**
 * no-irregular-whitespace — disallow irregular whitespace characters.
 * Adapted from ESLint's no-irregular-whitespace rule.
 */


const ALL_IRREGULARS = /[\f\v\u0085\ufeff\u00a0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u200b\u202f\u205f\u3000\u2028\u2029]/u;
const IRREGULAR_WHITESPACE = /[\f\v\u0085\ufeff\u00a0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u200b\u202f\u205f\u3000]+/gu;
const IRREGULAR_LINE_TERMINATORS = /[\u2028\u2029]/gu;
const LINE_BREAK = /\r\n|[\r\n\u2028\u2029]/gu;


const noIrregularWhitespaceRule = {
    meta: {
        type: "problem",
        schema: [
            {
                type: "object",
                properties: {
                    skipComments: { type: "boolean" },
                    skipStrings: { type: "boolean" },
                    skipTemplates: { type: "boolean" },
                    skipRegExps: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const options = context.options[0] || {};
        // Default: skipStrings is true per ESLint reference
        const skipComments = options.skipComments ?? false;
        const skipStrings = options.skipStrings ?? true;
        const skipTemplates = options.skipTemplates ?? false;
        const skipRegExps = options.skipRegExps ?? false;

        const sourceCode = context.sourceCode;
        const commentNodes = sourceCode.getAllComments();

        // Accumulated errors, which may be filtered out by node visitors
        let errors = [];

        function removeWhitespaceError(node) {
            const locStart = node.loc.start;
            const locEnd = node.loc.end;
            errors = errors.filter(({ loc: { start: errorLocStart } }) =>
                errorLocStart.line < locStart.line ||
                (errorLocStart.line === locStart.line && errorLocStart.column < locStart.column) ||
                (errorLocStart.line === locEnd.line && errorLocStart.column >= locEnd.column) ||
                errorLocStart.line > locEnd.line,
            );
        }

        function removeInvalidNodeErrorsInLiteral(node) {
            const shouldCheckStrings = skipStrings && typeof node.value === "string";
            const shouldCheckRegExps = skipRegExps && Boolean(node.regex);
            if (shouldCheckStrings || shouldCheckRegExps) {
                if (ALL_IRREGULARS.test(node.raw)) {
                    removeWhitespaceError(node);
                }
            }
        }

        function removeInvalidNodeErrorsInTemplateLiteral(node) {
            if (typeof node.value.raw === "string") {
                if (ALL_IRREGULARS.test(node.value.raw)) {
                    removeWhitespaceError(node);
                }
            }
        }

        function removeInvalidNodeErrorsInComment(node) {
            if (ALL_IRREGULARS.test(node.value)) {
                removeWhitespaceError(node);
            }
        }

        function checkForIrregularWhitespace(node) {
            const sourceLines = sourceCode.getLines();
            sourceLines.forEach((sourceLine, lineIndex) => {
                const lineNumber = lineIndex + 1;
                // Reset lastIndex since regex is stateful (g flag)
                IRREGULAR_WHITESPACE.lastIndex = 0;
                let match;
                while ((match = IRREGULAR_WHITESPACE.exec(sourceLine)) !== null) {
                    const isLeadingBOM = lineNumber === 1 && match.index === 0 && match[0][0] === "\ufeff";
                    if (isLeadingBOM) {
                        // A byte-order mark at the start of a file is allowed.
                        if (match[0].length === 1) {
                            continue;
                        }
                        errors.push({
                            node,
                            loc: {
                                start: { line: lineNumber, column: 1 },
                                end: { line: lineNumber, column: match[0].length },
                            },
                            message: "Irregular whitespace not allowed.",
                        });
                        continue;
                    }
                    errors.push({
                        node,
                        loc: {
                            start: { line: lineNumber, column: match.index },
                            end: { line: lineNumber, column: match.index + match[0].length },
                        },
                        message: "Irregular whitespace not allowed.",
                    });
                }
            });
        }

        function checkForIrregularLineTerminators(node) {
            const source = sourceCode.getText();
            const sourceLines = sourceCode.getLines();
            const linebreaksRe = new RegExp(LINE_BREAK.source, "gu");
            const linebreaks = source.match(linebreaksRe) || [];
            let lastLineIndex = -1;
            const irregularRe = new RegExp(IRREGULAR_LINE_TERMINATORS.source, "gu");
            let match;
            while ((match = irregularRe.exec(source)) !== null) {
                const lineIndex = linebreaks.indexOf(match[0], lastLineIndex + 1) || 0;
                errors.push({
                    node,
                    loc: {
                        start: {
                            line: lineIndex + 1,
                            column: sourceLines[lineIndex]?.length ?? 0,
                        },
                        end: {
                            line: lineIndex + 2,
                            column: 0,
                        },
                    },
                    message: "Irregular whitespace not allowed.",
                });
                lastLineIndex = lineIndex;
            }
        }

        // Only register the heavy visitors if there are actually irregular chars
        if (!ALL_IRREGULARS.test(sourceCode.getText())) {
            return { Program() {} };
        }

        const nodes = {
            Program(node) {
                checkForIrregularWhitespace(node);
                checkForIrregularLineTerminators(node);
            },
            Literal: removeInvalidNodeErrorsInLiteral,
            TemplateElement: skipTemplates ? removeInvalidNodeErrorsInTemplateLiteral : () => {},
            "Program:exit"() {
                if (skipComments) {
                    commentNodes.forEach(removeInvalidNodeErrorsInComment);
                }
                errors.forEach(error => context.report(error));
            },
        };

        return nodes;
    },
};

export default noIrregularWhitespaceRule;
