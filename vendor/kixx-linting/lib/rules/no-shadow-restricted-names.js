/**
 * no-shadow-restricted-names — disallow identifiers from shadowing restricted names.
 * Adapted from ESLint's no-shadow-restricted-names rule.
 */

const RESTRICTED_NAMES = new Set([
    "undefined",
    "NaN",
    "Infinity",
    "eval",
    "arguments",
]);

const noShadowRestrictedNamesRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    reportGlobalThis: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const reportGlobalThis = context.options[0]?.reportGlobalThis ?? true;

        function shouldReportDefinition(def) {
            if (!def) {
                return false;
            }

            if (def.type !== "Variable") {
                return true;
            }

            // `var/let undefined;` without initialization is intentionally allowed.
            if (!def.node || def.node.type !== "VariableDeclarator") {
                return true;
            }

            return def.node.init !== null;
        }

        function reportVariableIfNeeded(variable) {
            const reportableDef = variable.defs.find(shouldReportDefinition);

            if (reportableDef?.name) {
                context.report({
                    node: reportableDef.name,
                    message: `Shadowing of global property '${variable.name}'.`,
                });
                return;
            }

            // Assigning to restricted identifiers (e.g. `undefined = 5`) is invalid.
            const writeReference = variable.references.find(reference => reference.isWrite());

            if (writeReference?.identifier) {
                context.report({
                    node: writeReference.identifier,
                    message: `Shadowing of global property '${variable.name}'.`,
                });
            }
        }

        return {
            "Program:exit"(node) {
                const scope = context.sourceCode.getScope(node);
                const restrictedNames = new Set(RESTRICTED_NAMES);

                if (reportGlobalThis) {
                    restrictedNames.add("globalThis");
                }

                function checkScope(s) {
                    for (const variable of s.variables) {
                        if (!restrictedNames.has(variable.name)) continue;
                        reportVariableIfNeeded(variable);
                    }

                    for (const child of s.childScopes) {
                        checkScope(child);
                    }
                }

                checkScope(scope);
            },
        };
    },
};

export default noShadowRestrictedNamesRule;
