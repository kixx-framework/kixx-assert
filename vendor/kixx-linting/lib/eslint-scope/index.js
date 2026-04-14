/**
 * @module eslint-scope
 * @description
 * JavaScript scope analysis for ECMAScript code. Analyzes an AST to determine variable scopes,
 * definitions, and references. Supports all ECMAScript features including modules, classes,
 * arrow functions, and destructuring.
 */

import { assert } from "./assert.js";
import ScopeManager from "./scope-manager.js";
import Referencer from "./referencer.js";
import Reference from "./reference.js";
import Variable from "./variable.js";
import { Definition } from "./definition.js";
import PatternVisitor from "./pattern-visitor.js";
import { Scope } from "./scope.js";

/**
 * Creates default analysis options with sensible ECMAScript 5 defaults.
 * @returns {Object} Default options object with fields for scope analysis behavior
 */
function defaultOptions() {
    return {
        optimistic: false,
        nodejsScope: false,
        impliedStrict: false,
        sourceType: "script",
        ecmaVersion: 5,
        childVisitorKeys: null,
        fallback: "iteration",
    };
}

function isHashObject(value) {
    return (
        typeof value === "object" &&
        value instanceof Object &&
        !Array.isArray(value) &&
        !(value instanceof RegExp)
    );
}

function updateDeeply(target, override) {
    if (!isHashObject(override)) {
        return target;
    }

    for (const key of Object.keys(override)) {
        const value = override[key];

        if (isHashObject(value)) {
            if (isHashObject(target[key])) {
                updateDeeply(target[key], value);
            } else {
                target[key] = updateDeeply({}, value);
            }
        } else {
            target[key] = value;
        }
    }

    return target;
}

function analyzeScope(ast, providedOptions = {}) {
    const options = updateDeeply(defaultOptions(), providedOptions);
    const scopeManager = new ScopeManager(options);
    const referencer = new Referencer(options, scopeManager);

    referencer.visit(ast);

    assert(scopeManager.__currentScope === null, "currentScope should be null.");

    return scopeManager;
}

/**
 * Package version
 * @type {string}
 */
export const version = "9.1.2";

/**
 * Analyzes an ESTree AST and returns a ScopeManager containing scope information.
 *
 * Traverses the AST to build a hierarchical scope tree with variable definitions,
 * references, and scope relationships. Supports customization via options for different
 * ECMAScript versions, source types (script/module/CommonJS), and visitor behavior.
 *
 * @param {Object} ast - An ESTree-compatible AST (typically from a parser like acorn or espree)
 * @param {Object} [options={}] - Configuration for scope analysis behavior
 * @param {string} [options.sourceType='script'] - Source type: 'script', 'module', or 'commonjs'
 * @param {number} [options.ecmaVersion=5] - Target ECMAScript version (5, 6, 7, ..., 2022, etc.)
 * @param {boolean} [options.optimistic=false] - Use optimistic (dynamic) scope resolution
 * @param {boolean} [options.nodejsScope=false] - Treat as CommonJS with Node.js global scope
 * @param {boolean} [options.impliedStrict=false] - Assume strict mode is implied
 * @param {Object} [options.childVisitorKeys] - Custom visitor keys for traversing AST nodes
 * @param {string|function} [options.fallback='iteration'] - Fallback behavior for unknown node types
 * @param {Object} [options.globals] - Map of global variable names to add to global scope
 * @returns {ScopeManager} Manager containing scopes and scope information for the analyzed AST
 * @throws {Error} When the AST is invalid or analysis fails
 */
export function analyze(ast, options = {}) {
    const { globals, ...scopeOptions } = options;
    const scopeManager = analyzeScope(ast, scopeOptions);

    if (globals && typeof globals === "object") {
        scopeManager.addGlobals(Object.keys(globals));
    }

    return scopeManager;
}

export {
    Definition,
    PatternVisitor,
    Referencer,
    Reference,
    Scope,
    ScopeManager,
    Variable,
};
