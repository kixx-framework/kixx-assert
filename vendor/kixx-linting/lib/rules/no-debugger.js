/**
 * no-debugger — disallow the use of `debugger`.
 * Adapted from ESLint's no-debugger rule.
 */

const noDebuggerRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        return {
            DebuggerStatement(node) {
                context.report({ node, message: "Unexpected 'debugger' statement." });
            },
        };
    },
};

export default noDebuggerRule;
