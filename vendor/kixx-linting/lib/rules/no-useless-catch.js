/**
 * no-useless-catch — disallow unnecessary catch clauses.
 * Adapted from ESLint's no-useless-catch rule.
 */

const noUselessCatchRule = {
    meta: { type: "suggestion", schema: [] },
    create(context) {
        return {
            CatchClause(node) {
                // A catch clause is useless if its only statement is `throw param`
                if (!node.param) return; // catch without binding (ES2019)
                const paramName = node.param.type === "Identifier" ? node.param.name : null;
                if (!paramName) return;

                const body = node.body.body;
                if (body.length !== 1) return;

                const stmt = body[0];
                if (stmt.type !== "ThrowStatement") return;
                if (!stmt.argument) return;
                if (stmt.argument.type !== "Identifier") return;
                if (stmt.argument.name !== paramName) return;

                context.report({
                    node,
                    message: "Unnecessary catch clause.",
                });
            },
        };
    },
};

export default noUselessCatchRule;
