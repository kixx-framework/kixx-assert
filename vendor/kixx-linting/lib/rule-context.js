/**
 * @module rule-context
 * @description
 * Per-rule execution context passed to rule.create(context).
 * Provides rules with access to the source code, AST, configuration, and a report() method
 * for recording violations.
 */

/**
 * Execution context for a single rule instance.
 *
 * Each rule gets its own RuleContext. The messages array is shared across all rules
 * in a single linting pass, allowing rules to report violations that are later
 * sorted and de-duplicated.
 */
export class RuleContext {
    /**
     * @param {Object} options - Context configuration
     * @param {string} options.id - Rule identifier (e.g., 'no-debugger')
     * @param {number} options.severity - Severity level: 1 (warn) or 2 (error)
     * @param {Array} options.options - Rule option values from configuration (after severity)
     * @param {SourceCode} options.sourceCode - Source code interface (AST, tokens, comments, scope)
     * @param {Object} options.languageOptions - Language-specific options for the parser
     * @param {Array} options.messages - Shared messages array for collecting violations across rules
     */
    constructor({ id, severity, options, sourceCode, languageOptions, messages }) {
        this.id = id;
        this.severity = severity;
        this.options = options;
        this.sourceCode = sourceCode;
        this._messages = messages;
        this.languageOptions = languageOptions;
    }

    /**
     * Marks a variable as used throughout all scopes where it appears.
     *
     * This allows rules (like no-inline-comments) to suppress no-unused-vars violations
     * for specific variables that the rule intends to use. Sets variable.eslintUsed = true
     * on all matching variables.
     *
     * @param {string} name - The variable name to mark as used
     * @returns {boolean} True if any variable was found and marked
     */
    markVariableAsUsed(name) {
        let marked = false;
        for (const scope of this.sourceCode.scopeManager.scopes) {
            const variable = scope.set.get(name);
            if (variable) {
                variable.eslintUsed = true;
                marked = true;
            }
        }
        return marked;
    }

    /**
     * Reports a linting violation.
     *
     * Records a violation that will be included in the final linting results.
     * Location can be determined from a node, explicit loc, or defaults to line 1, column 0.
     * Message can contain {{placeholder}} patterns that are substituted from the data object.
     *
     * @param {Object} descriptor - Report descriptor
     * @param {Object} [descriptor.node] - AST node (used for location if loc not provided)
     * @param {string} descriptor.message - Message string, may contain {{key}} placeholders
     * @param {Object} [descriptor.loc] - Explicit location: {line, column} or {start: {line, column}}
     * @param {Object} [descriptor.data] - Data for {{placeholder}} substitution in message
     */
    report({ node, message, loc, data }) {
        // Resolve location
        let line, column;

        if (loc) {
            // loc can be { line, column } or { start: { line, column } }
            if (loc.start) {
                line = loc.start.line;
                column = loc.start.column;
            } else {
                line = loc.line;
                column = loc.column;
            }
        } else if (node && node.loc) {
            line = node.loc.start.line;
            column = node.loc.start.column;
        } else {
            line = 1;
            column = 0;
        }

        // Apply {{placeholder}} substitutions from data
        let resolvedMessage = message;
        if (data) {
            resolvedMessage = message.replace(/\{\{(\w+)\}\}/g, (_, key) => {
                return Object.prototype.hasOwnProperty.call(data, key)
                    ? String(data[key])
                    : `{{${key}}}`;
            });
        }

        this._messages.push({
            ruleId: this.id,
            severity: this.severity,
            message: resolvedMessage,
            line,
            column,
        });
    }
}

export default RuleContext;
