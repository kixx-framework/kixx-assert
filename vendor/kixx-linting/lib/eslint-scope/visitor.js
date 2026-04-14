/**
 * @module visitor
 * @description
 * Generic AST visitor pattern implementation. Provides a base class for traversing
 * and visiting AST nodes with customizable behavior. Used as the foundation for
 * scope analysis traversal.
 */

import Syntax from "./syntax.js";
import VISITOR_KEYS, { mergeVisitorKeys } from "./visitor-keys.js";

/**
 * Determines if a value is an AST node.
 * @private
 * @param {*} node - Value to check
 * @returns {boolean}
 */
function isNode(node) {
    return Boolean(node) && typeof node === "object" && typeof node.type === "string";
}

/**
 * Determines if a node property represents a container of child nodes.
 * Special handling for object/array pattern properties.
 * @private
 * @param {string} nodeType - Type of the parent node
 * @param {string} key - Property key being checked
 * @returns {boolean}
 */
function isPropertyContainer(nodeType, key) {
    return (
        (nodeType === Syntax.ObjectExpression || nodeType === Syntax.ObjectPattern) &&
        key === "properties"
    );
}

/**
 * Converts a fallback strategy to a function that retrieves child node keys.
 * Supports "iteration" (use Object.keys) or custom function.
 * @private
 * @param {string|function} fallback - Fallback strategy
 * @returns {function|null}
 */
function toFallbackFunction(fallback) {
    if (fallback === "iteration") {
        return Object.keys;
    }

    if (typeof fallback === "function") {
        return fallback;
    }

    return null;
}

/**
 * Retrieves a visitor method for a specific node type.
 * Searches the visitor's prototype chain for the method.
 * @private
 * @param {Visitor} visitor - The visitor instance
 * @param {string} nodeType - AST node type name
 * @returns {function|null}
 */
function getVisitorMethod(visitor, nodeType) {
    let current = visitor;

    while (current) {
        if (Object.hasOwn(current, nodeType)) {
            return current[nodeType];
        }

        current = Object.getPrototypeOf(current);
    }

    return null;
}

/**
 * Generic AST visitor using the visitor pattern.
 *
 * Traverses an AST by visiting each node and calling handler methods.
 * Handler methods are named after node types (e.g., Identifier, FunctionDeclaration).
 * If no handler exists, defaults to visiting child nodes.
 */
export class Visitor {
    /**
     * @param {Visitor|null} visitor - The visitor instance (defaults to this)
     * @param {Object} [options] - Configuration options
     * @param {Object} [options.childVisitorKeys] - Custom visitor keys for specific node types
     * @param {string|function} [options.fallback='iteration'] - Strategy for unknown node types
     */
    constructor(visitor, options) {
        const normalizedOptions = options ?? {};

        this.__visitor = visitor || this;

        const providedChildVisitorKeys = normalizedOptions.childVisitorKeys;

        this.__childVisitorKeys = providedChildVisitorKeys
            ? mergeVisitorKeys(providedChildVisitorKeys)
            : VISITOR_KEYS;

        this.__fallback = toFallbackFunction(normalizedOptions.fallback);
    }

    /**
     * Visits all child nodes of a parent node.
     * Uses visitor keys to determine which properties contain child nodes.
     *
     * @param {Object} node - Parent node to visit children of
     */
    visitChildren(node) {
        if (node === null || node === undefined) {
            return;
        }

        const type = node.type || Syntax.Property;
        let children = this.__childVisitorKeys[type];

        if (!children) {
            if (!this.__fallback) {
                throw new Error(`Unknown node type ${type}.`);
            }

            children = this.__fallback(node);
        }

        for (const childKey of children) {
            const child = node[childKey];

            if (!child) {
                continue;
            }

            if (Array.isArray(child)) {
                for (const childNode of child) {
                    if (!childNode) {
                        continue;
                    }

                    if (isNode(childNode) || isPropertyContainer(type, childKey)) {
                        this.visit(childNode);
                    }
                }

                continue;
            }

            if (isNode(child)) {
                this.visit(child);
            }
        }
    }

    /**
     * Visits a node, calling the appropriate handler method if it exists.
     *
     * If a handler method exists for the node type, it is called with the node.
     * Otherwise, child nodes are visited recursively.
     *
     * @param {Object} node - Node to visit
     */
    visit(node) {
        if (node === null || node === undefined) {
            return;
        }

        const type = node.type || Syntax.Property;
        const visitorMethod = getVisitorMethod(this.__visitor, type);

        if (typeof visitorMethod === "function") {
            visitorMethod.call(this, node);
            return;
        }

        this.visitChildren(node);
    }
}

/**
 * Convenience function to create a visitor and visit an AST.
 * Useful for one-off traversals without creating a visitor class.
 *
 * @param {Object} node - Root node to start visiting
 * @param {Object} visitor - Object with visitor methods (keyed by node type)
 * @param {Object} [options] - Configuration options
 */
export function visit(node, visitor, options) {
    const walker = new Visitor(visitor, options);

    walker.visit(node);
}
