/**
 * @module source-code
 * @description
 * Unified interface to the source code, AST, tokens, comments, and scope information.
 * Provides rule-friendly query methods for accessing tokens, comments, and AST information
 * with support for filtering, line-based lookups, and scope queries.
 */

import { collectDisableDirectives } from "./disable-directives.js";

/**
 * Unified access to source code, AST, tokens, comments, and scope information.
 *
 * Constructed from parsing results and scope analysis. Provides convenient methods
 * for querying tokens by position/range, searching comments, navigating the AST,
 * and determining scope containment. Internally maintains sorted arrays and an
 * index of line offsets for efficient O(1) position calculations.
 */
export class SourceCode {
    constructor({ text, ast, tokens, comments, scopeManager, visitorKeys }) {
        this.text = text;
        this.ast = ast;
        this.scopeManager = scopeManager;
        this.visitorKeys = visitorKeys;

        // Build sorted array of all tokens (no comments) for lookups
        this._tokensSorted = tokens.slice().sort((a, b) => a.start - b.start);

        // Build sorted array of comments for lookups
        this._commentsSorted = comments.slice().sort((a, b) => a.start - b.start);
        this._disableDirectives = collectDisableDirectives(this);
        this._commentGlobals = null;

        // Build a combined sorted array for includeComments queries
        this._allTokensSorted = [...tokens, ...comments]
            .sort((a, b) => a.start - b.start);

        // Build line-start offset index for O(1) line/column lookups
        // _lineOffsets[i] is the character offset of the start of line i+1
        this._lineOffsets = [0];
        let i = 0;
        while (i < text.length) {
            const character = text[i];
            i += 1;

            if (character === '\n') {
                this._lineOffsets.push(i);
            }
        }

        // Cache lines array (lazy)
        this._lines = null;
    }

    /**
     * Get source text, optionally sliced to a node's range.
     */
    getText(node) {
        if (!node) return this.text;
        return this.text.slice(node.start, node.end);
    }

    /**
     * Get all source lines as an array of strings (without newline characters).
     */
    getLines() {
        if (!this._lines) {
            this._lines = this.text.split('\n');
        }
        return this._lines;
    }

    /**
     * Get source lines as an array (alias for getLines(), for compatibility).
     */
    get lines() {
        return this.getLines();
    }

    /**
     * Get all tokens within the range of a node.
     * Options: { includeComments: boolean }
     */
    getTokens(node, options = {}) {
        const list = options.includeComments ? this._allTokensSorted : this._tokensSorted;
        return _filterByRange(list, node.start, node.end);
    }

    /**
     * Get the first token within a node's range.
     * Options: number (skip), function (filter), or { skip, filter, includeComments }
     */
    getFirstToken(node, rawOptions) {
        const { skip, filter, includeComments } = _normalizeOptions(rawOptions);
        const list = includeComments ? this._allTokensSorted : this._tokensSorted;
        const start = node.start;
        const end = node.end;
        const tokens = _filterByRange(list, start, end);
        let skipped = 0;
        for (const token of tokens) {
            if (filter && !filter(token)) continue;
            if (skipped < skip) {
                skipped += 1;
                continue;
            }
            return token;
        }
        return null;
    }

    /**
     * Get the last token within a node's range.
     * Options: number (skip), function (filter), or { skip, filter, includeComments }
     */
    getLastToken(node, rawOptions) {
        const { skip, filter, includeComments } = _normalizeOptions(rawOptions);
        const list = includeComments ? this._allTokensSorted : this._tokensSorted;
        const start = node.start;
        const end = node.end;
        const tokens = _filterByRange(list, start, end);
        let skipped = 0;
        let i = tokens.length - 1;
        while (i >= 0) {
            const token = tokens[i];
            i -= 1;

            if (filter && !filter(token)) continue;
            if (skipped < skip) {
                skipped += 1;
                continue;
            }
            return token;
        }
        return null;
    }

    /**
     * Get the token immediately before a node (or token).
     * Options: number (skip), function (filter), or { skip, filter, includeComments }
     */
    getTokenBefore(nodeOrToken, rawOptions) {
        const { skip, filter, includeComments } = _normalizeOptions(rawOptions);
        const list = includeComments ? this._allTokensSorted : this._tokensSorted;
        const start = nodeOrToken.start;
        let skipped = 0;
        let i = list.length - 1;
        while (i >= 0) {
            const token = list[i];
            i -= 1;

            if (token.end > start) continue;
            if (filter && !filter(token)) continue;
            if (skipped < skip) {
                skipped += 1;
                continue;
            }
            return token;
        }
        return null;
    }

    /**
     * Get the token immediately after a node (or token).
     * Options: number (skip), function (filter), or { skip, filter, includeComments }
     */
    getTokenAfter(nodeOrToken, rawOptions) {
        const { skip, filter, includeComments } = _normalizeOptions(rawOptions);
        const list = includeComments ? this._allTokensSorted : this._tokensSorted;
        const end = nodeOrToken.end;
        let skipped = 0;
        let i = 0;
        while (i < list.length) {
            const token = list[i];
            i += 1;

            if (token.start < end) continue;
            if (filter && !filter(token)) continue;
            if (skipped < skip) {
                skipped += 1;
                continue;
            }
            return token;
        }
        return null;
    }

    /**
     * Get the first token between two nodes/tokens (exclusive).
     * Options: number (skip), function (filter), or { skip, filter, includeComments }
     */
    getFirstTokenBetween(left, right, rawOptions) {
        const { skip, filter, includeComments } = _normalizeOptions(rawOptions);
        const list = includeComments ? this._allTokensSorted : this._tokensSorted;
        const start = left.end;
        const end = right.start;
        const tokens = _filterByRange(list, start, end);
        let skipped = 0;
        for (const token of tokens) {
            if (token.start < start) continue;
            if (filter && !filter(token)) continue;
            if (skipped < skip) {
                skipped += 1;
                continue;
            }
            return token;
        }
        return null;
    }

    /**
     * Get the last token between two nodes/tokens (exclusive).
     * Options: number (skip), function (filter), or { skip, filter, includeComments }
     */
    getLastTokenBetween(left, right, rawOptions) {
        const { skip, filter, includeComments } = _normalizeOptions(rawOptions);
        const list = includeComments ? this._allTokensSorted : this._tokensSorted;
        const start = left.end;
        const end = right.start;
        const tokens = _filterByRange(list, start, end);
        let skipped = 0;
        let i = tokens.length - 1;
        while (i >= 0) {
            const token = tokens[i];
            i -= 1;

            if (token.end > end) continue;
            if (filter && !filter(token)) continue;
            if (skipped < skip) {
                skipped += 1;
                continue;
            }
            return token;
        }
        return null;
    }

    /**
     * Get the first N tokens within a node's range.
     * Options: number (count), function (filter), or { count, filter, includeComments }
     */
    getFirstTokens(node, rawOptions) {
        const { count, filter, includeComments } = _normalizeCountOptions(rawOptions);
        const list = includeComments ? this._allTokensSorted : this._tokensSorted;
        const start = node.start;
        const end = node.end;
        const tokens = _filterByRange(list, start, end);
        const result = [];
        for (const token of tokens) {
            if (result.length >= count) break;
            if (filter && !filter(token)) continue;
            result.push(token);
        }
        return result;
    }

    /**
     * Get the last N tokens within a node's range.
     * Options: number (count), function (filter), or { count, filter, includeComments }
     */
    getLastTokens(node, rawOptions) {
        const { count, filter, includeComments } = _normalizeCountOptions(rawOptions);
        const list = includeComments ? this._allTokensSorted : this._tokensSorted;
        const start = node.start;
        const end = node.end;
        const tokens = _filterByRange(list, start, end);
        const result = [];
        let i = tokens.length - 1;
        while (i >= 0) {
            const token = tokens[i];
            i -= 1;

            if (result.length >= count) break;
            if (filter && !filter(token)) continue;
            result.unshift(token);
        }
        return result;
    }

    /**
     * Get all tokens between two nodes (exclusive of both nodes' ranges).
     * Options: { includeComments: boolean }
     */
    getTokensBetween(nodeA, nodeB, options = {}) {
        const list = options.includeComments ? this._allTokensSorted : this._tokensSorted;
        const start = nodeA.end;
        const end = nodeB.start;
        return _filterByRange(list, start, end);
    }

    /**
     * Check whether there is any whitespace between two adjacent tokens.
     */
    isSpaceBetween(tokenA, tokenB) {
        const a = tokenA.end;
        const b = tokenB.start;
        const textBetween = this.text.slice(a, b);
        return /\s/u.test(textBetween);
    }

    /**
     * Check whether any comments exist between two nodes/tokens.
     */
    commentsExistBetween(left, right) {
        const start = left.end;
        const end = right.start;
        return _filterByRange(this._commentsSorted, start, end).length > 0;
    }

    /**
     * Get all comments in the source file.
     */
    getAllComments() {
        return this._commentsSorted;
    }

    /**
     * Get disable-directive suppression metadata.
     */
    getDisableDirectives() {
        return this._disableDirectives;
    }

    getCommentGlobals() {
        if (!this._commentGlobals) {
            this._commentGlobals = parseCommentGlobals(this._commentsSorted);
        }

        return this._commentGlobals;
    }

    /**
     * Get all comments inside a node's range (for no-empty, etc.).
     */
    getCommentsInside(node) {
        const start = node.start;
        const end = node.end;
        return _filterByRange(this._commentsSorted, start, end);
    }

    /**
     * Get comments that appear immediately before a node (between the previous
     * token's end and this node's start).
     */
    getCommentsBefore(node) {
        const nodeStart = node.start;
        // Find the end of the previous token (non-comment)
        let prevEnd = 0;
        let i = this._tokensSorted.length - 1;
        while (i >= 0) {
            if (this._tokensSorted[i].end <= nodeStart) {
                prevEnd = this._tokensSorted[i].end;
                break;
            }

            i -= 1;
        }
        return _filterByRange(this._commentsSorted, prevEnd, nodeStart);
    }

    /**
     * Get comments that appear immediately after a node (between this node's end
     * and the next token's start).
     */
    getCommentsAfter(node) {
        const nodeEnd = node.end;
        // Find the start of the next token (non-comment)
        let nextStart = this.text.length;
        let i = 0;
        while (i < this._tokensSorted.length) {
            if (this._tokensSorted[i].start >= nodeEnd) {
                nextStart = this._tokensSorted[i].start;
                break;
            }

            i += 1;
        }
        return _filterByRange(this._commentsSorted, nodeEnd, nextStart);
    }

    /**
     * Get the innermost scope that contains the given node.
     * Walks up the scope tree from the node's scope.
     */
    getScope(node) {
        // Try to acquire a scope directly associated with this node
        const acquired = this.scopeManager.acquire(node);
        if (acquired) return acquired;

        // Otherwise find which scope contains this node by position
        // Walk all scopes and find the innermost one whose block contains the node
        let bestScope = this.scopeManager.globalScope;

        const nodeStart = node.start;
        const nodeEnd = node.end;

        for (const scope of this.scopeManager.scopes) {
            const block = scope.block;
            if (!block) continue;
            const blockStart = block.start;
            const blockEnd = block.end;
            if (blockStart <= nodeStart && blockEnd >= nodeEnd) {
                // This scope contains the node; pick the innermost (smallest) scope
                const bestBlock = bestScope.block;
                if (!bestBlock) {
                    bestScope = scope;
                } else {
                    const currentSize = blockEnd - blockStart;
                    const bestSize = bestBlock.end - bestBlock.start;

                    if (
                        currentSize < bestSize ||
                        (currentSize === bestSize && scope !== this.scopeManager.globalScope)
                    ) {
                        bestScope = scope;
                    }
                }
            }
        }

        return bestScope;
    }

    getResolvedVariable(identifierNode) {
        for (const scope of this.scopeManager.scopes) {
            const reference = scope.references.find(ref => ref.identifier === identifierNode);
            if (reference?.resolved) {
                return reference.resolved;
            }
        }

        return null;
    }

    /**
     * Get variables declared by a given node (delegated to eslint-scope).
     */
    getDeclaredVariables(node) {
        return this.scopeManager.getDeclaredVariables(node);
    }

    /**
     * Convert a character offset to { line, column } (1-based line, 0-based column).
     * Used internally.
     */
    getLocFromIndex(index) {
        // Binary search the line offsets
        let lo = 0;
        let hi = this._lineOffsets.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (this._lineOffsets[mid] <= index) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        return { line: lo + 1, column: index - this._lineOffsets[lo] };
    }
}

/**
 * Normalizes token query options into a consistent object format.
 *
 * Options can be provided as a number (skip count), function (filter predicate),
 * or object with skip, filter, and includeComments properties. Converts any format
 * to { skip, filter, includeComments }.
 *
 * @private
 * @param {number|function|Object} [rawOptions] - Options in any supported format
 * @returns {Object} Normalized options: { skip: number, filter: function|null, includeComments: boolean }
 */
function _normalizeOptions(rawOptions) {
    if (typeof rawOptions === 'number') {
        return { skip: rawOptions, filter: null, includeComments: false };
    }
    if (typeof rawOptions === 'function') {
        return { skip: 0, filter: rawOptions, includeComments: false };
    }
    if (rawOptions && typeof rawOptions === 'object') {
        return {
            skip: rawOptions.skip ?? 0,
            filter: rawOptions.filter ?? null,
            includeComments: rawOptions.includeComments ?? false,
        };
    }
    return { skip: 0, filter: null, includeComments: false };
}

/**
 * Normalizes token count query options into a consistent object format.
 *
 * Similar to _normalizeOptions but for methods that return multiple tokens.
 * Number options are interpreted as count (not skip). Function options still apply as filter.
 * Converts any format to { count, filter, includeComments }.
 *
 * @private
 * @param {number|function|Object} [rawOptions] - Options in any supported format
 * @returns {Object} Normalized options: { count: number, filter: function|null, includeComments: boolean }
 */
function _normalizeCountOptions(rawOptions) {
    if (typeof rawOptions === 'number') {
        return { count: rawOptions, filter: null, includeComments: false };
    }
    if (typeof rawOptions === 'function') {
        return { count: Infinity, filter: rawOptions, includeComments: false };
    }
    if (rawOptions && typeof rawOptions === 'object') {
        return {
            count: rawOptions.count ?? Infinity,
            filter: rawOptions.filter ?? null,
            includeComments: rawOptions.includeComments ?? false,
        };
    }
    return { count: Infinity, filter: null, includeComments: false };
}

/**
 * Filters a pre-sorted array of tokens to those overlapping a range.
 *
 * Includes any token that starts before `end` and ends after `start`.
 * Assumes the input array is sorted by start position for efficiency.
 * Early termination when encountering tokens beyond the range.
 *
 * @private
 * @param {Array<Object>} sorted - Sorted array of tokens with start/end properties
 * @param {number} start - Range start offset (inclusive)
 * @param {number} end - Range end offset (exclusive)
 * @returns {Array<Object>} Filtered tokens that overlap the range
 */
function _filterByRange(sorted, start, end) {
    const result = [];
    for (const token of sorted) {
        if (token.start >= end) break;
        if (token.end > start) {
            result.push(token);
        }
    }
    return result;
}

/**
 * Parses globals comments to extract global variable declarations.
 *
 * Supports ESLint-style global comments like:
 *   Block comment: globals var1, var2: readonly, var3: writable
 * Tracks whether each global is readonly or writable.
 *
 * @private
 * @param {Array<Object>} comments - Array of comment nodes
 * @returns {Map<string, string>} Map of global name to type ('readonly' or 'writable')
 */
function parseCommentGlobals(comments) {
    const globals = new Map();

    for (const comment of comments) {
        if (comment.type !== "Block") {
            continue;
        }

        const match = /^\s*globals?\s+([\s\S]*)$/iu.exec(comment.value);
        if (!match) {
            continue;
        }

        const declarationPattern = /([^\s,:]+)(?::\s*([^\s,]+))?/gu;
        let declarationMatch;

        while ((declarationMatch = declarationPattern.exec(match[1])) !== null) {
            const value = declarationMatch[2]?.trim().toLowerCase() ?? "readonly";
            globals.set(declarationMatch[1], value);
        }
    }

    return globals;
}

export default SourceCode;
