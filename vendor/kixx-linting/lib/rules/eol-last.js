/**
 * eol-last — require or disallow newline at the end of files.
 * Adapted from ESLint's eol-last rule.
 */

const eolLastRule = {
    meta: {
        type: "layout",
        schema: [{ enum: ["always", "never", "unix", "windows"] }],
    },

    create(context) {
        return {
            Program(node) {
                const sourceCode = context.sourceCode;
                const src = sourceCode.getText();

                // Empty source is always valid
                if (!src.length) return;

                let mode = context.options[0] || "always";

                // "unix" and "windows" both mean "always" for detection purposes
                if (mode === "unix" || mode === "windows") {
                    mode = "always";
                }

                const endsWithNewline = src.endsWith("\n");
                const lines = sourceCode.getLines();

                if (mode === "always" && !endsWithNewline) {
                    context.report({
                        node,
                        loc: {
                            line: lines.length,
                            column: lines[lines.length - 1].length,
                        },
                        message: "Newline required at end of file but not found.",
                    });
                } else if (mode === "never" && endsWithNewline) {
                    context.report({
                        node,
                        loc: {
                            start: {
                                line: lines.length - 1,
                                column: lines[lines.length - 2]?.length ?? 0,
                            },
                            end: { line: lines.length, column: 0 },
                        },
                        message: "Newline not allowed at end of file.",
                    });
                }
            },
        };
    },
};

export default eolLastRule;
