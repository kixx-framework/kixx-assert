/**
 * @module definition
 * @description
 * Definitions represent where variables are declared in the code.
 * Each Variable can have multiple definitions (e.g., function hoisting, redeclaration).
 */

import Variable from "./variable.js";

/**
 * Represents a variable definition (declaration) in the code.
 *
 * Definitions track the location and context where a variable is declared,
 * enabling connection between Variable objects and their source AST nodes.
 */
class Definition {
    /**
     * @param {string} type - Definition type (Variable.Parameter, Variable.Variable, Variable.FunctionName, etc.)
     * @param {Object} name - The identifier node being defined
     * @param {Object} node - The declaration node (parameter, variable declaration, etc.)
     * @param {Object} [parent] - The containing statement or declaration (for context)
     * @param {number} [index] - Position index (e.g., parameter index)
     * @param {string} [kind] - Declaration kind ('var', 'let', 'const', 'function', etc.)
     */
    constructor(type, name, node, parent, index, kind) {
        this.type = type;
        this.name = name;
        this.node = node;
        this.parent = parent;
        this.index = index;
        this.kind = kind;
    }
}

/**
 * Specialized definition for function/method parameters.
 * Tracks whether the parameter is a rest parameter.
 */
class ParameterDefinition extends Definition {
    /**
     * @param {Object} name - The parameter identifier node
     * @param {Object} node - The parameter node
     * @param {number} index - Position of the parameter in the parameter list
     * @param {boolean} rest - Whether this is a rest parameter (...)
     */
    constructor(name, node, index, rest) {
        super(Variable.Parameter, name, node, null, index, null);

        this.rest = rest;
    }
}

export { ParameterDefinition, Definition };
