/**
 * no-unused-labels — disallow unused labels.
 * Adapted from ESLint's no-unused-labels rule.
 */

const noUnusedLabelsRule = {
    meta: { type: "suggestion", schema: [] },
    create(context) {
        // Stack of label info: { name, node, used }
        const labelStack = [];

        return {
            LabeledStatement(node) {
                labelStack.push({
                    name: node.label.name,
                    node,
                    used: false,
                });
            },
            "LabeledStatement:exit"() {
                const info = labelStack.pop();
                if (info && !info.used) {
                    context.report({
                        node: info.node.label,
                        message: `'${info.name}' is defined but never used.`,
                    });
                }
            },
            BreakStatement(node) {
                if (!node.label) return;
                const name = node.label.name;
                // Mark the closest matching label as used
                let i = labelStack.length - 1;

                while (i >= 0) {
                    if (labelStack[i].name === name) {
                        labelStack[i].used = true;
                        break;
                    }

                    i -= 1;
                }
            },
            ContinueStatement(node) {
                if (!node.label) return;
                const name = node.label.name;
                let i = labelStack.length - 1;

                while (i >= 0) {
                    if (labelStack[i].name === name) {
                        labelStack[i].used = true;
                        break;
                    }

                    i -= 1;
                }
            },
        };
    },
};

export default noUnusedLabelsRule;
