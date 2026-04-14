/**
 * Bridges AST traversal events to code-path state transitions.
 *
 * The analyzer wraps a parser/event generator and emits the corresponding
 * code-path lifecycle events as nodes are entered and exited.
 *
 * @author Toru Nagashima
 */

import assert from "node:assert";
import { CodePath } from "./code-path.js";
import { CodePathSegment } from "./code-path-segment.js";
import { IdGenerator } from "./id-generator.js";
import * as debug from "./debug-helpers.js";

const breakableTypePattern =
    /^(?:(?:Do)?While|For(?:In|Of)?|Switch)Statement$/u;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Checks whether a `SwitchCase` node has an explicit test expression.
 * @param {ASTNode} node Switch case node to check.
 * @returns {boolean} `true` when the node is a `case` node rather than `default`.
 */
function isCaseNode(node) {
    return Boolean(node.test);
}

/**
 * Checks whether a node is the value side of a class field definition.
 * @param {ASTNode} node Node to check.
 * @returns {boolean} `true` when the node is the value of a `PropertyDefinition`.
 */
function isPropertyDefinitionValue(node) {
    const parent = node.parent;

    return (
        parent && parent.type === "PropertyDefinition" && parent.value === node
    );
}

/**
 * Checks whether the given logical operator is taken into account for the code
 * path analysis.
 * @param {string} operator The operator found in the LogicalExpression node
 * @returns {boolean} `true` if the operator is "&&" or "||" or "??"
 */
function isHandledLogicalOperator(operator) {
    return operator === "&&" || operator === "||" || operator === "??";
}

/**
 * Checks whether the given assignment operator is a logical assignment operator.
 * Logical assignments are taken into account for the code path analysis
 * because of their short-circuiting semantics.
 * @param {string} operator The operator found in the AssignmentExpression node
 * @returns {boolean} `true` if the operator is "&&=" or "||=" or "??="
 */
function isLogicalAssignmentOperator(operator) {
    return operator === "&&=" || operator === "||=" || operator === "??=";
}

/**
 * Gets the label when the parent node is a `LabeledStatement`.
 * @param {ASTNode} node Node to inspect.
 * @returns {string|null} The label name, or `null`.
 */
function getLabel(node) {
    if (node.parent.type === "LabeledStatement") {
        return node.parent.label.name;
    }
    return null;
}

/**
 * Checks whether a node acts as the branching condition for control-flow analysis.
 * @param {ASTNode} node Node to inspect.
 * @returns {boolean} `true` when the node can fork between the true and false paths.
 */
function isForkingByTrueOrFalse(node) {
    const parent = node.parent;

    switch (parent.type) {
        case "ConditionalExpression":
        case "IfStatement":
        case "WhileStatement":
        case "DoWhileStatement":
        case "ForStatement":
            return parent.test === node;

        case "LogicalExpression":
            return isHandledLogicalOperator(parent.operator);

        case "AssignmentExpression":
            return isLogicalAssignmentOperator(parent.operator);

        default:
            return false;
    }
}

/**
 * Gets the boolean value of a literal when it is a simple constant.
 *
 * This is used to detect infinite loops such as `while (true) {}`. Statements
 * that follow such a loop are unreachable unless the loop contains a `break`.
 * @param {ASTNode} node Node to inspect.
 * @returns {boolean|undefined} The boolean value for literal nodes, otherwise `undefined`.
 */
function getBooleanValueIfSimpleConstant(node) {
    if (node.type === "Literal") {
        return Boolean(node.value);
    }
    return void 0;
}

/**
 * Checks whether an identifier is a runtime reference rather than a binding.
 *
 * This is used to detect the first potentially throwable expression inside a `try` block.
 * @param {ASTNode} node Identifier node to check.
 * @returns {boolean} `true` when the identifier is referenced at runtime.
 */
function isIdentifierReference(node) {
    const parent = node.parent;

    switch (parent.type) {
        case "LabeledStatement":
        case "BreakStatement":
        case "ContinueStatement":
        case "ArrayPattern":
        case "RestElement":
        case "ImportSpecifier":
        case "ImportDefaultSpecifier":
        case "ImportNamespaceSpecifier":
        case "CatchClause":
            return false;

        case "FunctionDeclaration":
        case "FunctionExpression":
        case "ArrowFunctionExpression":
        case "ClassDeclaration":
        case "ClassExpression":
        case "VariableDeclarator":
            return parent.id !== node;

        case "Property":
        case "PropertyDefinition":
        case "MethodDefinition":
            return parent.key !== node || parent.computed || parent.shorthand;

        case "AssignmentPattern":
            return parent.key !== node;

        default:
            return true;
    }
}

/**
 * Synchronizes the current segments with the head of the fork context.
 *
 * The analyzer emits matching start and end events when branches change so
 * consumers can observe the path transition at the AST boundary that caused it.
 * @param {CodePathAnalyzer} analyzer Analyzer instance.
 * @param {ASTNode} node Current AST node.
 * @returns {void}
 */
function forwardCurrentToHead(analyzer, node) {
    const codePath = analyzer.codePath;
    const state = CodePath.getState(codePath);
    const currentSegments = state.currentSegments;
    const headSegments = state.headSegments;
    const end = Math.max(currentSegments.length, headSegments.length);
    let i, currentSegment, headSegment;

    // Fires leaving events.
    for (i = 0; i < end; i += 1) {
        currentSegment = currentSegments[i];
        headSegment = headSegments[i];

        if (currentSegment !== headSegment && currentSegment) {
            const eventName = currentSegment.reachable
                ? "onCodePathSegmentEnd"
                : "onUnreachableCodePathSegmentEnd";

            debug.dump(`${eventName} ${currentSegment.id}`);

            analyzer.emit(eventName, [currentSegment, node]);
        }
    }

    // Update state.
    state.currentSegments = headSegments;

    // Fires entering events.
    for (i = 0; i < end; i += 1) {
        currentSegment = currentSegments[i];
        headSegment = headSegments[i];

        if (currentSegment !== headSegment && headSegment) {
            const eventName = headSegment.reachable
                ? "onCodePathSegmentStart"
                : "onUnreachableCodePathSegmentStart";

            debug.dump(`${eventName} ${headSegment.id}`);
            CodePathSegment.markUsed(headSegment);
            analyzer.emit(eventName, [headSegment, node]);
        }
    }
}

/**
 * Closes any currently active segments at the end of a code path.
 * @param {CodePathAnalyzer} analyzer Analyzer instance.
 * @param {ASTNode} node Current AST node.
 * @returns {void}
 */
function leaveFromCurrentSegment(analyzer, node) {
    const state = CodePath.getState(analyzer.codePath);
    const currentSegments = state.currentSegments;

    for (let i = 0; i < currentSegments.length; i += 1) {
        const currentSegment = currentSegments[i];
        const eventName = currentSegment.reachable
            ? "onCodePathSegmentEnd"
            : "onUnreachableCodePathSegmentEnd";

        debug.dump(`${eventName} ${currentSegment.id}`);

        analyzer.emit(eventName, [currentSegment, node]);
    }

    state.currentSegments = [];
}

/**
 * Updates the code path based on a node's position within its parent.
 *
 * For example, visiting `parent.consequent` creates the corresponding branch
 * before the node itself is processed.
 * @param {CodePathAnalyzer} analyzer Analyzer instance.
 * @param {ASTNode} node Current AST node.
 * @returns {void}
 */
function preprocess(analyzer, node) {
    const codePath = analyzer.codePath;
    const state = CodePath.getState(codePath);
    const parent = node.parent;

    switch (parent.type) {
        // The `arguments.length == 0` case is in `postprocess` function.
        case "CallExpression":
            if (
                parent.optional === true &&
                parent.arguments.length >= 1 &&
                parent.arguments[0] === node
            ) {
                state.makeOptionalRight();
            }
            break;
        case "MemberExpression":
            if (parent.optional === true && parent.property === node) {
                state.makeOptionalRight();
            }
            break;

        case "LogicalExpression":
            if (
                parent.right === node &&
                isHandledLogicalOperator(parent.operator)
            ) {
                state.makeLogicalRight();
            }
            break;

        case "AssignmentExpression":
            if (
                parent.right === node &&
                isLogicalAssignmentOperator(parent.operator)
            ) {
                state.makeLogicalRight();
            }
            break;

        case "ConditionalExpression":
        case "IfStatement":
            /*
             * Fork if this node is at `consequent`/`alternate`.
             * `popForkContext()` exists at `IfStatement:exit` and
             * `ConditionalExpression:exit`.
             */
            if (parent.consequent === node) {
                state.makeIfConsequent();
            } else if (parent.alternate === node) {
                state.makeIfAlternate();
            }
            break;

        case "SwitchCase":
            if (parent.consequent[0] === node) {
                state.makeSwitchCaseBody(false, !parent.test);
            }
            break;

        case "TryStatement":
            if (parent.handler === node) {
                state.makeCatchBlock();
            } else if (parent.finalizer === node) {
                state.makeFinallyBlock();
            }
            break;

        case "WhileStatement":
            if (parent.test === node) {
                state.makeWhileTest(getBooleanValueIfSimpleConstant(node));
            } else {
                assert(parent.body === node);
                state.makeWhileBody();
            }
            break;

        case "DoWhileStatement":
            if (parent.body === node) {
                state.makeDoWhileBody();
            } else {
                assert(parent.test === node);
                state.makeDoWhileTest(getBooleanValueIfSimpleConstant(node));
            }
            break;

        case "ForStatement":
            if (parent.test === node) {
                state.makeForTest(getBooleanValueIfSimpleConstant(node));
            } else if (parent.update === node) {
                state.makeForUpdate();
            } else if (parent.body === node) {
                state.makeForBody();
            }
            break;

        case "ForInStatement":
        case "ForOfStatement":
            if (parent.left === node) {
                state.makeForInOfLeft();
            } else if (parent.right === node) {
                state.makeForInOfRight();
            } else {
                assert(parent.body === node);
                state.makeForInOfBody();
            }
            break;

        case "AssignmentPattern":
            /*
             * Fork if this node is at `right`.
             * `left` is executed always, so it uses the current path.
             * `popForkContext()` exists at `AssignmentPattern:exit`.
             */
            if (parent.right === node) {
                state.pushForkContext();
                state.forkBypassPath();
                state.forkPath();
            }
            break;

        default:
            break;
    }
}

/**
 * Updates the code path due to the type of a given node in entering.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCodePathToEnter(analyzer, node) {
    let codePath = analyzer.codePath;
    let state = codePath && CodePath.getState(codePath);
    const parent = node.parent;

    /**
     * Creates a new code path and trigger the onCodePathStart event
     * based on the currently selected node.
     * @param {string} origin The reason the code path was started.
     * @returns {void}
     */
    function startCodePath(origin) {
        if (codePath) {
            // Emits onCodePathSegmentStart events if updated.
            forwardCurrentToHead(analyzer, node);
            debug.dumpState(node, state, false);
        }

        // Create the code path of this scope.
        codePath = new CodePath({
            id: analyzer.idGenerator.next(),
            origin,
            upper: codePath,
            onLooped: analyzer.onLooped,
        });
        analyzer.codePath = codePath;
        state = CodePath.getState(codePath);

        // Emits onCodePathStart events.
        debug.dump(`onCodePathStart ${codePath.id}`);
        analyzer.emit("onCodePathStart", [codePath, node]);
    }

    /*
     * Special case: The right side of class field initializer is considered
     * to be its own function, so we need to start a new code path in this
     * case.
     */
    if (isPropertyDefinitionValue(node)) {
        startCodePath("class-field-initializer");

        /*
         * Intentional fall through because `node` needs to also be
         * processed by the code below. For example, if we have:
         *
         * class Foo {
         *     a = () => {}
         * }
         *
         * In this case, we also need start a second code path.
         */
    }

    switch (node.type) {
        case "Program":
            startCodePath("program");
            break;

        case "FunctionDeclaration":
        case "FunctionExpression":
        case "ArrowFunctionExpression":
            startCodePath("function");
            break;

        case "StaticBlock":
            startCodePath("class-static-block");
            break;

        case "ChainExpression":
            state.pushChainContext();
            break;
        case "CallExpression":
            if (node.optional === true) {
                state.makeOptionalNode();
            }
            break;
        case "MemberExpression":
            if (node.optional === true) {
                state.makeOptionalNode();
            }
            break;

        case "LogicalExpression":
            if (isHandledLogicalOperator(node.operator)) {
                state.pushChoiceContext(
                    node.operator,
                    isForkingByTrueOrFalse(node),
                );
            }
            break;

        case "AssignmentExpression":
            if (isLogicalAssignmentOperator(node.operator)) {
                state.pushChoiceContext(
                    node.operator.slice(0, -1), // removes `=` from the end
                    isForkingByTrueOrFalse(node),
                );
            }
            break;

        case "ConditionalExpression":
        case "IfStatement":
            state.pushChoiceContext("test", false);
            break;

        case "SwitchStatement":
            state.pushSwitchContext(
                node.cases.some(isCaseNode),
                getLabel(node),
            );
            break;

        case "TryStatement":
            state.pushTryContext(Boolean(node.finalizer));
            break;

        case "SwitchCase":
            /*
             * Fork if this node is after the 2st node in `cases`.
             * It's similar to `else` blocks.
             * The next `test` node is processed in this path.
             */
            if (parent.discriminant !== node && parent.cases[0] !== node) {
                state.forkPath();
            }
            break;

        case "WhileStatement":
        case "DoWhileStatement":
        case "ForStatement":
        case "ForInStatement":
        case "ForOfStatement":
            state.pushLoopContext(node.type, getLabel(node));
            break;

        case "LabeledStatement":
            if (!breakableTypePattern.test(node.body.type)) {
                state.pushBreakContext(false, node.label.name);
            }
            break;

        default:
            break;
    }

    // Emits onCodePathSegmentStart events if updated.
    forwardCurrentToHead(analyzer, node);
    debug.dumpState(node, state, false);
}

/**
 * Updates the code path due to the type of a given node in leaving.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function processCodePathToExit(analyzer, node) {
    const codePath = analyzer.codePath;
    const state = CodePath.getState(codePath);
    let dontForward = false;

    switch (node.type) {
        case "ChainExpression":
            state.popChainContext();
            break;

        case "IfStatement":
        case "ConditionalExpression":
            state.popChoiceContext();
            break;

        case "LogicalExpression":
            if (isHandledLogicalOperator(node.operator)) {
                state.popChoiceContext();
            }
            break;

        case "AssignmentExpression":
            if (isLogicalAssignmentOperator(node.operator)) {
                state.popChoiceContext();
            }
            break;

        case "SwitchStatement":
            state.popSwitchContext();
            break;

        case "SwitchCase":
            /*
             * This is the same as the process at the 1st `consequent` node in
             * `preprocess` function.
             * Must do if this `consequent` is empty.
             */
            if (node.consequent.length === 0) {
                state.makeSwitchCaseBody(true, !node.test);
            }
            if (state.forkContext.reachable) {
                dontForward = true;
            }
            break;

        case "TryStatement":
            state.popTryContext();
            break;

        case "BreakStatement":
            forwardCurrentToHead(analyzer, node);
            state.makeBreak(node.label && node.label.name);
            dontForward = true;
            break;

        case "ContinueStatement":
            forwardCurrentToHead(analyzer, node);
            state.makeContinue(node.label && node.label.name);
            dontForward = true;
            break;

        case "ReturnStatement":
            forwardCurrentToHead(analyzer, node);
            state.makeReturn();
            dontForward = true;
            break;

        case "ThrowStatement":
            forwardCurrentToHead(analyzer, node);
            state.makeThrow();
            dontForward = true;
            break;

        case "Identifier":
            if (isIdentifierReference(node)) {
                state.makeFirstThrowablePathInTryBlock();
                dontForward = true;
            }
            break;

        case "CallExpression":
        case "ImportExpression":
        case "MemberExpression":
        case "NewExpression":
        case "YieldExpression":
            state.makeFirstThrowablePathInTryBlock();
            break;

        case "WhileStatement":
        case "DoWhileStatement":
        case "ForStatement":
        case "ForInStatement":
        case "ForOfStatement":
            state.popLoopContext();
            break;

        case "AssignmentPattern":
            state.popForkContext();
            break;

        case "LabeledStatement":
            if (!breakableTypePattern.test(node.body.type)) {
                state.popBreakContext();
            }
            break;

        default:
            break;
    }

    // Emits onCodePathSegmentStart events if updated.
    if (!dontForward) {
        forwardCurrentToHead(analyzer, node);
    }
    debug.dumpState(node, state, true);
}

/**
 * Updates the code path to finalize the current code path.
 * @param {CodePathAnalyzer} analyzer The instance.
 * @param {ASTNode} node The current AST node.
 * @returns {void}
 */
function postprocess(analyzer, node) {
    /**
     * Ends the code path for the current node.
     * @returns {void}
     */
    function endCodePath() {
        let codePath = analyzer.codePath;

        // Mark the current path as the final node.
        CodePath.getState(codePath).makeFinal();

        // Emits onCodePathSegmentEnd event of the current segments.
        leaveFromCurrentSegment(analyzer, node);

        // Emits onCodePathEnd event of this code path.
        debug.dump(`onCodePathEnd ${codePath.id}`);
        analyzer.emit("onCodePathEnd", [codePath, node]);
        debug.dumpDot(codePath);

        codePath = analyzer.codePath.upper;
        analyzer.codePath = codePath;
        if (codePath) {
            debug.dumpState(node, CodePath.getState(codePath), true);
        }
    }

    switch (node.type) {
        case "Program":
        case "FunctionDeclaration":
        case "FunctionExpression":
        case "ArrowFunctionExpression":
        case "StaticBlock": {
            endCodePath();
            break;
        }

        // The `arguments.length >= 1` case is in `preprocess` function.
        case "CallExpression":
            if (node.optional === true && node.arguments.length === 0) {
                CodePath.getState(analyzer.codePath).makeOptionalRight();
            }
            break;

        default:
            break;
    }

    /*
     * Special case: The right side of class field initializer is considered
     * to be its own function, so we need to end a code path in this
     * case.
     *
     * We need to check after the other checks in order to close the
     * code paths in the correct order for code like this:
     *
     *
     * class Foo {
     *     a = () => {}
     * }
     *
     * In this case, The ArrowFunctionExpression code path is closed first
     * and then we need to close the code path for the PropertyDefinition
     * value.
     */
    if (isPropertyDefinitionValue(node)) {
        endCodePath();
    }
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * The class to analyze code paths.
 * This class implements the EventGenerator interface.
 */
class CodePathAnalyzer {
    /**
     * @param {EventGenerator} eventGenerator An event generator to wrap.
     */
    constructor(eventGenerator) {
        this.original = eventGenerator;
        this.emit = eventGenerator.emit;
        this.codePath = null;
        this.idGenerator = new IdGenerator("s");
        this.currentNode = null;
        this.onLooped = this.onLooped.bind(this);
    }

    /**
     * Does the process to enter a given AST node.
     * This updates state of analysis and calls `enterNode` of the wrapped.
     * @param {ASTNode} node A node which is entering.
     * @returns {void}
     */
    enterNode(node) {
        this.currentNode = node;

        // Updates the code path due to node's position in its parent node.
        if (node.parent) {
            preprocess(this, node);
        }

        /*
         * Updates the code path.
         * And emits onCodePathStart/onCodePathSegmentStart events.
         */
        processCodePathToEnter(this, node);

        // Emits node events.
        this.original.enterNode(node);

        this.currentNode = null;
    }

    /**
     * Does the process to leave a given AST node.
     * This updates state of analysis and calls `leaveNode` of the wrapped.
     * @param {ASTNode} node A node which is leaving.
     * @returns {void}
     */
    leaveNode(node) {
        this.currentNode = node;

        /*
         * Updates the code path.
         * And emits onCodePathStart/onCodePathSegmentStart events.
         */
        processCodePathToExit(this, node);

        // Emits node events.
        this.original.leaveNode(node);

        // Emits the last onCodePathStart/onCodePathSegmentStart events.
        postprocess(this, node);

        this.currentNode = null;
    }

    /**
     * This is called on a code path looped.
     * Then this raises a looped event.
     * @param {CodePathSegment} fromSegment A segment of prev.
     * @param {CodePathSegment} toSegment A segment of next.
     * @returns {void}
     */
    onLooped(fromSegment, toSegment) {
        if (fromSegment.reachable && toSegment.reachable) {
            debug.dump(
                `onCodePathSegmentLoop ${fromSegment.id} -> ${toSegment.id}`,
            );
            this.emit("onCodePathSegmentLoop", [
                fromSegment,
                toSegment,
                this.currentNode,
            ]);
        }
    }
}

export { CodePathAnalyzer };
