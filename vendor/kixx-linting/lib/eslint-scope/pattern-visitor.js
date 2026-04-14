/**
 * @module pattern-visitor
 * @description
 * Visitor for destructuring patterns. Handles variable extraction from destructured
 * assignments, parameters, and declarations like const { x, y } = obj.
 */

import Syntax from "./syntax.js";
import { Visitor } from "./visitor.js";

/**
 * Retrieves the last element of an array.
 * @private
 * @param {*[]} items - Array
 * @returns {*|null}
 */
function getLast(items) {
    return items.at(-1) || null;
}

/**
 * Visitor for extracting identifiers from destructuring patterns.
 *
 * Traverses destructuring patterns (object and array) to identify all variables
 * being declared or assigned. Handles nested patterns, rest elements, and default values.
 * Separates pattern identifiers from right-hand expressions that need to be evaluated.
 */
class PatternVisitor extends Visitor {
    /**
     * Determines if a node is a destructuring pattern.
     * @static
     * @param {Object} node - Node to check
     * @returns {boolean}
     */
    static isPattern(node) {
        const nodeType = node.type;

        return (
            nodeType === Syntax.Identifier ||
            nodeType === Syntax.ObjectPattern ||
            nodeType === Syntax.ArrayPattern ||
            nodeType === Syntax.SpreadElement ||
            nodeType === Syntax.RestElement ||
            nodeType === Syntax.AssignmentPattern
        );
    }

    /**
     * @param {Object} options - Visitor options
     * @param {Object} rootPattern - Root pattern node being analyzed
     * @param {function} callback - Callback invoked for each identifier in the pattern
     */
    constructor(options, rootPattern, callback) {
        super(null, options);
        this.rootPattern = rootPattern;
        this.callback = callback;
        this.assignments = [];
        this.rightHandNodes = [];
        this.restElements = [];
    }

    /**
     * Processes an identifier in the pattern.
     * Invokes the callback with information about the identifier's context.
     *
     * @param {Object} pattern - Identifier node
     */
    Identifier(pattern) {
        const lastRestElement = getLast(this.restElements);

        this.callback(pattern, {
            topLevel: pattern === this.rootPattern,
            rest: Boolean(lastRestElement) && lastRestElement.argument === pattern,
            assignments: this.assignments,
        });
    }

    /**
     * Processes a property in an object pattern.
     * Handles computed property keys as right-hand expressions.
     *
     * @param {Object} property - Property node from ObjectPattern
     */
    Property(property) {
        if (property.computed) {
            this.rightHandNodes.push(property.key);
        }

        this.visit(property.value);
    }

    /**
     * Processes an array pattern.
     * Visits each element of the array.
     *
     * @param {Object} pattern - ArrayPattern node
     */
    ArrayPattern(pattern) {
        for (const element of pattern.elements) {
            this.visit(element);
        }
    }

    /**
     * Processes an assignment pattern (default value).
     * The right side is an expression that must be evaluated.
     *
     * @param {Object} pattern - AssignmentPattern node
     */
    AssignmentPattern(pattern) {
        this.assignments.push(pattern);
        this.visit(pattern.left);
        this.rightHandNodes.push(pattern.right);
        this.assignments.pop();
    }

    /**
     * Processes a rest element (...rest).
     * Captures all remaining elements.
     *
     * @param {Object} pattern - RestElement node
     */
    RestElement(pattern) {
        this.restElements.push(pattern);
        this.visit(pattern.argument);
        this.restElements.pop();
    }

    /**
     * Processes a member expression in an assignment context.
     * These become right-hand side expressions.
     *
     * @param {Object} node - MemberExpression node
     */
    MemberExpression(node) {
        if (node.computed) {
            this.rightHandNodes.push(node.property);
        }

        this.rightHandNodes.push(node.object);
    }

    /**
     * Processes a spread element.
     *
     * @param {Object} node - SpreadElement node
     */
    SpreadElement(node) {
        this.visit(node.argument);
    }

    /**
     * Processes an array expression (not a pattern).
     * Elements become right-hand side expressions.
     *
     * @param {Object} node - ArrayExpression node
     */
    ArrayExpression(node) {
        for (const element of node.elements) {
            this.visit(element);
        }
    }

    /**
     * Processes an assignment expression.
     * Tracks the assignment and separates left (patterns) from right (expressions).
     *
     * @param {Object} node - AssignmentExpression node
     */
    AssignmentExpression(node) {
        this.assignments.push(node);
        this.visit(node.left);
        this.rightHandNodes.push(node.right);
        this.assignments.pop();
    }

    /**
     * Processes a call expression.
     * Arguments become right-hand side expressions.
     *
     * @param {Object} node - CallExpression node
     */
    CallExpression(node) {
        for (const arg of node.arguments) {
            this.rightHandNodes.push(arg);
        }

        this.visit(node.callee);
    }
}

export default PatternVisitor;
