/**
 * no-global-assign — disallow assignments to native objects or read-only global variables.
 * Adapted from ESLint's no-global-assign rule.
 */

// Built-in global objects that should never be reassigned
const NATIVE_GLOBALS = new Set([
    "Array", "Boolean", "Date", "decodeURI", "decodeURIComponent",
    "encodeURI", "encodeURIComponent", "Error", "eval", "EvalError",
    "Float32Array", "Float64Array", "Function", "Infinity", "Int16Array",
    "Int32Array", "Int8Array", "isFinite", "isNaN", "JSON", "Map",
    "Math", "NaN", "Number", "Object", "parseFloat", "parseInt",
    "Promise", "Proxy", "RangeError", "ReferenceError", "Reflect",
    "RegExp", "Set", "String", "Symbol", "SyntaxError", "TypeError",
    "Uint16Array", "Uint32Array", "Uint8Array", "Uint8ClampedArray",
    "undefined", "URIError", "WeakMap", "WeakSet", "WeakRef",
    "globalThis", "Atomics", "SharedArrayBuffer", "BigInt", "BigInt64Array",
    "BigUint64Array", "queueMicrotask", "structuredClone",
]);

/**
 * Determine whether a globals map value means the global is writable.
 * ESLint globals values: true/"writable"/"writeable" = writable, false/"readonly" = readonly.
 */
function isWritableGlobal(value) {
    return value === true || value === "true" || value === "writable" || value === "writeable";
}

const noGlobalAssignRule = {
    meta: {
        type: "suggestion",
        schema: [
            {
                type: "object",
                properties: {
                    exceptions: {
                        type: "array",
                        items: { type: "string" },
                        uniqueItems: true,
                    },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const exceptions = new Set(context.options[0]?.exceptions ?? []);

        // Build readonly globals from languageOptions.globals
        // languageOptions may be { globals: {...} } or { languageOptions: { globals: {...} } }
        const rawLangOpts = context.languageOptions ?? {};
        const configuredGlobals = rawLangOpts.globals ?? rawLangOpts.languageOptions?.globals ?? {};

        return {
            "Program:exit"(node) {
                const commentGlobals = context.sourceCode.getCommentGlobals();

                const scope = context.sourceCode.getScope(node);

                /**
                 * Returns true if the given name is a readonly global that should
                 * not be assigned.
                 */
                function isReadonlyGlobal(name) {
                    if (exceptions.has(name)) return false;

                    // Check configuredGlobals from languageOptions
                    if (Object.prototype.hasOwnProperty.call(configuredGlobals, name)) {
                        const val = configuredGlobals[name];
                        if (val === "off") return false;
                        return !isWritableGlobal(val);
                    }

                    // Check /*global */ comment directives
                    if (commentGlobals.has(name)) {
                        return !isWritableGlobal(commentGlobals.get(name));
                    }

                    // Check native globals (all readonly)
                    return NATIVE_GLOBALS.has(name);
                }

                // Track reported identifier nodes to avoid duplicate reports
                // (destructuring can create multiple write refs to the same node)
                const reportedNodes = new Set();

                function reportOnce(identifier) {
                    if (reportedNodes.has(identifier)) return;
                    reportedNodes.add(identifier);
                    context.report({
                        node: identifier,
                        message: `Read-only global '${identifier.name}' should not be modified.`,
                    });
                }

                // Check variables that were resolved in the scope tree
                // (includes globals added via addGlobals from languageOptions)
                function checkScope(s) {
                    for (const variable of s.variables) {
                        const name = variable.name;
                        if (!isReadonlyGlobal(name)) continue;
                        for (const ref of variable.references) {
                            if (ref.isWrite()) {
                                reportOnce(ref.identifier);
                            }
                        }
                    }
                    for (const child of s.childScopes) {
                        checkScope(child);
                    }
                }

                checkScope(scope);

                // Also check unresolved (through) references for globals defined
                // via /*global */ comments (not added via addGlobals)
                for (const ref of scope.through) {
                    const name = ref.identifier.name;
                    if (ref.isWrite() && isReadonlyGlobal(name)) {
                        reportOnce(ref.identifier);
                    }
                }
            },
        };
    },
};

export default noGlobalAssignRule;
