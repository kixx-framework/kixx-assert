/**
 * Reports declared variables that are never used.
 */

// Fixed configuration — options passed in are ignored.
const VARS_IGNORE_PATTERN = /^_/u;
const ARGS_IGNORE_PATTERN = /^_/u;
const DESTRUCTURED_ARRAY_IGNORE_PATTERN = /^_/u;

const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;
const LOGICAL_ASSIGN_OPERATORS = new Set(["&&=", "||=", "??="]);

function isFunctionNode(node) {
    return (
        node?.type === "FunctionDeclaration" ||
        node?.type === "FunctionExpression" ||
        node?.type === "ArrowFunctionExpression"
    );
}

function isLoopNode(node) {
    return (
        node?.type === "ForStatement" ||
        node?.type === "ForInStatement" ||
        node?.type === "ForOfStatement" ||
        node?.type === "WhileStatement" ||
        node?.type === "DoWhileStatement"
    );
}

function isInLoop(node) {
    let current = node.parent;

    while (current) {
        if (isLoopNode(current)) {
            return true;
        }

        if (isFunctionNode(current)) {
            return false;
        }

        current = current.parent;
    }

    return false;
}

function getUpperFunction(node) {
    let current = node.parent;

    while (current) {
        if (isFunctionNode(current)) {
            return current;
        }

        current = current.parent;
    }

    return null;
}

function isLogicalAssignmentOperator(operator) {
    return LOGICAL_ASSIGN_OPERATORS.has(operator);
}

/**
 * Returns the additional message suffix describing which ignore pattern applies.
 * @param {Object} def The variable definition.
 * @returns {string}
 */
function getAdditionalMessage(def) {
    if (!def) {
        return "";
    }

    if (def.name.parent.type === "ArrayPattern") {
        return `. Allowed unused elements of array destructuring must match ${DESTRUCTURED_ARRAY_IGNORE_PATTERN}`;
    }

    if (def.type === "Parameter") {
        return `. Allowed unused args must match ${ARGS_IGNORE_PATTERN}`;
    }

    if (def.type === "CatchClause") {
        return "";
    }

    return `. Allowed unused vars must match ${VARS_IGNORE_PATTERN}`;
}

const noUnusedVarsRule = {
    meta: {
        type: "problem",
    },

    create(context) {
        const sourceCode = context.sourceCode;

        /**
         * Determines if a variable is exported from a module.
         * @param {Variable} variable eslint-scope variable object.
         * @returns {boolean}
         */
        function isExported(variable) {
            const definition = variable.defs[0];

            if (definition) {
                let node = definition.node;

                if (node.type === "VariableDeclarator") {
                    node = node.parent;
                } else if (definition.type === "Parameter") {
                    return false;
                }

                return node.parent.type.indexOf("Export") === 0;
            }

            return false;
        }

        /**
         * Determines if a reference is a read operation.
         * @param {Reference} ref
         * @returns {boolean}
         */
        function isReadRef(ref) {
            return ref.isRead();
        }

        /**
         * Determines if a reference points to an enclosing function name (self-reference).
         * @param {Reference} ref
         * @param {ASTNode[]} nodes
         * @returns {boolean}
         */
        function isSelfReference(ref, nodes) {
            let scope = ref.from;

            while (scope) {
                if (nodes.includes(scope.block)) {
                    return true;
                }

                scope = scope.upper;
            }

            return false;
        }

        /**
         * Gets function definition nodes for a variable.
         * @param {Variable} variable
         * @returns {ASTNode[]}
         */
        function getFunctionDefinitions(variable) {
            const functionDefinitions = [];

            for (const def of variable.defs) {
                const { type, node } = def;

                if (type === "FunctionName") {
                    functionDefinitions.push(node);
                }

                if (
                    type === "Variable" &&
                    node.init &&
                    (node.init.type === "FunctionExpression" ||
                        node.init.type === "ArrowFunctionExpression")
                ) {
                    functionDefinitions.push(node.init);
                }
            }

            return functionDefinitions;
        }

        /**
         * Checks whether inner node is contained within outer node.
         * @param {ASTNode} inner
         * @param {ASTNode} outer
         * @returns {boolean}
         */
        function isInside(inner, outer) {
            return (
                inner.range[0] >= outer.range[0] &&
                inner.range[1] <= outer.range[1]
            );
        }

        /**
         * Checks whether a node is an unused expression.
         * @param {ASTNode} node
         * @returns {boolean}
         */
        function isUnusedExpression(node) {
            const parent = node.parent;

            if (parent.type === "ExpressionStatement") {
                return true;
            }

            if (parent.type === "SequenceExpression") {
                const isLastExpression = parent.expressions.at(-1) === node;

                if (!isLastExpression) {
                    return true;
                }

                return isUnusedExpression(parent);
            }

            return false;
        }

        /**
         * Gets the RHS node of an assignment if the reference is on the LHS.
         * @param {Reference} ref
         * @param {ASTNode|null} prevRhsNode
         * @returns {ASTNode|null}
         */
        function getRhsNode(ref, prevRhsNode) {
            const id = ref.identifier;
            const parent = id.parent;
            const refScope = ref.from.variableScope;
            const varScope = ref.resolved.scope.variableScope;
            const canBeUsedLater = refScope !== varScope || isInLoop(id);

            if (prevRhsNode && isInside(id, prevRhsNode)) {
                return prevRhsNode;
            }

            if (
                parent.type === "AssignmentExpression" &&
                isUnusedExpression(parent) &&
                id === parent.left &&
                !canBeUsedLater
            ) {
                return parent.right;
            }

            return null;
        }

        /**
         * Checks whether a function node is stored somewhere for later use.
         * @param {ASTNode} funcNode
         * @param {ASTNode} rhsNode
         * @returns {boolean}
         */
        function isStorableFunction(funcNode, rhsNode) {
            let node = funcNode;
            let parent = funcNode.parent;

            while (parent && isInside(parent, rhsNode)) {
                switch (parent.type) {
                    case "SequenceExpression":
                        if (parent.expressions.at(-1) !== node) {
                            return false;
                        }
                        break;

                    case "CallExpression":
                    case "NewExpression":
                        return parent.callee !== node;

                    case "AssignmentExpression":
                    case "TaggedTemplateExpression":
                    case "YieldExpression":
                        return true;

                    default:
                        if (STATEMENT_TYPE.test(parent.type)) {
                            return true;
                        }
                }

                node = parent;
                parent = parent.parent;
            }

            return false;
        }

        /**
         * Checks whether an identifier exists inside a storable function.
         * @param {ASTNode} id
         * @param {ASTNode} rhsNode
         * @returns {boolean}
         */
        function isInsideOfStorableFunction(id, rhsNode) {
            const funcNode = getUpperFunction(id);

            return (
                funcNode &&
                isInside(funcNode, rhsNode) &&
                isStorableFunction(funcNode, rhsNode)
            );
        }

        /**
         * Checks whether a reference is a read that only updates the variable itself.
         * @param {Reference} ref
         * @param {ASTNode|null} rhsNode
         * @returns {boolean}
         */
        function isReadForItself(ref, rhsNode) {
            const id = ref.identifier;
            const parent = id.parent;

            return (
                ref.isRead() &&
                ((parent.type === "AssignmentExpression" &&
                    parent.left === id &&
                    isUnusedExpression(parent) &&
                    !isLogicalAssignmentOperator(parent.operator)) ||
                    (parent.type === "UpdateExpression" &&
                        isUnusedExpression(parent)) ||
                    (rhsNode &&
                        isInside(id, rhsNode) &&
                        !isInsideOfStorableFunction(id, rhsNode)))
            );
        }

        /**
         * Determines if a reference is in a for-in/of loop that immediately returns.
         * @param {Reference} ref
         * @returns {boolean}
         */
        function isForInOfRef(ref) {
            let target = ref.identifier.parent;

            if (target.type === "VariableDeclarator") {
                target = target.parent.parent;
            }

            if (
                target.type !== "ForInStatement" &&
                target.type !== "ForOfStatement"
            ) {
                return false;
            }

            if (target.body.type === "BlockStatement") {
                target = target.body.body[0];
            } else {
                target = target.body;
            }

            if (!target) {
                return false;
            }

            return target.type === "ReturnStatement";
        }

        /**
         * Determines if the variable is used.
         * @param {Variable} variable
         * @returns {boolean}
         */
        function isUsedVariable(variable) {
            if (variable.eslintUsed) {
                return true;
            }

            const functionNodes = getFunctionDefinitions(variable);
            const isFunctionDefinition = functionNodes.length > 0;
            let rhsNode = null;

            return variable.references.some(ref => {
                if (isForInOfRef(ref)) {
                    return true;
                }

                const forItself = isReadForItself(ref, rhsNode);

                rhsNode = getRhsNode(ref, rhsNode);

                return (
                    isReadRef(ref) &&
                    !forItself &&
                    !(isFunctionDefinition && isSelfReference(ref, functionNodes))
                );
            });
        }

        /**
         * Collects unused variables from a scope and its descendants.
         * @param {Scope} scope
         * @param {Variable[]} unusedVars
         * @returns {Variable[]}
         */
        function collectUnusedVariables(scope, unusedVars) {
            for (const variable of scope.variables) {
                // skip class self-reference in class scope
                if (
                    scope.type === "class" &&
                    scope.block.id === variable.identifiers[0]
                ) {
                    continue;
                }

                // skip function expression name scope
                if (scope.functionExpressionScope) {
                    continue;
                }

                // skip variables marked as used via markVariableAsUsed()
                if (variable.eslintUsed) {
                    continue;
                }

                // skip implicit "arguments" variable
                if (
                    scope.type === "function" &&
                    variable.name === "arguments" &&
                    variable.identifiers.length === 0
                ) {
                    continue;
                }

                const def = variable.defs[0];

                if (def) {
                    const type = def.type;

                    // skip elements of array destructuring patterns matching the ignore pattern
                    const refUsedInArrayPatterns = variable.references.some(
                        ref => ref.identifier.parent.type === "ArrayPattern",
                    );

                    if (
                        (def.name.parent.type === "ArrayPattern" ||
                            refUsedInArrayPatterns) &&
                        DESTRUCTURED_ARRAY_IGNORE_PATTERN.test(def.name.name)
                    ) {
                        continue;
                    }

                    if (type === "Parameter") {
                        // skip setter arguments
                        if (
                            (def.node.parent.type === "Property" ||
                                def.node.parent.type === "MethodDefinition") &&
                            def.node.parent.kind === "set"
                        ) {
                            continue;
                        }

                        // skip parameters matching the ignore pattern
                        if (ARGS_IGNORE_PATTERN.test(def.name.name)) {
                            continue;
                        }
                    } else if (type !== "CatchClause") {
                        // skip variables matching the ignore pattern
                        if (VARS_IGNORE_PATTERN.test(def.name.name)) {
                            continue;
                        }
                    }
                }

                if (!isUsedVariable(variable) && !isExported(variable)) {
                    unusedVars.push(variable);
                }
            }

            for (const childScope of scope.childScopes) {
                collectUnusedVariables(childScope, unusedVars);
            }

            return unusedVars;
        }

        // Parse "exported" block comments and return a Set of exported variable names.
        function getExportedNames() {
            const exported = new Set();
            const comments = sourceCode.getAllComments();

            for (const comment of comments) {
                if (comment.type !== "Block") {
                    continue;
                }

                const match = /^\s*exported\s+([\s\S]*)$/iu.exec(comment.value);
                if (!match) {
                    continue;
                }

                const namePattern = /([^\s,:]+)/gu;
                let nameMatch;

                while ((nameMatch = namePattern.exec(match[1])) !== null) {
                    exported.add(nameMatch[1]);
                }
            }

            return exported;
        }

        return {
            "Program:exit"(programNode) {
                const exportedNames = getExportedNames();
                const unusedVars = collectUnusedVariables(
                    sourceCode.getScope(programNode),
                    [],
                ).filter(v => !exportedNames.has(v.name));

                for (const unusedVar of unusedVars) {
                    if (unusedVar.defs.length > 0) {
                        const writeReferences = unusedVar.references.filter(
                            ref =>
                                ref.isWrite() &&
                                ref.from.variableScope ===
                                    unusedVar.scope.variableScope,
                        );

                        const referenceToReport =
                            writeReferences.length > 0
                                ? writeReferences.at(-1)
                                : null;

                        const hasWriteRef = unusedVar.references.some(ref =>
                            ref.isWrite(),
                        );

                        const action = hasWriteRef
                            ? "assigned a value"
                            : "defined";

                        const additional = getAdditionalMessage(
                            unusedVar.defs[0],
                        );

                        context.report({
                            node: referenceToReport
                                ? referenceToReport.identifier
                                : unusedVar.identifiers[0],
                            message:
                                "'{{varName}}' is {{action}} but never used{{additional}}.",
                            data: {
                                varName: unusedVar.name,
                                action,
                                additional,
                            },
                        });
                    } else if (unusedVar.eslintExplicitGlobalComments) {
                        context.report({
                            node: programNode,
                            message:
                                "'{{varName}}' is defined but never used.",
                            data: {
                                varName: unusedVar.name,
                            },
                        });
                    }
                }
            },
        };
    },
};

export default noUnusedVarsRule;
