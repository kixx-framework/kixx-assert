/**
 * no-func-assign — disallow reassigning function declarations.
 * Adapted from ESLint's no-func-assign rule.
 */

import { reportVariableReassignments } from "./reassignment-checker.js";

const noFuncAssignRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        return {
            "Program:exit"(node) {
                reportVariableReassignments(context, node, {
                    isTargetVariable: variable => variable.defs.some(def => def.type === "FunctionName"),
                    buildMessage: variable => `'${variable.name}' is a function.`,
                });
            },
        };
    },
};

export default noFuncAssignRule;
