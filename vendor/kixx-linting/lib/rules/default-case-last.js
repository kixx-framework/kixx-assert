/**
 * default-case-last — enforce default clauses in switch statements to be last.
 * Adapted from ESLint's default-case-last rule.
 */

const defaultCaseLastRule = {
    meta: { type: "suggestion", schema: [] },
    create(context) {
        return {
            SwitchStatement(node) {
                const cases = node.cases;
                const indexOfDefault = cases.findIndex(c => c.test === null);
                if (indexOfDefault !== -1 && indexOfDefault !== cases.length - 1) {
                    context.report({
                        node: cases[indexOfDefault],
                        message: "Default clause should be the last clause.",
                    });
                }
            },
        };
    },
};

export default defaultCaseLastRule;
