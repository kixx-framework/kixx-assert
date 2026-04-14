/**
 * constructor-super — require super() calls in constructors.
 *
 * This rule needs path-sensitive analysis: a derived constructor is valid only
 * if every non-throwing path either calls super() exactly once or returns a
 * value before reaching the implicit return.
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

function evalExpression(node, path) {
    if (!node || typeof node !== "object") {
        return [ path ];
    }

    if (isNestedBoundary(node)) {
        return [ path ];
    }

    switch (node.type) {
        case "CallExpression":
            if (node.callee && node.callee.type === "Super") {
                let paths = [ path ];
                for (const arg of node.arguments) {
                    paths = flatMapActive(paths, current => evalExpression(arg, current));
                }
                return paths.map(markSuperCall);
            }
            return evalExpressionChildren(node, path);

        case "ChainExpression":
            return evalExpression(node.expression, path);

        case "ConditionalExpression": {
            const testPaths = evalExpression(node.test, path);
            const consequent = flatMapActive(testPaths, current => evalExpression(node.consequent, current));
            const alternate = flatMapActive(testPaths, current => evalExpression(node.alternate, current));
            return normalizePaths([ ...consequent, ...alternate ]);
        }

        case "LogicalExpression": {
            const leftPaths = evalExpression(node.left, path);
            const skippedRight = leftPaths.map(clonePath);
            const ranRight = flatMapActive(leftPaths, current => evalExpression(node.right, current));
            return normalizePaths([ ...skippedRight, ...ranRight ]);
        }

        case "SequenceExpression": {
            let paths = [ path ];
            for (const expression of node.expressions) {
                paths = flatMapActive(paths, current => evalExpression(expression, current));
            }
            return paths;
        }

        default:
            return evalExpressionChildren(node, path);
    }
}

function evalExpressionChildren(node, path) {
    let paths = [ path ];

    for (const [ key, child ] of Object.entries(node)) {
        if (key === "parent" || key === "type" || key === "loc" || key === "range"
                || key === "start" || key === "end") {
            continue;
        }

        if (Array.isArray(child)) {
            for (const item of child) {
                if (item && typeof item === "object" && item.type) {
                    paths = flatMapActive(paths, current => evalExpression(item, current));
                }
            }
        } else if (child && typeof child === "object" && child.type) {
            paths = flatMapActive(paths, current => evalExpression(child, current));
        }
    }

    return paths;
}

function evalStatements(statements, initialPaths, context) {
    let paths = initialPaths;

    for (const statement of statements) {
        paths = flatMap(paths, path => {
            if (path.completion !== "active") {
                return [ path ];
            }
            return evalStatement(statement, path, context);
        });
        paths = normalizePaths(paths);
    }

    return paths;
}

function evalLoop(bodyNode, path, context, { atLeastOnce, update }) {
    const outcomes = [];

    if (!atLeastOnce) {
        outcomes.push(clonePath(path));
    }

    const firstIteration = evalLoopBody(bodyNode, path, context, update);
    outcomes.push(...loopIterationOutcomes(firstIteration, bodyNode, context, update));

    return normalizePaths(outcomes);
}

function evalLoopBody(bodyNode, path, context, update) {
    let paths = evalStatement(bodyNode, path, {
        ...context,
        breakable: true,
        continuable: true,
    });

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
            return evalExpression(update, current);
        });
    }

    return paths;
}

function loopIterationOutcomes(iterationPaths, bodyNode, context, update) {
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

        const secondIteration = evalLoopBody(bodyNode, path, context, update);
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

function evalSwitch(node, path, context) {
    const discriminantPaths = evalExpression(node.discriminant, path);
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
                        return evalExpression(switchCase.test, current);
                    });
                }

                casePaths = evalStatements(switchCase.consequent, casePaths, {
                    ...context,
                    breakable: true,
                });
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

function applyFinalizer(paths, finalizer, context) {
    return normalizePaths(flatMap(paths, path => {
        const priorCompletion = path.completion;
        const activePath = { ...path, completion: "active" };
        const finalized = evalStatements(finalizer.body, [ activePath ], context);

        return finalized.map(result => {
            if (result.completion === "active") {
                return { ...result, completion: priorCompletion };
            }
            return result;
        });
    }));
}

function evalTryStatement(node, path, context) {
    let outcomes = evalStatement(node.block, path, context);

    if (node.handler) {
        const catchPaths = evalStatement(node.handler.body, clonePath(path), context);
        outcomes = normalizePaths([ ...outcomes, ...catchPaths ]);
    }

    if (node.finalizer) {
        outcomes = applyFinalizer(outcomes, node.finalizer, context);
    }

    return outcomes;
}

function evalStatement(node, path, context = {}) {
    if (!node || typeof node !== "object") {
        return [ path ];
    }

    if (isNestedBoundary(node)) {
        return [ path ];
    }

    switch (node.type) {
        case "BlockStatement":
            return evalStatements(node.body, [ path ], context);

        case "ExpressionStatement":
            return evalExpression(node.expression, path);

        case "VariableDeclaration": {
            let paths = [ path ];
            for (const declaration of node.declarations) {
                if (declaration.init) {
                    paths = flatMapActive(paths, current => evalExpression(declaration.init, current));
                }
            }
            return paths;
        }

        case "IfStatement": {
            const testPaths = evalExpression(node.test, path);
            const consequent = flatMapActive(testPaths, current => evalStatement(node.consequent, current, context));
            const alternate = flatMapActive(
                testPaths,
                current => node.alternate ? evalStatement(node.alternate, current, context) : [ current ],
            );
            return normalizePaths([ ...consequent, ...alternate ]);
        }

        case "SwitchStatement":
            return evalSwitch(node, path, context);

        case "TryStatement":
            return evalTryStatement(node, path, context);

        case "ReturnStatement": {
            const completion = node.argument ? "returnValue" : "returnVoid";
            if (!node.argument) {
                return [ { ...path, completion } ];
            }
            return evalExpression(node.argument, path).map(current => ({ ...current, completion }));
        }

        case "ThrowStatement":
            return evalExpression(node.argument, path).map(current => ({ ...current, completion: "throw" }));

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
            const paths = evalExpression(node.test, path);
            return normalizePaths(flatMap(paths, current => evalLoop(node.body, current, context, {
                atLeastOnce: false,
            })));
        }

        case "DoWhileStatement":
            return evalLoop(node.body, path, context, { atLeastOnce: true });

        case "ForStatement": {
            let paths = [ path ];
            if (node.init) {
                paths = flatMapActive(paths, current => {
                    if (node.init.type === "VariableDeclaration") {
                        return evalStatement(node.init, current, context);
                    }
                    return evalExpression(node.init, current);
                });
            }
            if (node.test) {
                paths = flatMapActive(paths, current => evalExpression(node.test, current));
            }
            return normalizePaths(flatMap(paths, current => evalLoop(node.body, current, context, {
                atLeastOnce: false,
                update: node.update,
            })));
        }

        case "ForInStatement":
        case "ForOfStatement": {
            let paths = [ path ];
            if (node.left && node.left.type === "VariableDeclaration") {
                paths = flatMapActive(paths, current => evalStatement(node.left, current, context));
            } else if (node.left && node.left.type) {
                paths = flatMapActive(paths, current => evalExpression(node.left, current));
            }
            paths = flatMapActive(paths, current => evalExpression(node.right, current));
            return normalizePaths(flatMap(paths, current => evalLoop(node.body, current, context, {
                atLeastOnce: false,
            })));
        }

        case "EmptyStatement":
        case "DebuggerStatement":
            return [ path ];

        default:
            return evalExpressionChildren(node, path);
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
    const finalPaths = evalStatements(body.body, [ { superCalls: 0, completion: "active" } ], {});

    return finalPaths.some(path => {
        if (path.superCalls > 1) {
            return true;
        }

        if (path.completion === "throw" || path.completion === "returnValue") {
            return false;
        }

        if (path.completion === "active" || path.completion === "returnVoid") {
            return path.superCalls !== 1;
        }

        return false;
    });
}

function findSuperCalls(node, calls = []) {
    if (!node || typeof node !== "object") {
        return calls;
    }

    if (isNestedBoundary(node)) {
        return calls;
    }

    if (node.type === "CallExpression" && node.callee && node.callee.type === "Super") {
        calls.push(node);
    }

    for (const [ key, child ] of Object.entries(node)) {
        if (key === "parent") continue;
        if (Array.isArray(child)) {
            for (const item of child) {
                if (item && typeof item === "object" && item.type) {
                    findSuperCalls(item, calls);
                }
            }
        } else if (child && typeof child === "object" && child.type) {
            findSuperCalls(child, calls);
        }
    }

    return calls;
}

const constructorSuperRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        return {
            MethodDefinition(node) {
                if (node.kind !== "constructor") return;

                const classNode = getClassAncestor(node);
                if (!classNode) return;

                if (isDerivedClass(classNode)) {
                    if (analyzeDerivedConstructor(node.value.body)) {
                        context.report({
                            node,
                            message: "Expected to call 'super()'.",
                        });
                    }
                    return;
                }

                for (const call of findSuperCalls(node.value.body)) {
                    context.report({
                        node: call,
                        message: "Unexpected 'super()'.",
                    });
                }
            },
        };
    },
};

export default constructorSuperRule;
