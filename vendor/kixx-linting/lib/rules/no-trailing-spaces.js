/**
 * no-trailing-spaces — disallow trailing whitespace at the end of lines.
 * Adapted from ESLint's no-trailing-spaces rule.
 */

// Matches trailing whitespace characters (common space-like chars)
const BLANK_CLASS = "[ \t\u00a0\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u200b\u3000]";
const NONBLANK = new RegExp(`${BLANK_CLASS}+$`, "u");

function getLinebreaks(text) {
    const linebreaks = [];
    let index = 0;

    while (index < text.length) {
        const character = text[index];

        if (character === "\r" && text[index + 1] === "\n") {
            linebreaks.push("\r\n");
            index += 2;
            continue;
        }

        if (character === "\r" || character === "\n") {
            linebreaks.push(character);
        }

        index += 1;
    }

    return linebreaks;
}

const noTrailingSpacesRule = {
    meta: {
        type: "layout",
        schema: [],
    },

    create(context) {
        const sourceCode = context.sourceCode;

        return {
            Program(node) {
                const lines = sourceCode.getLines();
                const src = sourceCode.getText();

                // Track absolute ranges covered by template elements so we can
                // ignore trailing spaces that are inside template literal text.
                const templateRanges = [];

                function collectTemplateRanges(astNode) {
                    if (!astNode || typeof astNode !== "object") return;
                    if (astNode.type === "TemplateElement") {
                        const start = astNode.range?.[0] ?? astNode.start;
                        const end = astNode.range?.[1] ?? astNode.end;
                        if (typeof start === "number" && typeof end === "number") {
                            templateRanges.push([start, end]);
                        }
                    }
                    for (const key of Object.keys(astNode)) {
                        if (key === "parent") continue;
                        const child = astNode[key];
                        if (Array.isArray(child)) {
                            child.forEach(collectTemplateRanges);
                        } else if (child && typeof child === "object" && child.type) {
                            collectTemplateRanges(child);
                        }
                    }
                }
                collectTemplateRanges(sourceCode.ast);

                // Build line break lengths for accurate range calculation
                const linebreaks = getLinebreaks(src);

                let totalLength = 0;
                for (let i = 0; i < lines.length; i += 1) {
                    const lineNumber = i + 1;
                    const lineStartIndex = totalLength;
                    const linebreakLength = linebreaks[i] ? linebreaks[i].length : 1;
                    const lineLength = lines[i].length + linebreakLength;
                    const lineText = lines[i].endsWith("\r") ? lines[i].slice(0, -1) : lines[i];

                    const matches = NONBLANK.exec(lineText);

                    if (matches) {
                        const trailingStart = lineStartIndex + matches.index;
                        const trailingEnd = lineStartIndex + lineText.length;
                        const isInTemplate = templateRanges.some(([start, end]) =>
                            trailingStart >= start && trailingEnd <= end,
                        );

                        if (isInTemplate) {
                            totalLength += lineLength;
                            continue;
                        }

                        context.report({
                            node,
                            loc: {
                                start: {
                                    line: lineNumber,
                                    column: matches.index,
                                },
                                end: {
                                    line: lineNumber,
                                    column: lineText.length,
                                },
                            },
                            message: "Trailing spaces not allowed.",
                        });
                    }

                    totalLength += lineLength;
                }
            },
        };
    },
};

export default noTrailingSpacesRule;
