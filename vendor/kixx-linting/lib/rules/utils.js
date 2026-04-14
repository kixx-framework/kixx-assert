/**
 * Shared AST, scope, and global-reference helpers used by rule modules.
 */

/**
 * Gets a static property name from a member expression when it can be resolved without execution.
 * @param {ASTNode} node Member expression to inspect.
 * @returns {string|null} The property name, or `null` if it cannot be determined statically.
 */
export function getMemberStaticPropertyName(node) {
    if (node.type !== "MemberExpression") {
        return null;
    }

    if (!node.computed && node.property.type === "Identifier") {
        return node.property.name;
    }

    if (node.computed && node.property.type === "Literal" && typeof node.property.value === "string") {
        return node.property.value;
    }

    if (
        node.computed &&
        node.property.type === "TemplateLiteral" &&
        node.property.expressions.length === 0
    ) {
        return node.property.quasis[0]?.value?.cooked ?? null;
    }

    return null;
}

/**
 * Gets a property key name from an object or class property node.
 * @param {ASTNode} node Property-like node to inspect.
 * @param {Object} [options={}] Lookup options.
 * @param {boolean} [options.allowIdentifier=true] Whether identifiers are accepted as static keys.
 * @returns {string|null} The property name, or `null` if it cannot be determined.
 */
export function getStaticPropertyKeyName(node, { allowIdentifier = true } = {}) {
    if (!node) return null;

    if (allowIdentifier && node.type === "Identifier") {
        return node.name;
    }

    if (node.type === "Literal") {
        return String(node.value);
    }

    if (
        node.type === "TemplateLiteral" &&
        node.expressions.length === 0 &&
        node.quasis.length === 1
    ) {
        return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
    }

    return null;
}

/**
 * Gets the key name for a property definition, method, or shorthand property.
 * @param {ASTNode} node Property-like node to inspect.
 * @returns {string|null} The property key name, or `null` for private or dynamic keys.
 */
export function getPropertyKeyName(node) {
    if (!node?.key || node.key.type === "PrivateIdentifier") {
        return null;
    }

    if (!node.computed && node.key.type === "Identifier") {
        return node.key.name;
    }

    return getStaticPropertyKeyName(node.key, { allowIdentifier: false });
}

/**
 * Checks whether a node is a function-like AST node.
 * @param {ASTNode} node Node to check.
 * @returns {boolean} `true` when the node is a function declaration, expression, or arrow function.
 */
export function isFunctionLike(node) {
    return (
        node?.type === "FunctionDeclaration" ||
        node?.type === "FunctionExpression" ||
        node?.type === "ArrowFunctionExpression"
    );
}

/**
 * Checks whether a node is fully contained within a scope's block range.
 * @param {Scope} scope Scope to inspect.
 * @param {ASTNode} node Node to check.
 * @returns {boolean} `true` when the node lies inside the scope block.
 */
export function isNodeInScopeBlock(scope, node) {
    const block = scope.block;
    if (!block) {
        return false;
    }

    return block.start <= node.start && block.end >= node.end;
}

/**
 * Checks whether a name is shadowed by a local definition in the scopes covering the node.
 * @param {SourceCode} sourceCode Source-code object used to inspect scopes.
 * @param {ASTNode} node Node whose containing scopes are searched.
 * @param {string} name Variable name to look up.
 * @param {Object} [options={}] Lookup options.
 * @param {boolean} [options.includeGlobal=true] Whether the global scope counts as shadowing.
 * @returns {boolean} `true` when a local definition shadows the name.
 */
export function hasShadowingDefinition(sourceCode, node, name, { includeGlobal = true } = {}) {
    return sourceCode.scopeManager.scopes.some(scope =>
        isNodeInScopeBlock(scope, node) &&
        (includeGlobal || scope.type !== "global") &&
        scope.variables.some(variable => variable.name === name && variable.defs.length > 0),
    );
}

/**
 * Gets the configured globals map from the current language options.
 * @param {Context} context Rule context.
 * @returns {Record<string, string>} Configured globals map.
 */
export function getConfiguredGlobals(context) {
    return context.languageOptions?.globals
        ?? context.languageOptions?.languageOptions?.globals
        ?? {};
}

/**
 * Checks whether a global name has been disabled by configuration or directive comments.
 * @param {Context} context Rule context.
 * @param {string} name Global name to inspect.
 * @returns {boolean} `true` when the global is disabled.
 */
export function isDisabledGlobal(context, name) {
    const configuredGlobals = getConfiguredGlobals(context);

    if (configuredGlobals[name] === "off") {
        return true;
    }

    return context.sourceCode.getCommentGlobals().get(name) === "off";
}

/**
 * Checks whether a reference points to an enabled global binding.
 * @param {Context} context Rule context.
 * @param {ASTNode} referenceNode Node used for scope resolution.
 * @param {string} name Global name to inspect.
 * @param {Object} [options] Shadowing options forwarded to `hasShadowingDefinition()`.
 * @returns {boolean} `true` when the reference is allowed and not shadowed.
 */
export function isEnabledGlobalReference(context, referenceNode, name, options) {
    if (hasShadowingDefinition(context.sourceCode, referenceNode, name, options)) {
        return false;
    }

    return !isDisabledGlobal(context, name);
}

/**
 * Gets the implicit `arguments` variable for a scope when it is not shadowed by a declared binding.
 * @param {Scope} scope Scope to inspect.
 * @returns {Variable|null} The implicit `arguments` variable, or `null` if it is shadowed or absent.
 */
export function getImplicitArgumentsVariable(scope) {
    for (const variable of scope.variables) {
        if (variable.name === "arguments") {
            return variable.identifiers.length === 0 ? variable : null;
        }
    }

    return null;
}

/**
 * Gets a variable by name from the outermost scope that contains it.
 * @param {Scope} scope Scope to inspect.
 * @param {string} name Variable name to find.
 * @returns {Variable|null} The matching variable, or `null` if none is defined.
 */
export function getGlobalVariable(scope, name) {
    let current = scope;

    while (current?.upper) {
        current = current.upper;
    }

    return current?.variables.find(variable => variable.name === name) ?? null;
}
