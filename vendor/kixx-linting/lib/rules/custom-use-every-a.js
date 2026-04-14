/**
 * Test fixture rule that marks every identifier as used for `no-unused-vars` coverage.
 *
 * It exercises `markVariableAsUsed()` so the tests can verify that variables are
 * treated as used when a rule marks them by name.
 */
const customUseEveryARule = {
    meta: {
        type: "suggestion",
    },

    create(context) {
        return {
            "Identifier"(node) {
                context.markVariableAsUsed(node.name);
            },
        };
    },
};

export default customUseEveryARule;
