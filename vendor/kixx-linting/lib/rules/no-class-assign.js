/**
 * no-class-assign — disallow reassigning class declarations.
 * Adapted from ESLint's no-class-assign rule.
 */

import { reportVariableReassignments } from "./reassignment-checker.js";

const noClassAssignRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        return {
            "Program:exit"(node) {
                reportVariableReassignments(context, node, {
                    isTargetVariable: variable => variable.defs.some(def => def.type === "ClassName"),
                    buildMessage: variable => `'${variable.name}' is a class.`,
                });
            },
        };
    },
};

export default noClassAssignRule;
