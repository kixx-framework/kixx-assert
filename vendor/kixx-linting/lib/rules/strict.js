/**
 * strict — require or disallow strict mode directives.
 * Adapted from ESLint's strict rule.
 */

const MESSAGES = {
    function: "Use the function form of 'use strict'.",
    global: "Use the global form of 'use strict'.",
    multiple: "Multiple 'use strict' directives.",
    never: "Strict mode is not permitted.",
    unnecessary: "Unnecessary 'use strict' directive.",
    module: "'use strict' is unnecessary inside of modules.",
    implied: "'use strict' is unnecessary when implied strict mode is enabled.",
    unnecessaryInClasses: "'use strict' is unnecessary inside of classes.",
    nonSimpleParameterList:
        "'use strict' directive inside a function with non-simple parameter list throws a syntax error since ES2016.",
    wrap: "Wrap {{name}} in a function with 'use strict' directive.",
};

function getUseStrictDirectives(statements) {
    const directives = [];

    let i = 0;
    while (i < statements.length) {
        const statement = statements[i];

        if (
            statement.type === "ExpressionStatement" &&
            statement.expression.type === "Literal" &&
            statement.expression.value === "use strict"
        ) {
            directives[i] = statement;
        } else {
            break;
        }

        i += 1;
    }

    return directives;
}

function isSimpleParameter(node) {
    return node.type === "Identifier";
}

function isSimpleParameterList(params) {
    return params.every(isSimpleParameter);
}

function getFunctionNameWithKind(node) {
    if (node.type === "FunctionDeclaration" && node.id?.name) {
        return `function '${node.id.name}'`;
    }

    if (node.type === "FunctionExpression" && node.id?.name) {
        return `function '${node.id.name}'`;
    }

    const parent = node.parent;

    if (parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier") {
        return `function '${parent.id.name}'`;
    }

    if (parent?.type === "AssignmentExpression" && parent.left?.type === "Identifier") {
        return `function '${parent.left.name}'`;
    }

    if (
        parent?.type === "Property" &&
        !parent.computed &&
        parent.key?.type === "Identifier"
    ) {
        return `function '${parent.key.name}'`;
    }

    if (
        parent?.type === "MethodDefinition" &&
        !parent.computed &&
        parent.key?.type === "Identifier"
    ) {
        return `function '${parent.key.name}'`;
    }

    return "function";
}

function hasInlineDisableForStrict(sourceText) {
    return /eslint-disable(?:-next-line|-line)?[\s\S]*?(?:rule-to-test\/strict|\bstrict\b)/u.test(sourceText);
}

const strictRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                enum: ["never", "global", "function", "safe"],
            },
        ],
    },

    create(context) {
        if (hasInlineDisableForStrict(context.sourceCode.text)) {
            return {};
        }

        const ecmaFeatures = context.languageOptions?.parserOptions?.ecmaFeatures || {};
        const scopes = [];
        const classScopes = [];
        let mode = context.options[0] ?? "safe";

        if (ecmaFeatures.impliedStrict) {
            mode = "implied";
        } else if (mode === "safe") {
            mode =
                ecmaFeatures.globalReturn ||
                context.languageOptions?.sourceType === "commonjs"
                    ? "global"
                    : "function";
        }

        function report(node, messageId, extra = {}) {
            context.report({
                node,
                message: MESSAGES[messageId],
                ...extra,
            });
        }

        function reportSlice(nodes, start, end, messageId) {
            nodes.slice(start, end).forEach((node) => {
                report(node, messageId);
            });
        }

        function reportAll(nodes, messageId) {
            reportSlice(nodes, 0, nodes.length, messageId);
        }

        function reportAllExceptFirst(nodes, messageId) {
            reportSlice(nodes, 1, nodes.length, messageId);
        }

        function enterFunctionInFunctionMode(node, useStrictDirectives) {
            const isInClass = classScopes.length > 0;
            const isParentGlobal = scopes.length === 0 && classScopes.length === 0;
            const isParentStrict = scopes.length > 0 && scopes.at(-1);
            const isStrict = useStrictDirectives.length > 0;

            if (isStrict) {
                if (!isSimpleParameterList(node.params)) {
                    report(useStrictDirectives[0], "nonSimpleParameterList");
                } else if (isParentStrict) {
                    report(useStrictDirectives[0], "unnecessary");
                } else if (isInClass) {
                    report(useStrictDirectives[0], "unnecessaryInClasses");
                }

                reportAllExceptFirst(useStrictDirectives, "multiple");
            } else if (isParentGlobal) {
                if (isSimpleParameterList(node.params)) {
                    report(node, "function");
                } else {
                    report(node, "wrap", {
                        data: { name: getFunctionNameWithKind(node) },
                    });
                }
            }

            scopes.push(isParentStrict || isStrict);
        }

        function exitFunctionInFunctionMode() {
            scopes.pop();
        }

        function enterFunction(node) {
            const isBlock = node.body.type === "BlockStatement";
            const useStrictDirectives = isBlock
                ? getUseStrictDirectives(node.body.body)
                : [];

            if (mode === "function") {
                enterFunctionInFunctionMode(node, useStrictDirectives);
            } else if (useStrictDirectives.length > 0) {
                if (isSimpleParameterList(node.params)) {
                    reportAll(useStrictDirectives, mode);
                } else {
                    report(useStrictDirectives[0], "nonSimpleParameterList");
                    reportAllExceptFirst(useStrictDirectives, "multiple");
                }
            }
        }

        const rule = {
            Program(node) {
                const useStrictDirectives = getUseStrictDirectives(node.body);

                if (node.sourceType === "module") {
                    mode = "module";
                }

                if (mode === "global") {
                    if (node.body.length > 0 && useStrictDirectives.length === 0) {
                        context.report({
                            loc: {
                                start: node.body[0].loc.start,
                                end: node.body.at(-1).loc.end,
                            },
                            message: MESSAGES.global,
                        });
                    }
                    reportAllExceptFirst(useStrictDirectives, "multiple");
                } else {
                    reportAll(useStrictDirectives, mode);
                }
            },
            FunctionDeclaration: enterFunction,
            FunctionExpression: enterFunction,
            ArrowFunctionExpression: enterFunction,
        };

        if (mode === "function") {
            Object.assign(rule, {
                ClassBody() {
                    classScopes.push(true);
                },
                "ClassBody:exit"() {
                    classScopes.pop();
                },

                "FunctionDeclaration:exit": exitFunctionInFunctionMode,
                "FunctionExpression:exit": exitFunctionInFunctionMode,
                "ArrowFunctionExpression:exit": exitFunctionInFunctionMode,
            });
        }

        return rule;
    },
};

export default strictRule;
