/**
 * Reports unresolved identifiers that are not configured globals or valid `typeof` references.
 */

import { getConfiguredGlobals, hasShadowingDefinition, isDisabledGlobal } from "./utils.js";

function hasTypeOfOperator(node) {
    const parent = node.parent;
    return parent?.type === "UnaryExpression" && parent.operator === "typeof";
}

const CORE_GLOBAL_MIN_ECMA = {
    Object: 5,
    Array: 5,
    Boolean: 5,
    Number: 5,
    String: 5,
    Symbol: 6,
    BigInt: 11,
    Math: 5,
    JSON: 5,
    isNaN: 5,
    parseInt: 5,
    parseFloat: 5,
    encodeURI: 5,
    encodeURIComponent: 5,
    decodeURI: 5,
    decodeURIComponent: 5,
    RegExp: 5,
    Error: 5,
    TypeError: 5,
    ReferenceError: 5,
    SyntaxError: 5,
    EvalError: 5,
    RangeError: 5,
    URIError: 5,
    eval: 5,
    Function: 5,
    Promise: 6,
    Reflect: 6,
    Proxy: 6,
    Map: 6,
    Set: 6,
    WeakMap: 6,
    WeakSet: 6,
    WeakRef: 2021,
    FinalizationRegistry: 2021,
    Intl: 2015,
    globalThis: 2020,
    Iterator: 2025,
    Float16Array: 2025,
    AsyncDisposableStack: 2026,
    DisposableStack: 2026,
    SuppressedError: 2026,
    Temporal: 2026,
    toString: 5,
    hasOwnProperty: 5,
    undefined: 5,
    NaN: 5,
    Infinity: 5,
};

const noUndefRule = {
    meta: {
        type: "problem",
    },

    create(context) {
        const option = context.options[0] ?? {};
        const considerTypeOf = option.typeof === true;
        const sourceCode = context.sourceCode;
        const directiveGlobals = sourceCode.getCommentGlobals();
        const configuredGlobals = getConfiguredGlobals(context);
        const sourceType = context.languageOptions?.sourceType ?? "module";
        const ecmaVersion = Number(context.languageOptions?.ecmaVersion ?? 2024);

        return {
            "Program:exit"() {
                const reportedNames = new Set();
                const unresolvedReferences = [];

                for (const scope of sourceCode.scopeManager.scopes) {
                    for (const reference of scope.references) {
                        if (!reference.resolved) {
                            unresolvedReferences.push(reference);
                        }
                    }
                }

                for (const reference of unresolvedReferences) {
                    const identifier = reference.identifier;
                    const name = identifier.name;

                    const hasDeclarationInContainingScope = hasShadowingDefinition(sourceCode, identifier, name);

                    if (hasDeclarationInContainingScope) {
                        continue;
                    }

                    if (reportedNames.has(name)) {
                        continue;
                    }

                    if (isDisabledGlobal(context, name)) {
                        continue;
                    }

                    if (
                        Object.prototype.hasOwnProperty.call(configuredGlobals, name) ||
                        directiveGlobals.has(name)
                    ) {
                        continue;
                    }

                    const minEcma = CORE_GLOBAL_MIN_ECMA[name];
                    if (typeof minEcma === "number" && ecmaVersion >= minEcma) {
                        continue;
                    }

                    if (
                        sourceType === "commonjs" &&
                        (name === "require" || name === "module" || name === "exports" || name === "__dirname" || name === "__filename")
                    ) {
                        continue;
                    }

                    if (!considerTypeOf && hasTypeOfOperator(identifier)) {
                        continue;
                    }

                    reportedNames.add(name);
                    context.report({
                        node: identifier,
                        message: "'{{name}}' is not defined.",
                        data: { name },
                    });
                }
            },
        };
    },
};

export default noUndefRule;
