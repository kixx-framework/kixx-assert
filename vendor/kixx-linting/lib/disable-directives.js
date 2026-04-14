/**
 * @module disable-directives
 * @description
 * Parses and collects ESLint disable/enable directives from source comments.
 * Supports line-based directives (eslint-disable-line, eslint-disable-next-line)
 * and range directives (eslint-disable, eslint-enable) to suppress specific rules.
 */

/**
 * Configuration for single-line disable directives.
 * @type {Array<{prefix: string, getTargetLine: function}>}
 * @private
 */
const DIRECTIVE_PREFIXES = [
    { prefix: "eslint-disable-line", getTargetLine: getSameLineTarget },
    { prefix: "eslint-disable-next-line", getTargetLine: getNextLineTarget },
];

/**
 * Configuration for range-based (block) disable directives.
 * @type {Array<{prefix: string, type: string}>}
 * @private
 */
const RANGE_DIRECTIVE_PREFIXES = [
    { prefix: "eslint-disable", type: "disable" },
    { prefix: "eslint-enable", type: "enable" },
];

/**
 * Parses all disable/enable directives from comments in the source code.
 * Separates line-based directives (single line suppressions) from range directives
 * (multi-line suppressions using disable/enable blocks).
 *
 * @param {SourceCode} sourceCode - Source code object with comments
 * @returns {DisableDirectives} Collection of parsed directives indexed for fast lookup
 */
export function collectDisableDirectives(sourceCode) {
    const lineDirectiveIndex = new Map();
    const rangeDirectives = [];
    const comments = sourceCode.getAllComments();

    for (const comment of comments) {
        const lineDirective = parseLineDisableDirective(comment);

        if (lineDirective && lineDirective.ruleIds.length > 0) {
            const targetLine = lineDirective.getTargetLine(comment);
            let ruleIds = lineDirectiveIndex.get(targetLine);

            if (!ruleIds) {
                ruleIds = new Set();
                lineDirectiveIndex.set(targetLine, ruleIds);
            }

            for (const ruleId of lineDirective.ruleIds) {
                ruleIds.add(ruleId);
            }
        }

        const rangeDirective = parseRangeDisableDirective(comment);

        if (rangeDirective) {
            rangeDirectives.push(rangeDirective);
        }
    }

    return new DisableDirectives(lineDirectiveIndex, rangeDirectives);
}

/**
 * Collection of parsed disable directives, indexed for efficient suppression lookup.
 *
 * Maintains both line-based directives (for fast lookup by line number) and
 * range directives (for checking if a message falls within a disable range).
 */
export class DisableDirectives {
    /**
     * @param {Map<number, Set<string>>} lineDirectiveIndex - Maps line numbers to suppressed rule IDs
     * @param {Array<Object>} rangeDirectives - Array of disable/enable range directives
     */
    constructor(lineDirectiveIndex, rangeDirectives) {
        this._lineDirectiveIndex = lineDirectiveIndex;
        this._rangeDirectives = rangeDirectives;
    }

    /**
     * Returns an iterator over line directive entries.
     * @returns {Iterator}
     */
    entries() {
        return this._lineDirectiveIndex.entries();
    }

    /**
     * Makes the object iterable over line directives.
     * @returns {Iterator}
     */
    [Symbol.iterator]() {
        return this.entries();
    }

    /**
     * Determines if a linting message should be suppressed by disable directives.
     *
     * Checks both line-based directives (eslint-disable-line, eslint-disable-next-line)
     * and range directives (eslint-disable/eslint-enable blocks) to determine if the
     * message's rule is suppressed at its line and column.
     *
     * @param {Object} message - Linting message object
     * @param {string} message.ruleId - The rule identifier
     * @param {number} message.line - Message line number (1-based)
     * @param {number} [message.column] - Message column number (0-based, optional)
     * @returns {boolean} True if the message should be suppressed
     */
    isSuppressed(message) {
        if (!message.ruleId) {
            return false;
        }

        const suppressedRuleIds = this._lineDirectiveIndex.get(message.line);

        if (suppressedRuleIds && suppressedRuleIds.has(message.ruleId)) {
            return true;
        }

        return isSuppressedByRangeDirectives(message, this._rangeDirectives);
    }

}

/**
 * Parses a line-based disable directive from a comment.
 * Matches eslint-disable-line and eslint-disable-next-line patterns.
 *
 * @private
 * @param {Object} comment - Comment node
 * @returns {Object|null} Directive info with getTargetLine and ruleIds, or null if not a line directive
 */
function parseLineDisableDirective(comment) {
    const normalizedValue = comment.value.trim();

    for (const { prefix, getTargetLine } of DIRECTIVE_PREFIXES) {
        if (!normalizedValue.startsWith(prefix)) {
            continue;
        }

        const ruleText = normalizedValue.slice(prefix.length).trim();

        return {
            getTargetLine,
            ruleIds: parseRuleIds(ruleText),
        };
    }

    return null;
}

/**
 * Parses a range-based disable directive from a comment.
 * Matches eslint-disable and eslint-enable patterns (block comments only).
 *
 * @private
 * @param {Object} comment - Comment node
 * @returns {Object|null} Directive info with type, ruleIds, position; or null if not a range directive
 */
function parseRangeDisableDirective(comment) {
    if (comment.type !== "Block") {
        return null;
    }

    const normalizedValue = comment.value.trim();

    for (const { prefix, type } of RANGE_DIRECTIVE_PREFIXES) {
        if (!isRangeDirectiveMatch(normalizedValue, prefix)) {
            continue;
        }

        const ruleText = normalizedValue.slice(prefix.length).trim();
        const ruleIds = parseRuleIds(ruleText);

        return {
            type,
            ruleIds: ruleIds.length > 0 ? ruleIds : null,
            line: comment.loc.end.line,
            column: comment.loc.end.column + 1,
            index: comment.end,
        };
    }

    return null;
}

/**
 * Checks if a string starts with a directive prefix with proper word boundary.
 * Ensures the directive is followed by whitespace or end-of-string.
 *
 * @private
 * @param {string} normalizedValue - The comment value to check
 * @param {string} prefix - The directive prefix to match
 * @returns {boolean}
 */
function isRangeDirectiveMatch(normalizedValue, prefix) {
    if (!normalizedValue.startsWith(prefix)) {
        return false;
    }

    const nextCharacter = normalizedValue[prefix.length];

    return nextCharacter === undefined || /\s/u.test(nextCharacter);
}

/**
 * Extracts rule IDs from the text following a disable directive.
 * Handles comma-separated list of rule IDs, deduplicating and trimming whitespace.
 * If no rule IDs are specified, all rules are assumed to be targeted.
 *
 * @private
 * @param {string} ruleText - The text containing rule IDs after the directive
 * @returns {string[]} Array of rule IDs to suppress
 */
function parseRuleIds(ruleText) {
    if (!ruleText) {
        return [];
    }

    const seen = new Set();
    const ruleIds = [];

    for (const segment of ruleText.split(",")) {
        const normalizedSegment = segment.trim();

        if (!normalizedSegment) {
            continue;
        }

        const match = normalizedSegment.match(/^[^\s,]+/u);
        const ruleId = match ? match[0] : "";

        if (!ruleId || seen.has(ruleId)) {
            continue;
        }

        seen.add(ruleId);
        ruleIds.push(ruleId);
    }

    return ruleIds;
}

/**
 * Checks if a message is suppressed by range directives (disable/enable blocks).
 * Processes directives in order, maintaining state for which rules are currently disabled.
 * Directives must appear before the message's line and column to suppress it.
 *
 * @private
 * @param {Object} message - Linting message with ruleId, line, and optional column
 * @param {Array<Object>} rangeDirectives - Sorted array of disable/enable directives
 * @returns {boolean} True if the message is suppressed by range directives
 */
function isSuppressedByRangeDirectives(message, rangeDirectives) {
    let allRulesDisabled = false;
    const disabledRuleIds = new Set();

    for (const directive of rangeDirectives) {
        if (!isDirectiveBeforeMessage(directive, message)) {
            break;
        }

        if (directive.type === "disable") {
            if (directive.ruleIds) {
                for (const ruleId of directive.ruleIds) {
                    disabledRuleIds.add(ruleId);
                }
            } else {
                allRulesDisabled = true;
            }
        } else if (directive.ruleIds) {
            for (const ruleId of directive.ruleIds) {
                disabledRuleIds.delete(ruleId);
            }
        } else {
            allRulesDisabled = false;
            disabledRuleIds.clear();
        }
    }

    return allRulesDisabled || disabledRuleIds.has(message.ruleId);
}

/**
 * Checks if a directive appears before a message in the source code.
 * Compares by line, then by column if on the same line.
 *
 * @private
 * @param {Object} directive - Directive with line and column position
 * @param {Object} message - Message with line and optional column
 * @returns {boolean} True if the directive appears before the message
 */
function isDirectiveBeforeMessage(directive, message) {
    const messageColumn = message.column ?? 1;

    if (directive.line < message.line) {
        return true;
    }

    return directive.line === message.line && directive.column < messageColumn;
}

/**
 * Returns the line number where an eslint-disable-line directive applies.
 * The directive suppresses the same line as the comment.
 *
 * @private
 * @param {Object} comment - Comment node
 * @returns {number} The line number to apply the directive to
 */
function getSameLineTarget(comment) {
    return comment.loc.end.line;
}

/**
 * Returns the line number where an eslint-disable-next-line directive applies.
 * The directive suppresses the line after the comment.
 *
 * @private
 * @param {Object} comment - Comment node
 * @returns {number} The line number to apply the directive to
 */
function getNextLineTarget(comment) {
    return comment.loc.end.line + 1;
}

export default collectDisableDirectives;
