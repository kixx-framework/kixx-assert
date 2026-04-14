/**
 * getter-return — enforce return statements in getters (AST component).
 * Adapted from ESLint's getter-return rule.
 */

const DEFINE_PROPERTY_CALLS = new Set(['Object.defineProperty', 'Reflect.defineProperty']);
const MULTI_DESCRIPTOR_CALLS = new Set(['Object.defineProperties', 'Object.create']);

function getCalleeName(node) {
    if (!node) return null;
    // Unwrap ChainExpression (e.g. Object?.defineProperty)
    if (node.type === 'ChainExpression') return getCalleeName(node.expression);
    if (node.type === 'MemberExpression' && !node.computed) {
        const obj = node.object;
        if (obj.type === 'Identifier') return `${obj.name}.${node.property.name}`;
    }
    return null;
}

/**
 * Checks if an ObjectExpression is the descriptor argument of a known
 * defineProperty-style call (Object.defineProperty, Reflect.defineProperty,
 * Object.defineProperties, Object.create).
 */
function isDescriptorArg(objectExpr) {
    const parent = objectExpr.parent;
    if (!parent) return false;

    // Direct: Object.defineProperty(x, y, descriptor) or Reflect.defineProperty
    if (parent.type === 'CallExpression' && parent.arguments[2] === objectExpr) {
        const name = getCalleeName(parent.callee);
        if (name && DEFINE_PROPERTY_CALLS.has(name)) return true;
    }

    // Nested: Object.defineProperties(x, { key: descriptor }) or Object.create(x, { key: descriptor })
    if (parent.type === 'Property' && parent.value === objectExpr) {
        const grandparent = parent.parent;
        if (grandparent && grandparent.type === 'ObjectExpression') {
            const ggp = grandparent.parent;
            if (ggp && ggp.type === 'CallExpression' && ggp.arguments[1] === grandparent) {
                const name = getCalleeName(ggp.callee);
                if (name && MULTI_DESCRIPTOR_CALLS.has(name)) return true;
            }
        }
    }

    return false;
}

/**
 * Returns true if the node is a FunctionExpression/ArrowFunctionExpression
 * that serves as the `get` property in a defineProperty-style descriptor object.
 */
function isGetterInDescriptor(node) {
    const parent = node.parent;
    if (!parent || parent.type !== 'Property') return false;
    if (parent.value !== node) return false;

    const key = parent.key;
    const keyName = key.type === 'Identifier' ? key.name : String(key.value);
    if (keyName !== 'get') return false;

    const descriptor = parent.parent;
    if (!descriptor || descriptor.type !== 'ObjectExpression') return false;

    return isDescriptorArg(descriptor);
}

function isGetter(node) {
    const parent = node.parent;
    if (!parent) return false;
    // Object property getter: { get foo() {} }
    if (parent.type === 'Property' && parent.kind === 'get' && parent.value === node) return true;
    // Class method getter: class { get foo() {} }
    if (parent.type === 'MethodDefinition' && parent.kind === 'get' && parent.value === node) return true;
    // Object.defineProperty / Object.create / etc. descriptor getter
    if (isGetterInDescriptor(node)) return true;
    return false;
}

/**
 * Returns true if the given statement/node unconditionally exits via return or throw.
 */
function alwaysReturns(node) {
    if (!node) return false;
    switch (node.type) {
        case 'ReturnStatement':
        case 'ThrowStatement':
            return true;
        case 'BlockStatement':
            for (const stmt of node.body) {
                if (alwaysReturns(stmt)) return true;
            }
            return false;
        case 'IfStatement':
            return node.alternate !== null &&
                alwaysReturns(node.consequent) &&
                alwaysReturns(node.alternate);
        default:
            return false;
    }
}

function findReturnStatements(node) {
    const returns = [];
    function walk(n) {
        if (!n || typeof n !== "object") return;
        const isNestedFunction =
            n !== node && (
                n.type === "FunctionDeclaration" ||
                n.type === "FunctionExpression" ||
                n.type === "ArrowFunctionExpression"
            );
        if (isNestedFunction) return;
        if (n.type === "ReturnStatement") {
            returns.push(n);
        }
        for (const key of Object.keys(n)) {
            if (key === "parent") continue;
            const child = n[key];
            if (Array.isArray(child)) child.forEach(walk);
            else if (child && typeof child === "object" && child.type) walk(child);
        }
    }
    walk(node.body);
    return returns;
}

const getterReturnRule = {
    meta: {
        type: "problem",
        schema: [
            {
                type: "object",
                properties: {
                    allowImplicit: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const allowImplicit = context.options[0]?.allowImplicit ?? false;

        function checkFunction(node) {
            if (!isGetter(node)) return;
            if (!node.body) return;

            // Arrow functions with expression bodies implicitly return their value.
            if (node.type === 'ArrowFunctionExpression' && node.expression) return;

            if (!alwaysReturns(node.body)) {
                context.report({
                    node,
                    message: "Expected to return a value in getter.",
                });
                return;
            }

            if (!allowImplicit) {
                for (const ret of findReturnStatements(node)) {
                    if (!ret.argument) {
                        context.report({
                            node: ret,
                            message: "Expected to return a value in getter.",
                        });
                    }
                }
            }
        }

        return {
            FunctionExpression: checkFunction,
            ArrowFunctionExpression: checkFunction,
        };
    },
};

export default getterReturnRule;
