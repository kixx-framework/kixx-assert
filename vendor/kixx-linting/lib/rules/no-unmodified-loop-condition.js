/**
 * no-unmodified-loop-condition — disallow unmodified loop conditions.
 * Adapted from ESLint's no-unmodified-loop-condition rule (simplified AST approach).
 */

function collectConditionInfo(node) {
    const info = {
        ids: new Set(),
        selfModified: new Set(),
        hasDynamicAccess: false,
        hasLogical: false,
    };

    function walk(n, inPropertyKey = false) {
        if (!n || typeof n !== "object") return;

        if (n.type === "Identifier" && !inPropertyKey) {
            info.ids.add(n.name);
            return;
        }

        if (n.type === "LogicalExpression") {
            info.hasLogical = true;
        }

        if (
            n.type === "CallExpression" ||
            n.type === "NewExpression" ||
            n.type === "TaggedTemplateExpression" ||
            n.type === "YieldExpression" ||
            n.type === "AwaitExpression" ||
            n.type === "ImportExpression" ||
            n.type === "MemberExpression"
        ) {
            info.hasDynamicAccess = true;
        }

        if (n.type === "AssignmentExpression" && n.left.type === "Identifier") {
            info.selfModified.add(n.left.name);
        }
        if (n.type === "UpdateExpression" && n.argument.type === "Identifier") {
            info.selfModified.add(n.argument.name);
        }

        for (const key of Object.keys(n)) {
            if (key === "parent") continue;
            const child = n[key];
            if (Array.isArray(child)) {
                child.forEach(item => walk(item, false));
                continue;
            }
            if (!child || typeof child !== "object" || !child.type) continue;
            if (
                (n.type === "MemberExpression" || n.type === "Property") &&
                key === "property" && !n.computed
            ) {
                walk(child, true);
            } else {
                walk(child, false);
            }
        }
    }

    walk(node);
    return info;
}

function getModifiedIdentifiers(node) {
    const modified = new Set();
    function walk(n) {
        if (!n || typeof n !== "object") return;

        if (
            n.type === "FunctionDeclaration" ||
            n.type === "FunctionExpression" ||
            n.type === "ArrowFunctionExpression"
        ) {
            return;
        }

        if (n.type === "AssignmentExpression" && n.left.type === "Identifier") {
            modified.add(n.left.name);
        }
        if (n.type === "UpdateExpression" && n.argument.type === "Identifier") {
            modified.add(n.argument.name);
        }

        for (const key of Object.keys(n)) {
            if (key === "parent") continue;
            const child = n[key];
            if (Array.isArray(child)) child.forEach(walk);
            else if (child && typeof child === "object" && child.type) walk(child);
        }
    }

    walk(node);
    return modified;
}

function extractPatternNames(pattern, output) {
    if (!pattern || typeof pattern !== "object") return;

    if (pattern.type === "Identifier") {
        output.add(pattern.name);
        return;
    }

    if (pattern.type === "RestElement") {
        extractPatternNames(pattern.argument, output);
        return;
    }

    if (pattern.type === "AssignmentPattern") {
        extractPatternNames(pattern.left, output);
        return;
    }

    if (pattern.type === "ArrayPattern") {
        for (const element of pattern.elements) {
            extractPatternNames(element, output);
        }
        return;
    }

    if (pattern.type === "ObjectPattern") {
        for (const prop of pattern.properties) {
            if (prop.type === "Property") {
                extractPatternNames(prop.value, output);
            } else if (prop.type === "RestElement") {
                extractPatternNames(prop.argument, output);
            }
        }
    }
}

function getCalledFunctionNames(node) {
    const names = new Set();

    function walk(n) {
        if (!n || typeof n !== "object") return;

        if (
            n.type === "FunctionDeclaration" ||
            n.type === "FunctionExpression" ||
            n.type === "ArrowFunctionExpression"
        ) {
            return;
        }

        if (n.type === "CallExpression" && n.callee.type === "Identifier") {
            names.add(n.callee.name);
        }

        for (const key of Object.keys(n)) {
            if (key === "parent") continue;
            const child = n[key];
            if (Array.isArray(child)) child.forEach(walk);
            else if (child && typeof child === "object" && child.type) walk(child);
        }
    }

    walk(node);
    return names;
}

function getContainerBody(node) {
    let current = node.parent;
    while (current) {
        if (current.type === "Program") return current.body;
        if (current.type === "BlockStatement" && Array.isArray(current.body)) return current.body;
        current = current.parent;
    }
    return null;
}

function getFunctionLocalBindings(fnNode) {
    const locals = new Set();

    if (fnNode.id && fnNode.id.type === "Identifier") {
        locals.add(fnNode.id.name);
    }

    for (const param of fnNode.params || []) {
        extractPatternNames(param, locals);
    }

    function walk(n) {
        if (!n || typeof n !== "object") return;

        if (
            n !== fnNode &&
            (n.type === "FunctionDeclaration" ||
                n.type === "FunctionExpression" ||
                n.type === "ArrowFunctionExpression")
        ) {
            if (n.id && n.id.type === "Identifier") {
                locals.add(n.id.name);
            }
            return;
        }

        if (n.type === "VariableDeclarator") {
            extractPatternNames(n.id, locals);
        }

        if (n.type === "ClassDeclaration" && n.id) {
            locals.add(n.id.name);
        }

        for (const key of Object.keys(n)) {
            if (key === "parent") continue;
            const child = n[key];
            if (Array.isArray(child)) child.forEach(walk);
            else if (child && typeof child === "object" && child.type) walk(child);
        }
    }

    walk(fnNode.body);
    return locals;
}

function getFunctionModifications(fnNode, targetIds) {
    const modified = new Set();
    const locals = getFunctionLocalBindings(fnNode);

    function walk(n) {
        if (!n || typeof n !== "object") return;

        if (
            n !== fnNode &&
            (n.type === "FunctionDeclaration" ||
                n.type === "FunctionExpression" ||
                n.type === "ArrowFunctionExpression")
        ) {
            return;
        }

        if (n.type === "AssignmentExpression" && n.left.type === "Identifier") {
            const name = n.left.name;
            if (targetIds.has(name) && !locals.has(name)) {
                modified.add(name);
            }
        }

        if (n.type === "UpdateExpression" && n.argument.type === "Identifier") {
            const name = n.argument.name;
            if (targetIds.has(name) && !locals.has(name)) {
                modified.add(name);
            }
        }

        for (const key of Object.keys(n)) {
            if (key === "parent") continue;
            const child = n[key];
            if (Array.isArray(child)) child.forEach(walk);
            else if (child && typeof child === "object" && child.type) walk(child);
        }
    }

    walk(fnNode.body);
    return modified;
}

function getCalleeFunctionModifications(loopNode, conditionIds) {
    const calledNames = getCalledFunctionNames(loopNode.body);
    if (calledNames.size === 0) return new Set();

    const body = getContainerBody(loopNode);
    if (!body) return new Set();

    const modified = new Set();
    for (const statement of body) {
        if (statement.type !== "FunctionDeclaration" || !statement.id) continue;
        if (!calledNames.has(statement.id.name)) continue;

        const functionMods = getFunctionModifications(statement, conditionIds);
        for (const name of functionMods) modified.add(name);
    }

    return modified;
}

function getLogicalOperands(node) {
    if (node.type !== "LogicalExpression") {
        return [node];
    }

    return [
        ...getLogicalOperands(node.left),
        ...getLogicalOperands(node.right),
    ];
}

function checkCondition(condition, modified, context) {
    if (!condition) return;

    const info = collectConditionInfo(condition);
    if (info.ids.size === 0) return;
    if (info.hasDynamicAccess) return;

    const combinedMods = new Set([ ...modified, ...info.selfModified ]);
    const ids = [ ...info.ids ];

    if (!info.hasLogical) {
        const anyModified = ids.some(id => combinedMods.has(id));
        if (!anyModified) {
            context.report({
                node: condition,
                message: `'${ids[0]}' is not modified in this loop.`,
            });
        }
        return;
    }

    for (const operand of getLogicalOperands(condition)) {
        const operandInfo = collectConditionInfo(operand);
        const operandIds = [ ...operandInfo.ids ];

        if (operandIds.length === 0) {
            continue;
        }

        const anyModified = operandIds.some(id => combinedMods.has(id));

        if (!anyModified) {
            context.report({
                node: operand,
                message: `'${operandIds[0]}' is not modified in this loop.`,
            });
            break;
        }
    }
}

function createLoopChecker(context) {
    return function checkLoop(node, includeUpdate = false) {
        if (!node.test) return;

        const conditionInfo = collectConditionInfo(node.test);
        const modified = getModifiedIdentifiers(node.body);

        if (includeUpdate && node.update) {
            const updateMods = getModifiedIdentifiers(node.update);
            for (const name of updateMods) modified.add(name);
        }

        const calleeMods = getCalleeFunctionModifications(node, conditionInfo.ids);
        for (const name of calleeMods) modified.add(name);

        checkCondition(node.test, modified, context);
    };
}

const noUnmodifiedLoopConditionRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        const checkLoop = createLoopChecker(context);

        return {
            WhileStatement(node) {
                checkLoop(node);
            },
            DoWhileStatement(node) {
                checkLoop(node);
            },
            ForStatement(node) {
                checkLoop(node, true);
            },
        };
    },
};

export default noUnmodifiedLoopConditionRule;
