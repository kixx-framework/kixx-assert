/**
 * @module visitor-keys
 * @description
 * Defines which properties of each AST node type contain child nodes.
 * Used by visitors to traverse the AST without speculating about structure.
 * Maps node types to arrays of property names that contain child nodes.
 */

/**
 * Deeply freezes an object mapping node types to their child keys.
 * Ensures immutability of the visitor keys structure.
 *
 * @private
 * @param {Object} rawVisitorKeys - Mutable visitor keys object
 * @returns {Object} Frozen visitor keys object
 */
function freezeVisitorKeys(rawVisitorKeys) {
    const frozenVisitorKeys = {};

    for (const [nodeType, keys] of Object.entries(rawVisitorKeys)) {
        frozenVisitorKeys[nodeType] = Object.freeze([...keys]);
    }

    return Object.freeze(frozenVisitorKeys);
}

/**
 * Maps AST node types to arrays of child node property keys.
 * For each node type, lists which properties contain child nodes that should be visited.
 * Properties not listed are assumed to be leaf values (identifiers, literals, etc.).
 * @type {Object}
 * @readonly
 */
const VISITOR_KEYS = freezeVisitorKeys({
    AssignmentExpression: ["left", "right"],
    AssignmentPattern: ["left", "right"],
    ArrayExpression: ["elements"],
    ArrayPattern: ["elements"],
    ArrowFunctionExpression: ["params", "body"],
    AwaitExpression: ["argument"],
    BinaryExpression: ["left", "right"],
    BlockStatement: ["body"],
    BreakStatement: ["label"],
    CallExpression: ["callee", "arguments"],
    CatchClause: ["param", "body"],
    ChainExpression: ["expression"],
    ClassBody: ["body"],
    ClassDeclaration: ["id", "superClass", "body"],
    ClassExpression: ["id", "superClass", "body"],
    ComprehensionBlock: ["left", "right"],
    ComprehensionExpression: ["blocks", "filter", "body"],
    ConditionalExpression: ["test", "consequent", "alternate"],
    ContinueStatement: ["label"],
    DebuggerStatement: [],
    DirectiveStatement: [],
    DoWhileStatement: ["body", "test"],
    EmptyStatement: [],
    ExportAllDeclaration: ["exported", "source"],
    ExportDefaultDeclaration: ["declaration"],
    ExportNamedDeclaration: ["declaration", "specifiers", "source"],
    ExportSpecifier: ["exported", "local"],
    ExpressionStatement: ["expression"],
    ForInStatement: ["left", "right", "body"],
    ForOfStatement: ["left", "right", "body"],
    ForStatement: ["init", "test", "update", "body"],
    FunctionDeclaration: ["id", "params", "body"],
    FunctionExpression: ["id", "params", "body"],
    GeneratorExpression: ["blocks", "filter", "body"],
    Identifier: [],
    IfStatement: ["test", "consequent", "alternate"],
    ImportDeclaration: ["specifiers", "source"],
    ImportDefaultSpecifier: ["local"],
    ImportExpression: ["source"],
    ImportNamespaceSpecifier: ["local"],
    ImportSpecifier: ["imported", "local"],
    LabeledStatement: ["label", "body"],
    Literal: [],
    LogicalExpression: ["left", "right"],
    MemberExpression: ["object", "property"],
    MetaProperty: ["meta", "property"],
    MethodDefinition: ["key", "value"],
    ModuleSpecifier: [],
    NewExpression: ["callee", "arguments"],
    ObjectExpression: ["properties"],
    ObjectPattern: ["properties"],
    PrivateIdentifier: [],
    Program: ["body"],
    Property: ["key", "value"],
    PropertyDefinition: ["key", "value"],
    RestElement: ["argument"],
    ReturnStatement: ["argument"],
    SequenceExpression: ["expressions"],
    SpreadElement: ["argument"],
    StaticBlock: ["body"],
    Super: [],
    SwitchCase: ["test", "consequent"],
    SwitchStatement: ["discriminant", "cases"],
    TaggedTemplateExpression: ["tag", "quasi"],
    TemplateElement: [],
    TemplateLiteral: ["quasis", "expressions"],
    ThisExpression: [],
    ThrowStatement: ["argument"],
    TryStatement: ["block", "handler", "finalizer"],
    UnaryExpression: ["argument"],
    UpdateExpression: ["argument"],
    VariableDeclaration: ["declarations"],
    VariableDeclarator: ["id", "init"],
    WhileStatement: ["test", "body"],
    WithStatement: ["object", "body"],
    YieldExpression: ["argument"],
});

/**
 * Merges custom visitor keys with the default visitor keys.
 * Allows callers to override or extend the default behavior for specific node types.
 *
 * @param {Object} [childVisitorKeys] - Custom visitor keys to merge with defaults
 * @returns {Object} Merged visitor keys, with custom keys taking precedence
 */
export function mergeVisitorKeys(childVisitorKeys) {
    if (!childVisitorKeys) {
        return VISITOR_KEYS;
    }

    return {
        ...VISITOR_KEYS,
        ...childVisitorKeys,
    };
}

export default VISITOR_KEYS;
