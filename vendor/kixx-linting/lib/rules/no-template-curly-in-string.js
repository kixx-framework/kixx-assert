/**
 * no-template-curly-in-string — disallow template literal placeholder syntax in regular strings.
 * Adapted from ESLint's no-template-curly-in-string rule.
 */

const TEMPLATE_EXPR_RE = /\$\{[^}]+\}/u;

const noTemplateCurlyInStringRule = {
    meta: {
        type: "problem",
        schema: [],
    },

    create(context) {
        return {
            Literal(node) {
                if (typeof node.value === "string" && TEMPLATE_EXPR_RE.test(node.value)) {
                    context.report({
                        node,
                        message: "Unexpected template string expression.",
                    });
                }
            },
        };
    },
};

export default noTemplateCurlyInStringRule;
