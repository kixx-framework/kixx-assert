/**
 * no-this-before-super — disallow this/super before calling super() in constructors.
 * Adapted from ESLint's no-this-before-super rule.
 */

function getClassAncestor(node) {
    let current = node.parent;
    while (current) {
        if (current.type === "ClassDeclaration" || current.type === "ClassExpression") {
            return current;
        }
        current = current.parent;
    }
    return null;
}

function isDerivedClass(classNode) {
    return classNode && classNode.superClass !== null && classNode.superClass !== undefined;
}

function isNestedBoundary(node) {
    return (
        node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression" ||
        node.type === "ClassDeclaration" ||
        node.type === "ClassExpression"
    );
}

function clonePath(path) {
    return { superCalls: path.superCalls, completion: path.completion };
}

function normalizePaths(paths) {
    const seen = new Set();
    return paths.filter(path => {
        const key = `${path.superCalls}:${path.completion}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function markSuperCall(path) {
    const next = clonePath(path);
    next.superCalls = Math.min(next.superCalls + 1, 2);
    return next;
}

function addViolation(violations, node, message) {
    const key = `${message}:${node.start}:${node.end}`;
    if (!violations.has(key)) {
        violations.set(key, { node, message });
    }
}

function evalExpression(node, path, violations) {
    if (!node || typeof node !== "object") {
        return [ path ];
    }

    if (isNestedBoundary(node)) {
        return [ path ];
    }

    switch (node.type) {
        case "ThisExpression":
            if (path.superCalls === 0) {
                addViolation(violations, node, "'this' is not allowed before 'super()'.");
            }
            return [ path ];

        case "Super":
            if (
                path.superCalls === 0 &&
                (!node.parent || node.parent.type !== "CallExpression" || node.parent.callee !== node)
            ) {
                addViolation(violations, node, "'super' is not allowed before 'super()'.");
            }
            return [ path ];

        case "CallExpression":
            if (node.callee && node.callee.type === "Super") {
                let paths = [ path ];
                for (const arg of node.arguments) {
                    paths = flatMapActive(paths, current => evalExpression(arg, current, violations));
                }
                return paths.map(markSuperCall);
            }
            return evalExpressionChildren(node, path, violations);

        case "ChainExpression":
            return evalExpression(node.expression, path, violations);

        case "ConditionalExpression": {
            const testPaths = evalExpression(node.test, path, violations);
            const consequent = flatMapActive(
                testPaths,
                current => evalExpression(node.consequent, current, violations),
            );
            const alternate = flatMapActive(
                testPaths,
                current => evalExpression(node.alternate, current, violations),
            );
            return normalizePaths([ ...consequent, ...alternate ]);
        }

        case "LogicalExpression": {
            const leftPaths = evalExpression(node.left, path, violations);
            const skippedRight = leftPaths.map(clonePath);
            const ranRight = flatMapActive(
                leftPaths,
                current => evalExpression(node.right, current, violations),
            );
            return normalizePaths([ ...skippedRight, ...ranRight ]);
        }

        case "SequenceExpression": {
            let paths = [ path ];
            for (const expression of node.expressions) {
                paths = flatMapActive(paths, current => evalExpression(expression, current, violations));
            }
            return paths;
        }

        case "AssignmentExpression":
            if (node.operator === "&&=" || node.operator === "||=" || node.operator === "??=") {
                const leftPaths = evalExpression(node.left, path, violations);
                const skippedRight = leftPaths.map(clonePath);
                const ranRight = flatMapActive(
                    leftPaths,
                    current => evalExpression(node.right, current, violations),
                );
                return normalizePaths([ ...skippedRight, ...ranRight ]);
            }
            return evalExpressionChildren(node, path, violations);

        default:
            return evalExpressionChildren(node, path, violations);
    }
}

function evalExpressionChildren(node, path, violations) {
    let paths = [ path ];

    for (const [ key, child ] of Object.entries(node)) {
        if (key === "parent" || key === "type" || key === "loc" || key === "range"
                || key === "start" || key === "end") {
            continue;
        }

        if (Array.isArray(child)) {
            for (const item of child) {
                if (item && typeof item === "object" && item.type) {
                    paths = flatMapActive(paths, current => evalExpression(item, current, violations));
                }
            }
        } else if (child && typeof child === "object" && child.type) {
            paths = flatMapActive(paths, current => evalExpression(child, current, violations));
        }
    }

    return paths;
}

function evalStatements(statements, initialPaths, context, violations) {
    let paths = initialPaths;

    for (const statement of statements) {
        paths = flatMap(paths, path => {
            if (path.completion !== "active") {
                return [ path ];
            }
            return evalStatement(statement, path, context, violations);
        });
        paths = normalizePaths(paths);
    }

    return paths;
}

function evalLoop(bodyNode, path, context, loopOptions, violations) {
    const outcomes = [];

    if (!loopOptions.atLeastOnce) {
        outcomes.push(clonePath(path));
    }

    const firstIteration = evalLoopBody(bodyNode, path, context, loopOptions.update, violations);
    outcomes.push(...loopIterationOutcomes(firstIteration, bodyNode, context, loopOptions.update, violations));

    return normalizePaths(outcomes);
}

function evalLoopBody(bodyNode, path, context, update, violations) {
    let paths = evalStatement(bodyNode, path, {
        ...context,
        breakable: true,
        continuable: true,
    }, violations);

    paths = flatMap(paths, current => {
        if (current.completion === "continue") {
            return [ { ...current, completion: "active" } ];
        }
        return [ current ];
    });

    if (update) {
        paths = flatMap(paths, current => {
            if (current.completion !== "active") {
                return [ current ];
            }
            return evalExpression(update, current, violations);
        });
    }

    return paths;
}

function loopIterationOutcomes(iterationPaths, bodyNode, context, update, violations) {
    const outcomes = [];

    for (const path of iterationPaths) {
        if (path.completion === "break") {
            outcomes.push({ ...path, completion: "active" });
            continue;
        }

        if (path.completion !== "active") {
            outcomes.push(path);
            continue;
        }

        outcomes.push(clonePath(path));

        const secondIteration = evalLoopBody(bodyNode, path, context, update, violations);
        for (const secondPath of secondIteration) {
            if (secondPath.completion === "break" || secondPath.completion === "continue") {
                outcomes.push({ ...secondPath, completion: "active" });
            } else {
                outcomes.push(secondPath);
            }
        }
    }

    return outcomes;
}

function evalSwitch(node, path, context, violations) {
    const discriminantPaths = evalExpression(node.discriminant, path, violations);
    const outcomes = [];
    const defaultIndex = node.cases.findIndex(switchCase => switchCase.test === null);

    for (const discriminantPath of discriminantPaths) {
        const entryIndexes = new Set();

        if (defaultIndex === -1) {
            entryIndexes.add(-1);
        } else {
            entryIndexes.add(defaultIndex);
        }

        for (let index = 0; index < node.cases.length; index += 1) {
            entryIndexes.add(index);
        }

        for (const entryIndex of entryIndexes) {
            if (entryIndex === -1) {
                outcomes.push(clonePath(discriminantPath));
                continue;
            }

            let casePaths = [ discriminantPath ];

            for (let index = entryIndex; index < node.cases.length; index += 1) {
                const switchCase = node.cases[index];

                if (switchCase.test) {
                    casePaths = flatMap(casePaths, current => {
                        if (current.completion !== "active") {
                            return [ current ];
                        }
                        return evalExpression(switchCase.test, current, violations);
                    });
                }

                casePaths = evalStatements(switchCase.consequent, casePaths, {
                    ...context,
                    breakable: true,
                }, violations);
            }

            outcomes.push(...casePaths.map(current => {
                if (current.completion === "break") {
                    return { ...current, completion: "active" };
                }
                return current;
            }));
        }
    }

    return normalizePaths(outcomes);
}

function applyFinalizer(paths, finalizer, context, violations) {
    return normalizePaths(flatMap(paths, path => {
        const priorCompletion = path.completion;
        const activePath = { ...path, completion: "active" };
        const finalized = evalStatements(finalizer.body, [ activePath ], context, violations);

        return finalized.map(result => {
            if (result.completion === "active") {
                return { ...result, completion: priorCompletion };
            }
            return result;
        });
    }));
}

function evalTryStatement(node, path, context, violations) {
    let outcomes = evalStatement(node.block, path, context, violations);

    if (node.handler) {
        const catchPaths = evalStatement(node.handler.body, clonePath(path), context, violations);
        outcomes = normalizePaths([ ...outcomes, ...catchPaths ]);
    } else {
        outcomes = normalizePaths([
            ...outcomes,
            { ...clonePath(path), completion: "throw" },
        ]);
    }

    if (node.finalizer) {
        outcomes = applyFinalizer(outcomes, node.finalizer, context, violations);
    }

    return outcomes;
}

function evalStatement(node, path, context = {}, violations) {
    if (!node || typeof node !== "object") {
        return [ path ];
    }

    if (isNestedBoundary(node)) {
        return [ path ];
    }

    switch (node.type) {
        case "BlockStatement":
            return evalStatements(node.body, [ path ], context, violations);

        case "ExpressionStatement":
            return evalExpression(node.expression, path, violations);

        case "VariableDeclaration": {
            let paths = [ path ];
            for (const declaration of node.declarations) {
                if (declaration.init) {
                    paths = flatMapActive(paths, current => evalExpression(declaration.init, current, violations));
                }
            }
            return paths;
        }

        case "IfStatement": {
            const testPaths = evalExpression(node.test, path, violations);
            const consequent = flatMapActive(
                testPaths,
                current => evalStatement(node.consequent, current, context, violations),
            );
            const alternate = flatMapActive(
                testPaths,
                current => node.alternate ? evalStatement(node.alternate, current, context, violations) : [ current ],
            );
            return normalizePaths([ ...consequent, ...alternate ]);
        }

        case "SwitchStatement":
            return evalSwitch(node, path, context, violations);

        case "TryStatement":
            return evalTryStatement(node, path, context, violations);

        case "ReturnStatement": {
            const completion = node.argument ? "returnValue" : "returnVoid";
            if (!node.argument) {
                return [ { ...path, completion } ];
            }
            return evalExpression(node.argument, path, violations).map(current => ({ ...current, completion }));
        }

        case "ThrowStatement":
            return evalExpression(node.argument, path, violations).map(current => ({ ...current, completion: "throw" }));

        case "BreakStatement":
            if (context.breakable) {
                return [ { ...path, completion: "break" } ];
            }
            return [ { ...path, completion: "active" } ];

        case "ContinueStatement":
            if (context.continuable) {
                return [ { ...path, completion: "continue" } ];
            }
            return [ { ...path, completion: "active" } ];

        case "WhileStatement": {
            const paths = evalExpression(node.test, path, violations);
            return normalizePaths(flatMap(paths, current => evalLoop(node.body, current, context, {
                atLeastOnce: false,
            }, violations)));
        }

        case "DoWhileStatement":
            return evalLoop(node.body, path, context, { atLeastOnce: true }, violations);

        case "ForStatement": {
            let paths = [ path ];
            if (node.init) {
                paths = flatMapActive(paths, current => {
                    if (node.init.type === "VariableDeclaration") {
                        return evalStatement(node.init, current, context, violations);
                    }
                    return evalExpression(node.init, current, violations);
                });
            }
            if (node.test) {
                paths = flatMapActive(paths, current => evalExpression(node.test, current, violations));
            }
            return normalizePaths(flatMap(paths, current => evalLoop(node.body, current, context, {
                atLeastOnce: false,
                update: node.update,
            }, violations)));
        }

        case "ForInStatement":
        case "ForOfStatement": {
            let paths = [ path ];
            if (node.left && node.left.type === "VariableDeclaration") {
                paths = flatMapActive(paths, current => evalStatement(node.left, current, context, violations));
            } else if (node.left && node.left.type) {
                paths = flatMapActive(paths, current => evalExpression(node.left, current, violations));
            }
            paths = flatMapActive(paths, current => evalExpression(node.right, current, violations));
            return normalizePaths(flatMap(paths, current => evalLoop(node.body, current, context, {
                atLeastOnce: false,
            }, violations)));
        }

        case "EmptyStatement":
        case "DebuggerStatement":
            return [ path ];

        default:
            return evalExpressionChildren(node, path, violations);
    }
}

function flatMap(paths, iteratee) {
    return paths.flatMap(iteratee);
}

function flatMapActive(paths, iteratee) {
    return flatMap(paths, path => {
        if (path.completion !== "active") {
            return [ path ];
        }
        return iteratee(path);
    });
}

function analyzeDerivedConstructor(body) {
    const violations = new Map();

    evalStatements(body.body, [ { superCalls: 0, completion: "active" } ], {}, violations);

    return [...violations.values()];
}

const noThisBeforeSuperRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        return {
            MethodDefinition(node) {
                if (node.kind !== "constructor") return;

                const classNode = getClassAncestor(node);
                if (!classNode || !isDerivedClass(classNode)) return;

                const violations = analyzeDerivedConstructor(node.value.body);
                for (const violation of violations) {
                    context.report(violation);
                }
            },
        };
    },
};

export default noThisBeforeSuperRule;
