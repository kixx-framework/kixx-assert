/**
 * Debug hooks for code-path analysis.
 *
 * The production build keeps these hooks disabled so the analyzer can call
 * them unconditionally without paying any formatting or I/O cost.
 * @module
 */

/**
 * No-op debug sink used when diagnostics are disabled.
 * @returns {void}
 */
function noop() {}

/**
 * Indicates whether debug output is enabled.
 * @type {boolean}
 */
export const enabled = false;

/**
 * Writes a single debug message when debugging is enabled.
 * @type {function(...any): void}
 */
export const dump = noop;

/**
 * Writes the current analyzer state when debugging is enabled.
 * @type {function(...any): void}
 */
export const dumpState = noop;

/**
 * Writes the dot graph representation when debugging is enabled.
 * @type {function(...any): void}
 */
export const dumpDot = noop;

/**
 * Builds dot graph arrow markup for debug output.
 * @returns {string} Empty output when debugging is disabled.
 */
export function makeDotArrows() {
    return "";
}
