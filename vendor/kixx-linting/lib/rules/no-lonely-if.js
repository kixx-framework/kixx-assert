/**
 * no-lonely-if — disallow if statements as the only statement in else blocks.
 * Adapted from ESLint's no-lonely-if rule.
 */

const noLonelyIfRule = {
    meta: { type: "suggestion", schema: [] },
    create(context) {
        return {
            IfStatement(node) {
                const parent = node.parent;
                const outerIf = parent.parent;
                const maybeDanglingIf = outerIf?.parent;

                if (
                    maybeDanglingIf?.type === "IfStatement" &&
                    maybeDanglingIf.consequent === outerIf
                ) {
                    return;
                }

                if (
                    parent.type === "BlockStatement" &&
                    parent.body.length === 1 &&
                    outerIf.type === "IfStatement" &&
                    outerIf.alternate === parent
                ) {
                    context.report({
                        node,
                        message: "Unexpected if as the only statement in an else block.",
                    });
                }
            },
        };
    },
};

export default noLonelyIfRule;
