/**
 * no-unsafe-finally — disallow control flow statements in finally blocks.
 * Adapted from ESLint's no-unsafe-finally rule.
 */

import { isFunctionLike } from "./utils.js";

function getEnclosingFinally(node) {
    let current = node.parent;
    while (current) {
        if (
            current.type === "TryStatement" &&
            current.finalizer &&
            isInsideBlock(node, current.finalizer)
        ) {
            return current.finalizer;
        }
        // Stop at function boundary
        if (isFunctionLike(current)) {
            return null;
        }
        current = current.parent;
    }
    return null;
}

function isInsideBlock(node, block) {
    return (
        node.range[0] >= block.range[0] &&
        node.range[1] <= block.range[1]
    );
}

function isLoopNode(node) {
    return node.type === "ForStatement" ||
        node.type === "ForInStatement" ||
        node.type === "ForOfStatement" ||
        node.type === "WhileStatement" ||
        node.type === "DoWhileStatement";
}

function findBreakTarget(node) {
    if (node.label) {
        let current = node.parent;
        while (current) {
            if (current.type === "LabeledStatement" && current.label && current.label.name === node.label.name) {
                return current.body;
            }
            if (isFunctionLike(current)) {
                return null;
            }
            current = current.parent;
        }
        return null;
    }

    let current = node.parent;
    while (current) {
        if (current.type === "SwitchStatement" || isLoopNode(current)) {
            return current;
        }
        if (isFunctionLike(current)) {
            return null;
        }
        current = current.parent;
    }

    return null;
}

function findContinueTarget(node) {
    if (node.label) {
        let current = node.parent;
        while (current) {
            if (current.type === "LabeledStatement" && current.label && current.label.name === node.label.name) {
                return isLoopNode(current.body) ? current.body : null;
            }
            if (isFunctionLike(current)) {
                return null;
            }
            current = current.parent;
        }
        return null;
    }

    let current = node.parent;
    while (current) {
        if (isLoopNode(current)) {
            return current;
        }
        if (isFunctionLike(current)) {
            return null;
        }
        current = current.parent;
    }

    return null;
}

function exitsFinally(_node, finalizer, target) {
    if (!target) return true;
    return !isInsideBlock(target, finalizer);
}

const noUnsafeFinallyRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        const reportedFinalizers = new WeakSet();

        function reportOnce(finalizer, node, message) {
            if (reportedFinalizers.has(finalizer)) return;
            reportedFinalizers.add(finalizer);
            context.report({ node, message });
        }

        return {
            BreakStatement(node) {
                const finalizer = getEnclosingFinally(node);
                if (finalizer && exitsFinally(node, finalizer, findBreakTarget(node))) {
                    reportOnce(finalizer, node, "Unsafe usage of BreakStatement.");
                }
            },
            ContinueStatement(node) {
                const finalizer = getEnclosingFinally(node);
                if (finalizer && exitsFinally(node, finalizer, findContinueTarget(node))) {
                    reportOnce(finalizer, node, "Unsafe usage of ContinueStatement.");
                }
            },
            ReturnStatement(node) {
                const finalizer = getEnclosingFinally(node);
                if (finalizer) {
                    reportOnce(finalizer, node, "Unsafe usage of ReturnStatement.");
                }
            },
            ThrowStatement(node) {
                const finalizer = getEnclosingFinally(node);
                if (finalizer) {
                    reportOnce(finalizer, node, "Unsafe usage of ThrowStatement.");
                }
            },
        };
    },
};

export default noUnsafeFinallyRule;
