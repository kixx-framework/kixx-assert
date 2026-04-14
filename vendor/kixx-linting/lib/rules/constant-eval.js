/**
 * Static-value helpers used by rules that evaluate expressions without executing them.
 */

const BUILTIN_CONSTANT_NAMES = new Set(["undefined", "NaN", "Infinity"]);

function hasLocalDefinition(scope, name) {
    return scope.variables.some(candidate => {
        return candidate.name === name && candidate.identifiers.length > 0;
    });
}

function isUnshadowedName(sourceCode, name, referenceNode) {
    let scope = sourceCode.getScope(referenceNode);

    while (scope) {
        if (hasLocalDefinition(scope, name)) {
            return false;
        }

        scope = scope.upper;
    }

    return true;
}

/**
 * Checks whether an identifier is one of the built-in constant globals.
 * @param {ASTNode} node Identifier node to check.
 * @param {SourceCode} sourceCode Source-code object used to resolve scope.
 * @returns {boolean} `true` when the identifier resolves to a built-in constant.
 */
export function isBuiltinConstantIdentifier(node, sourceCode) {
    if (!node || node.type !== "Identifier" || !BUILTIN_CONSTANT_NAMES.has(node.name)) {
        return false;
    }

    return !sourceCode || isUnshadowedName(sourceCode, node.name, node);
}

/**
 * Checks whether a node is an unshadowed global identifier with the expected name.
 * @param {ASTNode} node Identifier node to check.
 * @param {SourceCode} sourceCode Source-code object used to resolve scope.
 * @param {string} name Expected global name.
 * @param {ASTNode} [referenceNode=node] Node to use when resolving scope.
 * @returns {boolean} `true` when the identifier refers to the named global.
 */
export function isUnshadowedGlobalName(node, sourceCode, name, referenceNode = node) {
    if (!sourceCode || !node || node.type !== "Identifier" || node.name !== name) {
        return false;
    }

    return isUnshadowedName(sourceCode, name, referenceNode);
}

/**
 * Checks whether a node is a template literal without expressions.
 * @param {ASTNode} node Node to check.
 * @returns {boolean} `true` when the template literal is static.
 */
export function isStaticTemplateLiteral(node) {
    return node.type === "TemplateLiteral" && node.expressions.length === 0;
}

/**
 * Checks whether a template literal contains any non-empty cooked text.
 * @param {ASTNode} node Template literal to check.
 * @returns {boolean} `true` when the literal has visible static text.
 */
export function hasStaticTemplateText(node) {
    return node.type === "TemplateLiteral" && node.quasis.some(quasi => quasi.value.cooked !== "");
}

function unresolved() {
    return { resolved: false, value: undefined };
}

function resolved(value) {
    return { resolved: true, value };
}

function getStaticIdentifierValue(node, sourceCode) {
    if (!isBuiltinConstantIdentifier(node, sourceCode)) {
        return unresolved();
    }

    if (node.name === "undefined") {
        return resolved(undefined);
    }

    if (node.name === "NaN") {
        return resolved(Number.NaN);
    }

    return resolved(Infinity);
}

function getStaticTemplateValue(node, sourceCode, options) {
    if (!options.evaluateTemplateExpressions) {
        return isStaticTemplateLiteral(node) ? resolved(node.quasis[0].value.cooked) : unresolved();
    }

    const parts = [];

    for (let i = 0; i < node.quasis.length; i += 1) {
        parts.push(node.quasis[i].value.cooked);

        if (i < node.expressions.length) {
            const expressionValue = getStaticValue(node.expressions[i], sourceCode, options);

            if (!expressionValue.resolved) {
                return unresolved();
            }

            parts.push(String(expressionValue.value));
        }
    }

    return resolved(parts.join(""));
}

function getStaticArrayValue(node, sourceCode, options) {
    const elements = [];

    for (const element of node.elements) {
        if (element === null) {
            if (!options.allowArrayHoles) {
                return unresolved();
            }

            elements.push(undefined);
            continue;
        }

        if (element.type === "SpreadElement") {
            if (!options.allowArraySpread) {
                return unresolved();
            }

            const spreadValue = getStaticValue(element.argument, sourceCode, options);

            if (!spreadValue.resolved || !Array.isArray(spreadValue.value)) {
                return unresolved();
            }

            elements.push(...spreadValue.value);
            continue;
        }

        const elementValue = getStaticValue(element, sourceCode, options);

        if (!elementValue.resolved) {
            return unresolved();
        }

        elements.push(elementValue.value);
    }

    return resolved(elements);
}

function getStaticUnaryValue(node, sourceCode, options) {
    if (node.operator === "void") {
        return resolved(undefined);
    }

    if (node.operator === "typeof" && !options.evaluateTypeof) {
        return unresolved();
    }

    const argumentValue = getStaticValue(node.argument, sourceCode, options);

    if (!argumentValue.resolved) {
        return unresolved();
    }

    switch (node.operator) {
        case "!":
            return resolved(!argumentValue.value);
        case "+":
            // eslint-disable-next-line no-implicit-coercion
            return resolved(+argumentValue.value);
        case "-":
            return resolved(-argumentValue.value);
        case "~":
            return resolved(~argumentValue.value);
        case "typeof":
            return resolved(typeof argumentValue.value);
        default:
            return unresolved();
    }
}

function getStaticBinaryValue(node, sourceCode, options) {
    if (!options.evaluateBinary || node.operator === "in" || node.operator === "instanceof") {
        return unresolved();
    }

    const leftValue = getStaticValue(node.left, sourceCode, options);
    const rightValue = getStaticValue(node.right, sourceCode, options);

    if (!leftValue.resolved || !rightValue.resolved) {
        return unresolved();
    }

    switch (node.operator) {
        case "==":
            // eslint-disable-next-line eqeqeq
            return resolved(leftValue.value == rightValue.value);
        case "!=":
            // eslint-disable-next-line eqeqeq
            return resolved(leftValue.value != rightValue.value);
        case "===":
            return resolved(leftValue.value === rightValue.value);
        case "!==":
            return resolved(leftValue.value !== rightValue.value);
        case "<":
            return resolved(leftValue.value < rightValue.value);
        case "<=":
            return resolved(leftValue.value <= rightValue.value);
        case ">":
            return resolved(leftValue.value > rightValue.value);
        case ">=":
            return resolved(leftValue.value >= rightValue.value);
        case "+":
            return resolved(leftValue.value + rightValue.value);
        case "-":
            return resolved(leftValue.value - rightValue.value);
        case "*":
            return resolved(leftValue.value * rightValue.value);
        case "/":
            return resolved(leftValue.value / rightValue.value);
        case "%":
            return resolved(leftValue.value % rightValue.value);
        default:
            return unresolved();
    }
}

function getStaticCallValue(node, sourceCode, options) {
    if (
        !options.evaluateBooleanCall ||
        node.callee.type !== "Identifier" ||
        !isUnshadowedGlobalName(node.callee, sourceCode, "Boolean", node) ||
        node.arguments.some(argument => argument.type === "SpreadElement")
    ) {
        return unresolved();
    }

    if (node.arguments.length === 0) {
        return resolved(false);
    }

    if (node.arguments.length >= 1 && options.getConstantTruthiness) {
        const truthiness = options.getConstantTruthiness(node.arguments[0], sourceCode);

        if (truthiness !== null) {
            return resolved(truthiness);
        }
    }

    return unresolved();
}

/**
 * Resolves a static value for a limited set of AST node types.
 * @param {ASTNode} node Node to evaluate.
 * @param {SourceCode} sourceCode Source-code object used for scope and shadowing checks.
 * @param {Object} [options={}] Evaluation options.
 * @returns {{ resolved: boolean, value: any }} Resolution result with the computed value when available.
 */
export function getStaticValue(node, sourceCode, options = {}) {
    if (!node) {
        return unresolved();
    }

    switch (node.type) {
        case "Literal":
            return resolved(node.value);
        case "Identifier":
            return getStaticIdentifierValue(node, sourceCode);
        case "TemplateLiteral":
            return getStaticTemplateValue(node, sourceCode, options);
        case "ArrayExpression":
            return getStaticArrayValue(node, sourceCode, options);
        case "ObjectExpression":
            return options.evaluateEmptyObject && node.properties.length === 0
                ? resolved({})
                : unresolved();
        case "UnaryExpression":
            return getStaticUnaryValue(node, sourceCode, options);
        case "BinaryExpression":
            return getStaticBinaryValue(node, sourceCode, options);
        case "SequenceExpression":
            return options.evaluateSequence
                ? getStaticValue(node.expressions[node.expressions.length - 1], sourceCode, options)
                : unresolved();
        case "AssignmentExpression":
            return options.evaluateAssignment && node.operator === "="
                ? getStaticValue(node.right, sourceCode, options)
                : unresolved();
        case "CallExpression":
            return getStaticCallValue(node, sourceCode, options);
        default:
            return unresolved();
    }
}
