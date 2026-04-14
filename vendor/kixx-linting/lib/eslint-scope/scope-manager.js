import {
    BlockScope,
    CatchScope,
    ClassFieldInitializerScope,
    ClassStaticBlockScope,
    ClassScope,
    ForScope,
    FunctionExpressionNameScope,
    FunctionScope,
    GlobalScope,
    ModuleScope,
    SwitchScope,
    WithScope,
} from "./scope.js";
import { assert } from "./assert.js";

/**
 * Manages the hierarchy of scopes during AST analysis.
 *
 * Maintains the scope tree, maps nodes to their scopes, and provides methods
 * to navigate and query the scope hierarchy. This is the central orchestrator
 * for scope-related operations during AST traversal.
 */
class ScopeManager {
    /**
     * @param {Object} options - Analysis configuration options
     */
    constructor(options) {
        this.scopes = [];
        this.globalScope = null;
        this.__nodeToScope = new WeakMap();
        this.__currentScope = null;
        this.__options = options;
        this.__declaredVariables = new WeakMap();
    }

    /**
     * Determines if optimistic scope resolution is enabled.
     * @returns {boolean}
     */
    __isOptimistic() {
        return this.__options.optimistic;
    }

    /**
     * Determines if eval() scope effects should be ignored.
     * @returns {boolean}
     */
    __ignoreEval() {
        return this.__options.ignoreEval;
    }

    /**
     * Determines if JSX syntax should be recognized.
     * @returns {boolean}
     */
    __isJSXEnabled() {
        return this.__options.jsx === true;
    }

    /**
     * Determines if the code runs in a global return context (CommonJS/Node.js).
     * @returns {boolean}
     */
    isGlobalReturn() {
        return this.__options.nodejsScope || this.__options.sourceType === "commonjs";
    }

    /**
     * Determines if the code is an ES module.
     * @returns {boolean}
     */
    isModule() {
        return this.__options.sourceType === "module";
    }

    /**
     * Determines if strict mode is implied by the source context.
     * @returns {boolean}
     */
    isImpliedStrict() {
        return Boolean(this.__options.impliedStrict);
    }

    /**
     * Determines if strict mode is supported by the target ECMAScript version.
     * @returns {boolean}
     */
    isStrictModeSupported() {
        return this.__options.ecmaVersion >= 5;
    }

    /**
     * Retrieves all scopes associated with a node (internal use).
     * @private
     * @param {Object} node - AST node
     * @returns {Scope[]} Array of scopes for the node
     */
    __get(node) {
        return this.__nodeToScope.get(node);
    }

    /**
     * Retrieves variables declared at a specific node.
     * @param {Object} node - AST node
     * @returns {Variable[]} Variables declared by the node (e.g., function parameters, var declarations)
     */
    getDeclaredVariables(node) {
        return this.__declaredVariables.get(node) || [];
    }

    /**
     * Acquires the appropriate scope for a node.
     *
     * When a node has multiple scopes (e.g., function declarations create both function and
     * name scopes), returns the eligible scope based on the `inner` flag. Skips function
     * expression name scopes unless explicitly requested.
     *
     * @param {Object} node - AST node
     * @param {boolean} [inner=false] - If true, returns the innermost scope; if false, returns the outermost
     * @returns {Scope|null} The appropriate scope for the node, or null if none found
     */
    acquire(node, inner) {
        const scopes = this.__get(node);

        if (!scopes || scopes.length === 0) {
            return null;
        }

        if (scopes.length === 1) {
            return scopes[0];
        }

        const isEligibleScope = scope => (
            !(scope.type === "function" && scope.functionExpressionScope)
        );

        if (inner) {
            for (let index = scopes.length - 1; index >= 0; index -= 1) {
                const scope = scopes[index];

                if (isEligibleScope(scope)) {
                    return scope;
                }
            }

            return null;
        }

        for (const scope of scopes) {
            if (isEligibleScope(scope)) {
                return scope;
            }
        }

        return null;
    }

    /**
     * Retrieves all scopes associated with a node without filtering.
     * @param {Object} node - AST node
     * @returns {Scope[]} All scopes for the node
     */
    acquireAll(node) {
        return this.__get(node);
    }

    /**
     * Releases a scope and returns the upper scope, useful for traversing up the scope hierarchy.
     * @param {Object} node - AST node
     * @param {boolean} [inner=false] - If true, finds inner scope first
     * @returns {Scope|null} The upper scope of the released scope
     */
    release(node, inner) {
        const scopes = this.__get(node);

        if (!scopes || scopes.length === 0) {
            return null;
        }

        const upperScope = scopes[0].upper;

        if (!upperScope) {
            return null;
        }

        return this.acquire(upperScope.block, inner);
    }

    /**
     * Adds variable names to the global scope.
     *
     * Useful for pre-declaring built-in globals like window, process, or custom globals
     * that should be available throughout analysis.
     *
     * @param {string[]} names - Variable names to add to global scope
     */
    addGlobals(names) {
        this.globalScope.__addVariables(names);
    }

    /**
     * Attaches analyzers (stub method for API compatibility).
     */
    attach() {}

    /**
     * Detaches analyzers (stub method for API compatibility).
     */
    detach() {}

    /**
     * Creates and activates a new scope in the hierarchy.
     * @private
     * @param {Scope} scope - Scope to nest
     * @returns {Scope} The nested scope (now the current scope)
     */
    __nestScope(scope) {
        if (scope instanceof GlobalScope) {
            assert(this.__currentScope === null);
            this.globalScope = scope;
        }

        this.__currentScope = scope;
        return scope;
    }

    /**
     * Creates and activates a global scope.
     * @private
     * @param {Object} node - AST node for the program/module
     * @returns {Scope}
     */
    __nestGlobalScope(node) {
        return this.__nestScope(new GlobalScope(this, node));
    }

    /**
     * Creates and activates a block scope (e.g., for let/const blocks).
     * @private
     * @param {Object} node - Block statement node
     * @returns {Scope}
     */
    __nestBlockScope(node) {
        return this.__nestScope(new BlockScope(this, this.__currentScope, node));
    }

    /**
     * Creates and activates a function scope.
     * @private
     * @param {Object} node - Function declaration or expression node
     * @param {boolean} isMethodDefinition - Whether this is a class method
     * @returns {Scope}
     */
    __nestFunctionScope(node, isMethodDefinition) {
        return this.__nestScope(
            new FunctionScope(
                this,
                this.__currentScope,
                node,
                isMethodDefinition,
            ),
        );
    }

    /**
     * Creates and activates a for-loop scope (for let/const in for statements).
     * @private
     * @param {Object} node - For statement node
     * @returns {Scope}
     */
    __nestForScope(node) {
        return this.__nestScope(new ForScope(this, this.__currentScope, node));
    }

    /**
     * Creates and activates a catch clause scope.
     * @private
     * @param {Object} node - Catch clause node
     * @returns {Scope}
     */
    __nestCatchScope(node) {
        return this.__nestScope(new CatchScope(this, this.__currentScope, node));
    }

    /**
     * Creates and activates a with statement scope.
     * @private
     * @param {Object} node - With statement node
     * @returns {Scope}
     */
    __nestWithScope(node) {
        return this.__nestScope(new WithScope(this, this.__currentScope, node));
    }

    /**
     * Creates and activates a class scope.
     * @private
     * @param {Object} node - Class declaration or expression node
     * @returns {Scope}
     */
    __nestClassScope(node) {
        return this.__nestScope(new ClassScope(this, this.__currentScope, node));
    }

    /**
     * Creates and activates a class field initializer scope.
     * @private
     * @param {Object} node - Class field initializer node
     * @returns {Scope}
     */
    __nestClassFieldInitializerScope(node) {
        return this.__nestScope(
            new ClassFieldInitializerScope(this, this.__currentScope, node),
        );
    }

    /**
     * Creates and activates a class static block scope.
     * @private
     * @param {Object} node - Static block node
     * @returns {Scope}
     */
    __nestClassStaticBlockScope(node) {
        return this.__nestScope(
            new ClassStaticBlockScope(this, this.__currentScope, node),
        );
    }

    /**
     * Creates and activates a switch statement scope.
     * @private
     * @param {Object} node - Switch statement node
     * @returns {Scope}
     */
    __nestSwitchScope(node) {
        return this.__nestScope(new SwitchScope(this, this.__currentScope, node));
    }

    /**
     * Creates and activates a module scope (for ES modules).
     * @private
     * @param {Object} node - Module/program node
     * @returns {Scope}
     */
    __nestModuleScope(node) {
        return this.__nestScope(new ModuleScope(this, this.__currentScope, node));
    }

    /**
     * Creates and activates a function expression name scope.
     * @private
     * @param {Object} node - Named function expression node
     * @returns {Scope}
     */
    __nestFunctionExpressionNameScope(node) {
        return this.__nestScope(
            new FunctionExpressionNameScope(this, this.__currentScope, node),
        );
    }

    /**
     * Determines if the target ECMAScript version is 6 or higher.
     * @private
     * @returns {boolean}
     */
    __isES6() {
        return this.__options.ecmaVersion >= 6;
    }
}

export default ScopeManager;
