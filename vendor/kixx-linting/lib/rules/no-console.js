/**
 * Reports `console` member calls unless the method is explicitly allowed.
 */

const noConsoleRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    allow: {
                        type: "array",
                        items: { type: "string" },
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const allowedMethods = new Set(context.options[0]?.allow ?? []);

        return {
            "Program:exit"(node) {
                const globalScope = context.sourceCode.getScope(node);
                const reported = new Set();

                for (const reference of globalScope.through) {
                    if (reference.identifier.name !== "console") {
                        continue;
                    }

                    const parent = reference.identifier.parent;

                    if (parent?.type !== "MemberExpression" || parent.object !== reference.identifier) {
                        continue;
                    }

                    if (
                        !parent.computed &&
                        parent.property.type === "Identifier" &&
                        allowedMethods.has(parent.property.name)
                    ) {
                        continue;
                    }

                    const key = `${parent.range[0]}:${parent.range[1]}`;
                    if (reported.has(key)) {
                        continue;
                    }
                    reported.add(key);

                    context.report({
                        node: parent,
                        message: "Unexpected console statement.",
                    });
                }
            },
        };
    },
};

export default noConsoleRule;
