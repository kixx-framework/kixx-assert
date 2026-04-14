/**
 * Represents a variable in the scope hierarchy.
 *
 * Tracks all definitions and references of a variable throughout the code,
 * including its name, scope, whether it's tainted, and stack status.
 */
class Variable {
    /**
     * @param {string} name - Variable name
     * @param {Scope} scope - The scope where this variable is defined
     */
    constructor(name, scope) {
        this.name = name;
        this.identifiers = [];
        this.references = [];
        this.defs = [];
        this.tainted = false;
        this.stack = true;
        this.scope = scope;
    }
}

/**
 * Variable type: catch clause parameter (exception binding)
 * @type {string}
 */
Variable.CatchClause = "CatchClause";

/**
 * Variable type: function or method parameter
 * @type {string}
 */
Variable.Parameter = "Parameter";

/**
 * Variable type: function name (in named function expressions)
 * @type {string}
 */
Variable.FunctionName = "FunctionName";

/**
 * Variable type: class name
 * @type {string}
 */
Variable.ClassName = "ClassName";

/**
 * Variable type: regular variable (var, let, const, function declaration, class declaration)
 * @type {string}
 */
Variable.Variable = "Variable";

/**
 * Variable type: import binding (from import declarations)
 * @type {string}
 */
Variable.ImportBinding = "ImportBinding";

/**
 * Variable type: implicitly declared global variable (assignment without declaration in non-strict)
 * @type {string}
 */
Variable.ImplicitGlobalVariable = "ImplicitGlobalVariable";

export default Variable;
