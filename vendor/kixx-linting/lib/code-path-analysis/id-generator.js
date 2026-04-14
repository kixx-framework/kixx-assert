/**
 * Generates stable, prefixed identifiers for code-path segments.
 *
 * Each code path receives its own generator so segment IDs are unique within
 * that path while still remaining compact and readable in debug output.
 *
 * @author Toru Nagashima
 */

/**
 * A generator for unique IDs within a code path.
 */
export class IdGenerator {
    #n = 0;

    /**
     * @param {string} prefix Prefix for every generated identifier.
     */
    constructor(prefix) {
        this.prefix = String(prefix);
    }

    /**
     * Generates the next identifier in the sequence.
     * @returns {string} The generated identifier.
     */
    next() {
        this.#n = (1 + this.#n) | 0;

        /* c8 ignore start */
        if (this.#n < 0) {
            this.#n = 1;
        } /* c8 ignore stop */

        return this.prefix + this.#n;
    }
}
