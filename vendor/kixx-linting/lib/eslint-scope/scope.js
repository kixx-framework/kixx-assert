/**
 * @module scope
 * @description
 * Scope implementation and hierarchy. Defines the base Scope class and specialized
 * scope types (Global, Module, Function, Class, Block, etc.) that represent different
 * lexical environments in JavaScript code.
 */

import Syntax from "./syntax.js";
import Reference from "./reference.js";
import Variable from "./variable.js";
import { Definition } from "./definition.js";
import { assert } from "./assert.js";

/**
 * Determines if a scope should be treated as strict mode.
 * Checks for explicit "use strict" directives and context (class, module, method).
 * @private
 * @param {Scope} scope - The scope to check
 * @param {Object} block - The AST node for the scope
 * @param {boolean} isMethodDefinition - Whether this scope is for a class method
 * @returns {boolean}
 */
function isStrictScope(scope, block, isMethodDefinition) {
    let body;

    if (scope.upper && scope.upper.isStrict) {
        return true;
    }

    if (isMethodDefinition) {
        return true;
    }

    if (scope.type === "class" || scope.type === "module") {
        return true;
    }

    if (scope.type === "block" || scope.type === "switch") {
        return false;
    }

    if (scope.type === "function") {
        if (
            block.type === Syntax.ArrowFunctionExpression &&
            block.body.type !== Syntax.BlockStatement
        ) {
            return false;
        }

        body = block.type === Syntax.Program ? block : block.body;

        if (!body) {
            return false;
        }
    } else if (scope.type === "global") {
        body = block;
    } else {
        return false;
    }

    for (const statement of body.body) {
        if (typeof statement.directive !== "string") {
            break;
        }

        if (statement.directive === "use strict") {
            return true;
        }
    }

    return false;
}

/**
 * Registers a newly created scope with the scope manager.
 * @private
 * @param {ScopeManager} scopeManager - The manager instance
 * @param {Scope} scope - Scope to register
 */
function registerScope(scopeManager, scope) {
    scopeManager.scopes.push(scope);

    const scopes = scopeManager.__nodeToScope.get(scope.block);

    if (scopes) {
        scopes.push(scope);
        return;
    }

    scopeManager.__nodeToScope.set(scope.block, [scope]);
}

/**
 * Represents a lexical scope in an ECMAScript program.
 *
 * Each scope maintains a set of variables defined within it, references to those
 * variables, and a relationship to parent scopes. Scopes can be static (closed) or
 * dynamic (like with statements), affecting how variable resolution works.
 */
class Scope {
    /**
     * @param {ScopeManager} scopeManager - The scope manager instance
     * @param {string} type - Scope type ('global', 'module', 'function', 'class', 'block', etc.)
     * @param {Scope|null} upperScope - Parent scope in the hierarchy
     * @param {Object} block - AST node that creates this scope
     * @param {boolean} isMethodDefinition - Whether this scope is for a class method definition
     */
    constructor(scopeManager, type, upperScope, block, isMethodDefinition) {
        this.type = type;
        this.set = new Map();
        this.taints = new Map();
        this.dynamic = this.type === "global" || this.type === "with";
        this.block = block;
        this.through = [];
        this.variables = [];
        this.references = [];
        this.variableScope = (
            this.type === "global" ||
            this.type === "module" ||
            this.type === "function" ||
            this.type === "class-field-initializer" ||
            this.type === "class-static-block"
        ) ?
            this :
            upperScope.variableScope;
        this.functionExpressionScope = false;
        this.directCallToEvalScope = false;
        this.thisFound = false;
        this.__left = [];
        this.upper = upperScope;
        this.isStrict = scopeManager.isStrictModeSupported() ?
            isStrictScope(this, block, isMethodDefinition) :
            false;
        this.childScopes = [];

        if (this.upper) {
            this.upper.childScopes.push(this);
        }

        this.__declaredVariables = scopeManager.__declaredVariables;

        registerScope(scopeManager, this);
    }

    /**
     * Determines if this scope can be statically closed without dynamic resolution.
     * @private
     * @param {ScopeManager} scopeManager
     * @returns {boolean}
     */
    __shouldStaticallyClose(scopeManager) {
        return !this.dynamic || scopeManager.__isOptimistic() || this.type === "global";
    }

    /**
     * Closes a reference using static (lexical) scope resolution.
     * Attempts to resolve within this scope, delegating to upper scope if not found.
     * @private
     * @param {Reference} ref - Reference to close
     */
    __staticCloseRef(ref) {
        if (!this.__resolve(ref)) {
            this.__delegateToUpperScope(ref);
        }
    }

    /**
     * Closes a reference using dynamic scope resolution.
     * Marks the reference as "through" all scopes up to the root, indicating
     * it may be resolved dynamically (e.g., via eval or with statements).
     * @private
     * @param {Reference} ref - Reference to close
     */
    __dynamicCloseRef(ref) {
        let current = this;

        while (current) {
            current.through.push(ref);
            current = current.upper;
        }
    }

    /**
     * Closes this scope by resolving all pending references.
     * Once closed, no more references can be added to this scope.
     * @private
     * @param {ScopeManager} scopeManager
     * @returns {Scope|null} The upper scope
     */
    __close(scopeManager) {
        const closeReference = this.__shouldStaticallyClose(scopeManager) ?
            this.__staticCloseRef :
            this.__dynamicCloseRef;

        for (const ref of this.__left) {
            closeReference.call(this, ref);
        }

        this.__left = null;

        return this.upper;
    }

    /**
     * Determines if a reference can be validly resolved to a variable in this scope.
     * Can be overridden by subclasses to apply scope-specific resolution rules.
     * @private
     * @param {Reference} _ref - The reference
     * @param {Variable} _variable - The variable in question
     * @returns {boolean}
     */
    __isValidResolution(_ref, _variable) {
        return true;
    }

    /**
     * Attempts to resolve a reference to a variable in this scope.
     * Updates the reference and variable relationship tracking.
     * @private
     * @param {Reference} ref - The reference to resolve
     * @returns {boolean} True if resolved, false otherwise
     */
    __resolve(ref) {
        const name = ref.identifier.name;

        if (!this.set.has(name)) {
            return false;
        }

        const variable = this.set.get(name);

        if (!this.__isValidResolution(ref, variable)) {
            return false;
        }

        variable.references.push(ref);
        variable.stack = variable.stack && ref.from.variableScope === this.variableScope;

        if (ref.tainted) {
            variable.tainted = true;
            this.taints.set(variable.name, true);
        }

        ref.resolved = variable;
        return true;
    }

    /**
     * Delegates a reference to the upper scope for resolution.
     * Used when a variable is not found in the current scope.
     * @private
     * @param {Reference} ref - The reference to delegate
     */
    __delegateToUpperScope(ref) {
        if (this.upper) {
            this.upper.__left.push(ref);
        }

        this.through.push(ref);
    }

    /**
     * Associates a variable with the AST nodes that declare it.
     * Helps track the source locations of variable declarations.
     * @private
     * @param {Variable} variable - The variable to associate
     * @param {Object|null} node - The declaring node (identifier, parameter, etc.)
     */
    __addDeclaredVariablesOfNode(variable, node) {
        if (node === null || node === undefined) {
            return;
        }

        let variables = this.__declaredVariables.get(node);

        if (!variables) {
            variables = [];
            this.__declaredVariables.set(node, variables);
        }

        if (!variables.includes(variable)) {
            variables.push(variable);
        }
    }

    /**
     * Defines or updates a variable in the given set.
     * Internal utility for variable declaration registration.
     * @private
     * @param {string} name - Variable name
     * @param {Map} set - Variable set to update
     * @param {Variable[]} variables - Variables array to update
     * @param {Object|null} node - Identifier node (if any)
     * @param {Definition|null} def - Variable definition (if any)
     */
    __defineGeneric(name, set, variables, node, def) {
        let variable = set.get(name);

        if (!variable) {
            variable = new Variable(name, this);
            set.set(name, variable);
            variables.push(variable);
        }

        if (def) {
            variable.defs.push(def);
            this.__addDeclaredVariablesOfNode(variable, def.node);
            this.__addDeclaredVariablesOfNode(variable, def.parent);
        }

        if (node) {
            variable.identifiers.push(node);
        }
    }

    /**
     * Defines a variable from an identifier node.
     * @private
     * @param {Object} node - Identifier node
     * @param {Definition} def - Variable definition
     */
    __define(node, def) {
        if (node && node.type === Syntax.Identifier) {
            this.__defineGeneric(node.name, this.set, this.variables, node, def);
        }
    }

    /**
     * Records a reference (variable use) in this scope.
     * References are resolved once the scope is closed.
     * @private
     * @param {Object} node - Identifier node being referenced
     * @param {number} [assign=Reference.READ] - Reference type (read, write, or both)
     * @param {Object} [writeExpr] - The expression being assigned (for write references)
     * @param {boolean|Object} [maybeImplicitGlobal] - Potential implicit global info
     * @param {boolean} [partial] - Whether this is a partial write (e.g., +=)
     * @param {boolean} [init] - Whether this initializes the variable
     */
    __referencing(node, assign, writeExpr, maybeImplicitGlobal, partial, init) {
        if (!node || (node.type !== Syntax.Identifier && node.type !== "JSXIdentifier")) {
            return;
        }

        if (node.name === "super") {
            return;
        }

        const reference = new Reference(
            node,
            this,
            assign || Reference.READ,
            writeExpr,
            maybeImplicitGlobal,
            Boolean(partial),
            Boolean(init),
        );

        this.references.push(reference);
        this.__left.push(reference);
    }

    /**
     * Marks this scope as containing a direct eval() call, making it dynamic.
     * All parent scopes are also marked as dynamic since eval can access them.
     * @private
     */
    __detectEval() {
        let current = this;

        this.directCallToEvalScope = true;

        while (current) {
            current.dynamic = true;
            current = current.upper;
        }
    }

    /**
     * Records that `this` keyword was found in this scope.
     * @private
     */
    __detectThis() {
        this.thisFound = true;
    }

    /**
     * Determines if this scope has been closed and can no longer accept references.
     * @private
     * @returns {boolean}
     */
    __isClosed() {
        return this.__left === null;
    }

    /**
     * Finds a reference in this scope for the given identifier node.
     * @param {Object} ident - Identifier node to find reference for
     * @returns {Reference|null} The reference if found, null otherwise
     */
    resolve(ident) {
        assert(this.__isClosed(), "Scope should be closed.");
        assert(ident.type === Syntax.Identifier, "Target should be identifier.");

        for (const ref of this.references) {
            if (ref.identifier === ident) {
                return ref;
            }
        }

        return null;
    }

    /**
     * Determines if this scope uses only static (lexical) resolution.
     * Returns false if the scope is dynamic (e.g., with statement or direct eval).
     * @returns {boolean}
     */
    isStatic() {
        return !this.dynamic;
    }

    /**
     * Determines if the 'arguments' object is accessible in this scope.
     * Can be overridden by subclasses (e.g., arrow functions return false).
     * @returns {boolean}
     */
    isArgumentsMaterialized() {
        return true;
    }

    /**
     * Determines if the 'this' keyword is accessible in this scope.
     * Can be overridden by subclasses (e.g., arrow functions use enclosing this).
     * @returns {boolean}
     */
    isThisMaterialized() {
        return true;
    }

    /**
     * Checks if a name is used in this scope (defined or referenced).
     * @param {string} name - Variable name
     * @returns {boolean} True if the name is declared or referenced here
     */
    isUsedName(name) {
        if (this.set.has(name)) {
            return true;
        }

        return this.through.some(reference => reference.identifier.name === name);
    }
}

/**
 * The global scope (top-level scope of a program).
 * Supports implicit global variable creation and special handling for global references.
 */
class GlobalScope extends Scope {
    /**
     * @param {ScopeManager} scopeManager
     * @param {Object} block - Program node
     */
    constructor(scopeManager, block) {
        super(scopeManager, "global", null, block, false);
        this.implicit = {
            set: new Map(),
            variables: [],
            left: [],
        };
    }

    /**
     * Closes the global scope, handling implicit global variable creation.
     * @private
     * @param {ScopeManager} scopeManager
     * @returns {null}
     */
    __close(scopeManager) {
        const implicit = [];

        for (const ref of this.__left) {
            if (ref.__maybeImplicitGlobal && !this.set.has(ref.identifier.name)) {
                implicit.push(ref.__maybeImplicitGlobal);
            }
        }

        for (const info of implicit) {
            this.__defineImplicit(
                info.pattern,
                new Definition(
                    Variable.ImplicitGlobalVariable,
                    info.pattern,
                    info.node,
                    null,
                    null,
                    null,
                ),
            );
        }

        super.__close(scopeManager);
        this.implicit.left = [...this.through];

        return null;
    }

    /**
     * Defines a variable in the implicit global set.
     * @private
     * @param {Object} node - Identifier node
     * @param {Definition} def - Variable definition
     */
    __defineImplicit(node, def) {
        if (node && node.type === Syntax.Identifier) {
            this.__defineGeneric(node.name, this.implicit.set, this.implicit.variables, node, def);
        }
    }

    /**
     * Adds variable names to the global scope.
     * Properly handles reassignment of implicit globals to explicit globals.
     * @private
     * @param {string[]} names - Variable names to add
     */
    __addVariables(names) {
        for (const name of names) {
            this.__defineGeneric(name, this.set, this.variables, null, null);
        }

        const namesSet = new Set(names);

        this.through = this.through.filter(reference => {
            const name = reference.identifier.name;

            if (!namesSet.has(name)) {
                return true;
            }

            const variable = this.set.get(name);

            reference.resolved = variable;
            variable.references.push(reference);
            return false;
        });

        this.implicit.variables = this.implicit.variables.filter(variable => {
            if (!namesSet.has(variable.name)) {
                return true;
            }

            this.implicit.set.delete(variable.name);
            return false;
        });

        this.implicit.left = this.implicit.left.filter(
            reference => !namesSet.has(reference.identifier.name),
        );
    }
}

/**
 * Scope for ES modules (entire module is a scope).
 */
class ModuleScope extends Scope {
    /**
     * @param {ScopeManager} scopeManager
     * @param {Scope} upperScope - Usually null (modules have no outer scope)
     * @param {Object} block - Program node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "module", upperScope, block, false);
    }
}

/**
 * Scope for the name binding of named function expressions.
 * Only the function name is visible in this scope.
 */
class FunctionExpressionNameScope extends Scope {
    /**
     * @param {ScopeManager} scopeManager
     * @param {Scope} upperScope - Parent scope
     * @param {Object} block - Function expression node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "function-expression-name", upperScope, block, false);
        this.__define(
            block.id,
            new Definition(
                Variable.FunctionName,
                block.id,
                block,
                null,
                null,
                null,
            ),
        );
        this.functionExpressionScope = true;
    }
}

/**
 * Scope for catch clause parameters (the exception variable).
 */
class CatchScope extends Scope {
    /**
     * @param {ScopeManager} scopeManager
     * @param {Scope} upperScope - Parent scope
     * @param {Object} block - Catch clause node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "catch", upperScope, block, false);
    }
}

/**
 * Scope for with statements (dynamic scope).
 * References may be resolved at runtime based on the object's properties.
 */
class WithScope extends Scope {
    /**
     * @param {ScopeManager} scopeManager
     * @param {Scope} upperScope - Parent scope
     * @param {Object} block - With statement node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "with", upperScope, block, false);
    }

    /**
     * Closes a with scope, marking references as tainted if dynamically resolved.
     * @private
     * @param {ScopeManager} scopeManager
     * @returns {Scope} Upper scope
     */
    __close(scopeManager) {
        if (this.__shouldStaticallyClose(scopeManager)) {
            return super.__close(scopeManager);
        }

        for (const ref of this.__left) {
            ref.tainted = true;
            this.__delegateToUpperScope(ref);
        }

        this.__left = null;
        return this.upper;
    }
}

/**
 * Scope for block statements with let/const declarations.
 * Block-level scope introduced by braces, not hoisted function declarations.
 */
class BlockScope extends Scope {
    /**
     * @param {ScopeManager} scopeManager
     * @param {Scope} upperScope - Parent scope
     * @param {Object} block - Block statement node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "block", upperScope, block, false);
    }
}

/**
 * Scope for switch statements.
 * Treats the cases block as a scope for let/const declarations.
 */
class SwitchScope extends Scope {
    /**
     * @param {ScopeManager} scopeManager
     * @param {Scope} upperScope - Parent scope
     * @param {Object} block - Switch statement node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "switch", upperScope, block, false);
    }
}

/**
 * Scope for function declarations and expressions.
 * Manages function parameters, local variables, and the implicit 'arguments' object.
 */
class FunctionScope extends Scope {
    /**
     * @param {ScopeManager} scopeManager
     * @param {Scope} upperScope - Parent scope
     * @param {Object} block - Function declaration or expression node
     * @param {boolean} isMethodDefinition - Whether this is a class method
     */
    constructor(scopeManager, upperScope, block, isMethodDefinition) {
        super(scopeManager, "function", upperScope, block, isMethodDefinition);

        if (this.block.type !== Syntax.ArrowFunctionExpression) {
            this.__defineArguments();
        }
    }

    /**
     * Determines if the 'arguments' object should be accessible.
     * Arrow functions do not have their own arguments; they use the enclosing function's.
     * @returns {boolean}
     */
    isArgumentsMaterialized() {
        if (this.block.type === Syntax.ArrowFunctionExpression) {
            return false;
        }

        if (!this.isStatic()) {
            return true;
        }

        const variable = this.set.get("arguments");

        assert(variable, "Always have arguments variable.");
        return variable.tainted || variable.references.length !== 0;
    }

    /**
     * Determines if 'this' should be accessible in this function.
     * Arrow functions inherit 'this' from their enclosing scope.
     * @returns {boolean}
     */
    isThisMaterialized() {
        if (!this.isStatic()) {
            return true;
        }

        return this.thisFound;
    }

    /**
     * Defines the implicit 'arguments' binding in this function scope.
     * @private
     */
    __defineArguments() {
        this.__defineGeneric("arguments", this.set, this.variables, null, null);
        this.taints.set("arguments", true);
    }

    /**
     * Validates that a reference can be resolved in this function scope.
     * Prevents referencing variables before they are defined in the function body.
     * @private
     * @param {Reference} ref
     * @param {Variable} variable
     * @returns {boolean}
     */
    __isValidResolution(ref, variable) {
        if (this.block.type === Syntax.Program) {
            return true;
        }

        const bodyStart = this.block.body.range[0];

        return !(
            variable.scope === this &&
            ref.identifier.range[0] < bodyStart &&
            variable.defs.every(definition => definition.name.range[0] >= bodyStart)
        );
    }
}

/**
 * Scope for for-loop init blocks (for let/const declarations in for loops).
 */
class ForScope extends Scope {
    /**
     * @param {ScopeManager} scopeManager
     * @param {Scope} upperScope - Parent scope
     * @param {Object} block - For statement node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "for", upperScope, block, false);
    }
}

/**
 * Scope for class bodies.
 * Class declarations and expressions create their own scope.
 */
class ClassScope extends Scope {
    /**
     * @param {ScopeManager} scopeManager
     * @param {Scope} upperScope - Parent scope
     * @param {Object} block - Class declaration or expression node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "class", upperScope, block, false);
    }
}

/**
 * Scope for class field initializers.
 * Field initializers run in their own scope with access to the class scope.
 */
class ClassFieldInitializerScope extends Scope {
    /**
     * @param {ScopeManager} scopeManager
     * @param {Scope} upperScope - Parent scope
     * @param {Object} block - Field initializer node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "class-field-initializer", upperScope, block, true);
    }
}

/**
 * Scope for class static blocks.
 * Static blocks are their own scope with access to the class scope.
 */
class ClassStaticBlockScope extends Scope {
    /**
     * @param {ScopeManager} scopeManager
     * @param {Scope} upperScope - Parent scope
     * @param {Object} block - Static block node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "class-static-block", upperScope, block, true);
    }
}

export {
    Scope,
    GlobalScope,
    ModuleScope,
    FunctionExpressionNameScope,
    CatchScope,
    WithScope,
    BlockScope,
    SwitchScope,
    FunctionScope,
    ForScope,
    ClassScope,
    ClassFieldInitializerScope,
    ClassStaticBlockScope,
};
