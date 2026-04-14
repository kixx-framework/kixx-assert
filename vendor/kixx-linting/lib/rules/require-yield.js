/**
 * require-yield — require generator functions to contain yield.
 * Adapted from ESLint's require-yield rule.
 */

function containsYield(node) {
    let found = false;
    function walk(n) {
        if (found) return;
        if (!n || typeof n !== "object") return;
        // Don't look inside nested generators
        if (
            n !== node &&
            (n.type === "FunctionDeclaration" || n.type === "FunctionExpression") &&
            n.generator
        ) {
            return;
        }
        if (n.type === "YieldExpression") {
            found = true;
            return;
        }
        for (const key of Object.keys(n)) {
            if (key === "parent") continue;
            const child = n[key];
            if (Array.isArray(child)) child.forEach(walk);
            else if (child && typeof child === "object" && child.type) walk(child);
        }
    }
    walk(node.body);
    return found;
}

const requireYieldRule = {
    meta: { type: "suggestion", schema: [] },
    create(context) {
        return {
            FunctionDeclaration(node) {
                if (!node.generator) return;
                if (node.body.body.length === 0) return; // empty body is fine
                if (!containsYield(node)) {
                    context.report({
                        node,
                        message: "This generator function does not have 'yield'.",
                    });
                }
            },
            FunctionExpression(node) {
                if (!node.generator) return;
                if (node.body.body.length === 0) return;
                if (!containsYield(node)) {
                    context.report({
                        node,
                        message: "This generator function does not have 'yield'.",
                    });
                }
            },
        };
    },
};

export default requireYieldRule;
