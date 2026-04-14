/**
 * no-ex-assign — disallow reassigning exceptions in catch clauses.
 * Adapted from ESLint's no-ex-assign rule.
 */

import { reportVariableReassignments } from "./reassignment-checker.js";

const noExAssignRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        return {
            "Program:exit"(node) {
                reportVariableReassignments(context, node, {
                    isTargetVariable: (variable, scope) => {
                        return scope.type === "catch" &&
                            variable.defs.some(def => def.type === "CatchClause");
                    },
                    buildMessage: () => "Do not assign to the exception parameter.",
                });
            },
        };
    },
};

export default noExAssignRule;
