/**
 * no-const-assign — disallow reassigning const variables.
 * Adapted from ESLint's no-const-assign rule.
 */

import { reportVariableReassignments } from "./reassignment-checker.js";

function isConstDefinition(def) {
    return def.type === "Variable" &&
        def.parent &&
        def.parent.kind === "const";
}

const noConstAssignRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        return {
            "Program:exit"(node) {
                reportVariableReassignments(context, node, {
                    isTargetVariable: variable => variable.defs.some(isConstDefinition),
                    buildMessage: variable => `'${variable.name}' is constant.`,
                });
            },
        };
    },
};

export default noConstAssignRule;
