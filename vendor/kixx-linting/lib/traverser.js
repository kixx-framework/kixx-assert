/**
 * @module traverser
 * @description
 * Depth-first AST traverser that fires visitor callbacks for rules.
 * Supports both enter/exit phases per node and optional code-path analysis events.
 * Annotates parent pointers during traversal for rule navigation.
 */

import CodePathAnalyzer from "./code-path-analysis/index.js";

/**
 * Set of code-path analysis event names that may be fired during traversal.
 * @type {Set<string>}
 * @private
 */
const CODE_PATH_EVENTS = new Set([
    "onCodePathStart",
    "onCodePathEnd",
    "onCodePathSegmentStart",
    "onCodePathSegmentEnd",
    "onUnreachableCodePathSegmentStart",
    "onUnreachableCodePathSegmentEnd",
    "onCodePathSegmentLoop",
]);

/**
 * Traverses an AST depth-first, firing visitor callbacks for enter and exit phases.
 *
 * Performs a complete AST traversal, calling registered visitor functions at each node.
 * Supports both simple node visitors (keyed by node type) and exit visitors
 * (keyed by "NodeType:exit"). If any code-path analysis events are subscribed to,
 * wraps the visitor with CodePathAnalyzer for additional control-flow analysis.
 *
 * @param {Object} ast - ESTree program AST (root node)
 * @param {Object} visitorKeys - Map of node type to child property names
 * @param {Map<string, Function[]>} visitors - Map of event name to callback arrays
 *   - Keys: node types (e.g., 'Identifier'), or "NodeType:exit" for exit phase
 *   - Values: arrays of callback functions to invoke for that event
 */
export function traverse(ast, visitorKeys, visitors) {
    // Determine if code-path analysis is needed
    const needsCodePath = [...visitors.keys()].some(k => CODE_PATH_EVENTS.has(k));

    // Build a simple event generator that fires rule visitors
    const nodeEventGenerator = {
        enterNode(node) {
            const callbacks = visitors.get(node.type);
            if (callbacks) {
                for (const cb of callbacks) cb(node, node.parent ?? null);
            }
        },
        leaveNode(node) {
            const callbacks = visitors.get(`${node.type}:exit`);
            if (callbacks) {
                for (const cb of callbacks) cb(node, node.parent ?? null);
            }
        },
        emit(eventName, args) {
            const callbacks = visitors.get(eventName);
            if (callbacks) {
                for (const cb of callbacks) cb(...args);
            }
        },
    };

    // Wrap with CodePathAnalyzer if any rule needs code-path events
    const eventGenerator = needsCodePath
        ? new CodePathAnalyzer(nodeEventGenerator)
        : nodeEventGenerator;

    // Perform depth-first traversal, annotating parent pointers
    _traverse(ast, null, visitorKeys, eventGenerator);
}

/**
 * Recursive depth-first traversal implementation.
 *
 * Visits a node, calls enter callback, recursively visits children in order,
 * then calls exit callback. Annotates each node with its parent for rule navigation.
 * Throws if an unknown node type is encountered (missing visitor keys).
 *
 * @private
 * @param {Object} node - Current AST node to visit
 * @param {Object|null} parent - Parent node (null for root)
 * @param {Object} visitorKeys - Child property map (node type → property names)
 * @param {Object} eventGenerator - Event dispatcher with enterNode/leaveNode methods
 * @throws {Error} If node type is not in visitorKeys
 */
function _traverse(node, parent, visitorKeys, eventGenerator) {
    if (node === null || node === undefined) return;
    if (typeof node !== "object" || typeof node.type !== "string") return;

    // Annotate parent so rules and code-path analysis can navigate up
    node.parent = parent;

    // Enter phase
    eventGenerator.enterNode(node);

    // Recurse into children
    const keys = visitorKeys[node.type];
    if (keys) {
        for (const key of keys) {
            const child = node[key];
            if (Array.isArray(child)) {
                for (const item of child) {
                    _traverse(item, node, visitorKeys, eventGenerator);
                }
            } else if (child && typeof child === "object" && typeof child.type === "string") {
                _traverse(child, node, visitorKeys, eventGenerator);
            }
        }
    } else {
        throw new Error(`Unknown node type: ${node.type}`);
    }

    // Leave phase
    eventGenerator.leaveNode(node);
}

export default traverse;
