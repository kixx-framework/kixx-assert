/**
 * @module rule-runner
 * @description
 * Instantiates rules, collects their visitor methods, traverses the AST,
 * and returns sorted violation messages. The main orchestrator of rule execution.
 */

import { RuleContext } from "./rule-context.js";
import { traverse } from "./traverser.js";
import VISITOR_KEYS from "./visitor-keys.js";

/**
 * Executes all configured rules against the source code.
 *
 * Instantiates each rule with a RuleContext, collects all visitor methods,
 * performs AST traversal with those visitors, and returns a sorted array
 * of violation messages. Rules are executed in parallel (all visitors for a node
 * are called before moving to the next node).
 *
 * @param {SourceCode} sourceCode - Source code with AST, tokens, comments, and scope
 * @param {Object} configuredRules - Rule configuration map
 *   (e.g., { 'no-debugger': 'error', 'indent': ['error', 4] })
 * @param {Map<string, Object>} registry - Rule registry (ruleId → rule module)
 * @param {Object} languageOptions - Language-specific parser options
 * @returns {Array<Object>} Messages sorted by line then column
 * @throws {Error} If a configured rule is not found in the registry
 */

export function runRules(sourceCode, configuredRules, registry, languageOptions) {
    const messages = [];

    // Merged visitor map: event name -> array of callbacks
    const visitors = new Map();

    function addVisitor(eventName, callback) {
        if (!visitors.has(eventName)) {
            visitors.set(eventName, []);
        }
        visitors.get(eventName).push(callback);
    }

    for (const [ruleId, ruleConfig] of Object.entries(configuredRules)) {
        const { severity, options } = parseRuleConfig(ruleConfig);

        // Skip disabled rules
        if (severity === 0) continue;

        const rule = registry.get(ruleId);
        if (!rule) {
            throw new Error(
                `Rule '${ruleId}' is not defined in the rule registry. ` +
                `Make sure it has been registered in lib/rules/index.js.`,
            );
        }

        const context = new RuleContext({
            id: ruleId,
            severity,
            options,
            sourceCode,
            languageOptions,
            messages,
        });

        // Call rule.create(context) to get the visitor map for this rule
        const ruleVisitors = rule.create(context);

        if (ruleVisitors && typeof ruleVisitors === "object") {
            for (const [eventName, callback] of Object.entries(ruleVisitors)) {
                if (typeof callback === "function") {
                    addVisitor(eventName, callback);
                }
            }
        }
    }

    // Traverse the AST with all collected visitors
    traverse(sourceCode.ast, VISITOR_KEYS, visitors);

    // Sort messages by line then column
    messages.sort((a, b) => {
        if (a.line !== b.line) return a.line - b.line;
        return a.column - b.column;
    });

    return messages;
}

/**
 * Parses a rule configuration entry into severity and options.
 *
 * Configuration can be a string ('off', 'warn', 'error'), a number (0, 1, 2),
 * or an array where the first element is severity and remaining elements are options.
 * Returns an object with normalized numeric severity (0, 1, or 2) and options array.
 *
 * @private
 * @param {string|number|Array} ruleConfig - Rule configuration value
 * @returns {Object} { severity: number, options: Array }
 * @throws {Error} If severity is not a recognized value
 */
function parseRuleConfig(ruleConfig) {
    if (Array.isArray(ruleConfig)) {
        const [severityRaw, ...options] = ruleConfig;
        return { severity: normalizeSeverity(severityRaw), options };
    }
    return { severity: normalizeSeverity(ruleConfig), options: [] };
}

/**
 * Converts a severity value to a numeric code.
 *
 * Valid inputs: 'off' (→ 0), 'warn' (→ 1), 'error' (→ 2), or numeric 0, 1, 2.
 * Other values raise an error.
 *
 * @private
 * @param {string|number} raw - Severity value to normalize
 * @returns {number} Numeric severity: 0 (off), 1 (warn), or 2 (error)
 * @throws {Error} If the value is not a valid severity
 */
function normalizeSeverity(raw) {
    // Match ESLint config values exactly; other truthy/falsy values are invalid.
    if (raw === "off" || raw === 0) return 0;
    if (raw === "warn" || raw === 1) return 1;
    if (raw === "error" || raw === 2) return 2;
    throw new Error(`Invalid rule severity: ${JSON.stringify(raw)}`);
}

export default runRules;
