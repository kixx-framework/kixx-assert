/**
 * @module referencer
 * @description
 * Main AST traversal visitor that performs scope analysis.
 * Walks the entire AST, creating scopes, tracking variable definitions and references,
 * and resolving references to their definitions.
 */

import Syntax from "./syntax.js";
import { Visitor } from "./visitor.js";
import Reference from "./reference.js";
import Variable from "./variable.js";
import PatternVisitor from "./pattern-visitor.js";
import { Definition, ParameterDefinition } from "./definition.js";
import { assert } from "./assert.js";

/**
 * Traverses a destructuring pattern to extract identifiers and evaluate right-hand expressions.
 * @private
 * @param {Object} options - Visitor options
 * @param {Object} rootPattern - Root pattern node (e.g., ObjectPattern, ArrayPattern)
 * @param {Referencer|null} referencer - Optional referencer for evaluating right-hand expressions
 * @param {function} callback - Callback for each identifier in the pattern
 */
function traverseIdentifierInPattern(options, rootPattern, referencer, callback) {
    const visitor = new PatternVisitor(options, rootPattern, callback);

    visitor.visit(rootPattern);

    if (!referencer) {
        return;
    }

    for (const rightHandNode of visitor.rightHandNodes) {
        referencer.visit(rightHandNode);
    }
}

/**
 * Specialized visitor for processing import statements.
 * Handles namespace imports, default imports, and named imports.
 */
class Importer extends Visitor {
    /**
     * @param {Object} declaration - ImportDeclaration node
     * @param {Referencer} referencer - The main referencer instance
     */
    constructor(declaration, referencer) {
        super(null, referencer.options);
        this.declaration = declaration;
        this.referencer = referencer;
    }

    /**
     * Processes an import specifier and defines the imported binding.
     * @private
     * @param {Object} identifier - Local identifier node
     * @param {Object} specifier - Import specifier node
     */
    visitImport(identifier, specifier) {
        this.referencer.visitPattern(identifier, pattern => {
            this.referencer.currentScope().__define(
                pattern,
                new Definition(
                    Variable.ImportBinding,
                    pattern,
                    specifier,
                    this.declaration,
                    null,
                    null,
                ),
            );
        });
    }

    ImportNamespaceSpecifier(node) {
        const local = node.local || node.id;

        if (local) {
            this.visitImport(local, node);
        }
    }

    ImportDefaultSpecifier(node) {
        const local = node.local || node.id;

        this.visitImport(local, node);
    }

    ImportSpecifier(node) {
        const local = node.local || node.id;

        if (node.name) {
            this.visitImport(node.name, node);
            return;
        }

        this.visitImport(local, node);
    }
}

/**
 * Main AST traversal visitor that performs scope analysis.
 *
 * Visits all AST nodes, creating appropriate scope types, tracking variable
 * definitions, and recording variable references. This is the core engine
 * that drives the scope analysis.
 */
class Referencer extends Visitor {
    /**
     * @param {Object} options - Analysis options
     * @param {ScopeManager} scopeManager - The scope manager instance
     */
    constructor(options, scopeManager) {
        super(null, options);
        this.options = options;
        this.scopeManager = scopeManager;
        this.parent = null;
        this.isInnerMethodDefinition = false;
    }

    /**
     * Retrieves the current active scope.
     * @returns {Scope}
     */
    currentScope() {
        return this.scopeManager.__currentScope;
    }

    /**
     * Closes all scopes that were created by visiting a node.
     * Called when exiting a scope-creating node.
     *
     * @param {Object} node - AST node that may have created scopes
     */
    close(node) {
        while (this.currentScope() && node === this.currentScope().block) {
            this.scopeManager.__currentScope = this.currentScope().__close(this.scopeManager);
        }
    }

    /**
     * Marks the start of processing an inner method definition.
     * @private
     * @param {boolean} isInnerMethodDefinition - Whether this is a method
     * @returns {boolean} Previous value
     */
    pushInnerMethodDefinition(isInnerMethodDefinition) {
        const previous = this.isInnerMethodDefinition;

        this.isInnerMethodDefinition = isInnerMethodDefinition;
        return previous;
    }

    /**
     * Restores the method definition flag.
     * @private
     * @param {boolean} isInnerMethodDefinition - Value to restore
     */
    popInnerMethodDefinition(isInnerMethodDefinition) {
        this.isInnerMethodDefinition = isInnerMethodDefinition;
    }

    /**
     * Records references to the default values of parameters or destructuring assignments.
     * These references are writes to the variable being assigned.
     *
     * @private
     * @param {Object} pattern - Identifier being assigned
     * @param {Object[]} assignments - Assignment expressions with default values
     * @param {Object} [maybeImplicitGlobal] - Potential implicit global info
     * @param {boolean} [init] - Whether this is an initialization
     */
    referencingDefaultValue(pattern, assignments, maybeImplicitGlobal, init) {
        const scope = this.currentScope();

        for (const assignment of assignments) {
            scope.__referencing(
                pattern,
                Reference.WRITE,
                assignment.right,
                maybeImplicitGlobal,
                pattern !== assignment.left,
                init,
            );
        }
    }

    /**
     * Traverses a destructuring pattern to extract variable declarations.
     * Optionally evaluates right-hand side expressions in the current scope context.
     *
     * @param {Object} node - Pattern node (Identifier, ObjectPattern, ArrayPattern)
     * @param {Object|function} [options] - Configuration or callback function
     * @param {boolean} [options.processRightHandNodes=false] - Whether to visit RHS expressions
     * @param {function} callback - Callback for each identifier in pattern
     */
    visitPattern(node, options, callback) {
        let visitPatternOptions = options;
        let visitPatternCallback = callback;

        if (typeof options === "function") {
            visitPatternCallback = options;
            visitPatternOptions = { processRightHandNodes: false };
        }

        traverseIdentifierInPattern(
            this.options,
            node,
            visitPatternOptions.processRightHandNodes ? this : null,
            visitPatternCallback,
        );
    }

    /**
     * Visits a function declaration or expression.
     * Creates a function scope, processes parameters, and visits the function body.
     * Handles function names, default parameters, and rest parameters.
     *
     * @param {Object} node - FunctionDeclaration or FunctionExpression node
     */
    visitFunction(node) {
        if (node.type === Syntax.FunctionDeclaration) {
            this.currentScope().__define(
                node.id,
                new Definition(
                    Variable.FunctionName,
                    node.id,
                    node,
                    null,
                    null,
                    null,
                ),
            );
        }

        if (node.type === Syntax.FunctionExpression && node.id) {
            this.scopeManager.__nestFunctionExpressionNameScope(node);
        }

        this.scopeManager.__nestFunctionScope(node, this.isInnerMethodDefinition);

        for (const [index, param] of node.params.entries()) {
            this.visitPattern(
                param,
                { processRightHandNodes: true },
                (pattern, info) => {
                    this.currentScope().__define(
                        pattern,
                        new ParameterDefinition(pattern, node, index, info.rest),
                    );

                    this.referencingDefaultValue(pattern, info.assignments, null, true);
                },
            );
        }

        if (node.rest) {
            this.visitPattern(
                {
                    type: "RestElement",
                    argument: node.rest,
                },
                pattern => {
                    this.currentScope().__define(
                        pattern,
                        new ParameterDefinition(pattern, node, node.params.length, true),
                    );
                },
            );
        }

        if (node.body) {
            if (node.body.type === Syntax.BlockStatement) {
                this.visitChildren(node.body);
            } else {
                this.visit(node.body);
            }
        }

        this.close(node);
    }

    /**
     * Visits a class declaration or expression.
     * Creates a class scope and processes the class name, superclass, and body.
     * Class names are defined in both the outer scope and the class scope.
     *
     * @param {Object} node - ClassDeclaration or ClassExpression node
     */
    visitClass(node) {
        if (node.type === Syntax.ClassDeclaration) {
            this.currentScope().__define(
                node.id,
                new Definition(
                    Variable.ClassName,
                    node.id,
                    node,
                    null,
                    null,
                    null,
                ),
            );
        }

        this.scopeManager.__nestClassScope(node);

        if (node.id) {
            this.currentScope().__define(
                node.id,
                new Definition(Variable.ClassName, node.id, node),
            );
        }

        this.visit(node.superClass);
        this.visit(node.body);

        this.close(node);
    }

    /**
     * Visits an object property or method definition.
     * Tracks whether we're inside a method definition for proper scope handling.
     *
     * @param {Object} node - Property or MethodDefinition node
     */
    visitProperty(node) {
        if (node.computed) {
            this.visit(node.key);
        }

        const isMethodDefinition = node.type === Syntax.MethodDefinition;
        let previous = false;

        if (isMethodDefinition) {
            previous = this.pushInnerMethodDefinition(true);
        }

        this.visit(node.value);

        if (isMethodDefinition) {
            this.popInnerMethodDefinition(previous);
        }
    }

    /**
     * Visits a for-in or for-of statement.
     * Creates a scope for let/const declarations in the loop variable.
     *
     * @param {Object} node - ForInStatement or ForOfStatement node
     */
    visitForIn(node) {
        if (
            node.left.type === Syntax.VariableDeclaration &&
            node.left.kind !== "var"
        ) {
            this.scopeManager.__nestForScope(node);
        }

        if (node.left.type === Syntax.VariableDeclaration) {
            this.visit(node.left);
            this.visitPattern(node.left.declarations[0].id, pattern => {
                this.currentScope().__referencing(
                    pattern,
                    Reference.WRITE,
                    node.right,
                    null,
                    true,
                    true,
                );
            });
        } else {
            this.visitPattern(
                node.left,
                { processRightHandNodes: true },
                (pattern, info) => {
                    let maybeImplicitGlobal = null;

                    if (!this.currentScope().isStrict) {
                        maybeImplicitGlobal = {
                            pattern,
                            node,
                        };
                    }

                    this.referencingDefaultValue(
                        pattern,
                        info.assignments,
                        maybeImplicitGlobal,
                        false,
                    );
                    this.currentScope().__referencing(
                        pattern,
                        Reference.WRITE,
                        node.right,
                        maybeImplicitGlobal,
                        true,
                        false,
                    );
                },
            );
        }

        this.visit(node.right);
        this.visit(node.body);

        this.close(node);
    }

    visitVariableDeclaration(variableTargetScope, type, node, index) {
        const declaration = node.declarations[index];
        const init = declaration.init;

        this.visitPattern(
            declaration.id,
            { processRightHandNodes: true },
            (pattern, info) => {
                variableTargetScope.__define(
                    pattern,
                    new Definition(type, pattern, declaration, node, index, node.kind),
                );

                this.referencingDefaultValue(pattern, info.assignments, null, true);

                if (init) {
                    this.currentScope().__referencing(
                        pattern,
                        Reference.WRITE,
                        init,
                        null,
                        !info.topLevel,
                        true,
                    );
                }
            },
        );
    }

    AssignmentExpression(node) {
        if (PatternVisitor.isPattern(node.left)) {
            if (node.operator === "=") {
                this.visitPattern(
                    node.left,
                    { processRightHandNodes: true },
                    (pattern, info) => {
                        let maybeImplicitGlobal = null;

                        if (!this.currentScope().isStrict) {
                            maybeImplicitGlobal = {
                                pattern,
                                node,
                            };
                        }

                        this.referencingDefaultValue(
                            pattern,
                            info.assignments,
                            maybeImplicitGlobal,
                            false,
                        );
                        this.currentScope().__referencing(
                            pattern,
                            Reference.WRITE,
                            node.right,
                            maybeImplicitGlobal,
                            !info.topLevel,
                            false,
                        );
                    },
                );
            } else {
                this.currentScope().__referencing(node.left, Reference.RW, node.right);
            }
        } else {
            this.visit(node.left);
        }

        this.visit(node.right);
    }

    CatchClause(node) {
        this.scopeManager.__nestCatchScope(node);

        this.visitPattern(
            node.param,
            { processRightHandNodes: true },
            (pattern, info) => {
                this.currentScope().__define(
                    pattern,
                    new Definition(
                        Variable.CatchClause,
                        pattern,
                        node,
                        null,
                        null,
                        null,
                    ),
                );
                this.referencingDefaultValue(pattern, info.assignments, null, true);
            },
        );

        this.visit(node.body);
        this.close(node);
    }

    Program(node) {
        this.scopeManager.__nestGlobalScope(node);

        if (this.scopeManager.isGlobalReturn()) {
            this.currentScope().isStrict = false;
            this.scopeManager.__nestFunctionScope(node, false);
        }

        if (this.scopeManager.__isES6() && this.scopeManager.isModule()) {
            this.scopeManager.__nestModuleScope(node);
        }

        if (
            this.scopeManager.isStrictModeSupported() &&
            this.scopeManager.isImpliedStrict()
        ) {
            this.currentScope().isStrict = true;
        }

        this.visitChildren(node);
        this.close(node);
    }

    Identifier(node) {
        this.currentScope().__referencing(node);
    }


    PrivateIdentifier() {}

    UpdateExpression(node) {
        if (PatternVisitor.isPattern(node.argument)) {
            this.currentScope().__referencing(node.argument, Reference.RW, null);
            return;
        }

        this.visitChildren(node);
    }

    MemberExpression(node) {
        this.visit(node.object);

        if (node.computed) {
            this.visit(node.property);
        }
    }

    Property(node) {
        this.visitProperty(node);
    }

    PropertyDefinition(node) {
        const { computed, key, value } = node;

        if (computed) {
            this.visit(key);
        }

        if (value) {
            this.scopeManager.__nestClassFieldInitializerScope(value);
            this.visit(value);
            this.close(value);
        }
    }

    StaticBlock(node) {
        this.scopeManager.__nestClassStaticBlockScope(node);
        this.visitChildren(node);
        this.close(node);
    }

    MethodDefinition(node) {
        this.visitProperty(node);
    }


    BreakStatement() {}


    ContinueStatement() {}

    LabeledStatement(node) {
        this.visit(node.body);
    }

    ForStatement(node) {
        if (
            node.init &&
            node.init.type === Syntax.VariableDeclaration &&
            node.init.kind !== "var"
        ) {
            this.scopeManager.__nestForScope(node);
        }

        this.visitChildren(node);
        this.close(node);
    }

    ClassExpression(node) {
        this.visitClass(node);
    }

    ClassDeclaration(node) {
        this.visitClass(node);
    }

    CallExpression(node) {
        if (
            !this.scopeManager.__ignoreEval() &&
            node.callee.type === Syntax.Identifier &&
            node.callee.name === "eval"
        ) {
            this.currentScope().variableScope.__detectEval();
        }

        this.visitChildren(node);
    }

    BlockStatement(node) {
        if (this.scopeManager.__isES6()) {
            this.scopeManager.__nestBlockScope(node);
        }

        this.visitChildren(node);
        this.close(node);
    }

    ThisExpression() {
        this.currentScope().variableScope.__detectThis();
    }

    WithStatement(node) {
        this.visit(node.object);
        this.scopeManager.__nestWithScope(node);
        this.visit(node.body);
        this.close(node);
    }

    VariableDeclaration(node) {
        const variableTargetScope = node.kind === "var" ?
            this.currentScope().variableScope :
            this.currentScope();

        for (const [index, declaration] of node.declarations.entries()) {
            this.visitVariableDeclaration(
                variableTargetScope,
                Variable.Variable,
                node,
                index,
            );

            if (declaration.init) {
                this.visit(declaration.init);
            }
        }
    }

    SwitchStatement(node) {
        this.visit(node.discriminant);

        if (this.scopeManager.__isES6()) {
            this.scopeManager.__nestSwitchScope(node);
        }

        for (const switchCase of node.cases) {
            this.visit(switchCase);
        }

        this.close(node);
    }

    FunctionDeclaration(node) {
        this.visitFunction(node);
    }

    FunctionExpression(node) {
        this.visitFunction(node);
    }

    ForOfStatement(node) {
        this.visitForIn(node);
    }

    ForInStatement(node) {
        this.visitForIn(node);
    }

    ArrowFunctionExpression(node) {
        this.visitFunction(node);
    }

    ImportDeclaration(node) {
        assert(
            this.scopeManager.__isES6() && this.scopeManager.isModule(),
            "ImportDeclaration should appear when the mode is ES6 and in the module context.",
        );

        const importer = new Importer(node, this);

        importer.visit(node);
    }

    visitExportDeclaration(node) {
        if (node.source) {
            return;
        }

        if (node.declaration) {
            this.visit(node.declaration);
            return;
        }

        this.visitChildren(node);
    }

    ExportDeclaration(node) {
        this.visitExportDeclaration(node);
    }

    ExportAllDeclaration(node) {
        this.visitExportDeclaration(node);
    }

    ExportDefaultDeclaration(node) {
        this.visitExportDeclaration(node);
    }

    ExportNamedDeclaration(node) {
        this.visitExportDeclaration(node);
    }

    ExportSpecifier(node) {
        const local = node.id || node.local;

        this.visit(local);
    }


    MetaProperty() {}

    JSXIdentifier(node) {
        if (this.scopeManager.__isJSXEnabled() && node.name !== "this") {
            this.currentScope().__referencing(node);
        }
    }

    JSXMemberExpression(node) {
        this.visit(node.object);
    }

    JSXElement(node) {
        if (this.scopeManager.__isJSXEnabled()) {
            this.visit(node.openingElement);

            for (const child of node.children) {
                this.visit(child);
            }
            return;
        }

        this.visitChildren(node);
    }

    JSXOpeningElement(node) {
        if (this.scopeManager.__isJSXEnabled()) {
            const nameNode = node.name;
            const isComponentName = (
                nameNode.type === "JSXIdentifier" &&
                nameNode.name[0].toUpperCase() === nameNode.name[0]
            );
            const isComponent = isComponentName || nameNode.type === "JSXMemberExpression";

            if (isComponent) {
                this.visit(nameNode);
            }
        }

        for (const attribute of node.attributes) {
            this.visit(attribute);
        }
    }

    JSXAttribute(node) {
        if (node.value) {
            this.visit(node.value);
        }
    }

    JSXExpressionContainer(node) {
        this.visit(node.expression);
    }

    JSXNamespacedName(node) {
        this.visit(node.namespace);
        this.visit(node.name);
    }
}

export default Referencer;
