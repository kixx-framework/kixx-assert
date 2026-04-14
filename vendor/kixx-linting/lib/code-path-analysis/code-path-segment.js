/**
 * Represents a single segment in a code path graph.
 *
 * Segments track both reachable edges and the full set of edges so the analyzer
 * can preserve control-flow structure for rules that inspect branching behavior.
 *
 * @author Toru Nagashima
 */

import * as debug from "./debug-helpers.js";

/**
 * Checks whether or not a given segment is reachable.
 * @param {CodePathSegment} segment A segment to check.
 * @returns {boolean} `true` if the segment is reachable.
 */
function isReachable(segment) {
    return segment.reachable;
}

/**
 * A node in the code-path graph.
 *
 * Segments keep both reachable edges and the full set of edges so the analyzer
 * can distinguish semantic flow from bookkeeping needed for traversal.
 */
export class CodePathSegment {
    #internal = {
        // determines if the segment has been attached to the code path
        used: false,

        // array of previous segments coming from the end of a loop
        loopedPrevSegments: [],
    };

    /**
     * Creates a new segment.
     * @param {string} id Segment identifier.
     * @param {CodePathSegment[]} allPrevSegments Previous segments, including unreachable ones.
     * @param {boolean} reachable Whether the segment is reachable.
     */
    constructor(id, allPrevSegments, reachable) {
        /**
         * The identifier of this code path.
         * Rules use it to store additional information of each rule.
         * @type {string}
         */
        this.id = id;

        /**
         * An array of the next reachable segments.
         * @type {CodePathSegment[]}
         */
        this.nextSegments = [];

        /**
         * An array of the previous reachable segments.
         * @type {CodePathSegment[]}
         */
        this.prevSegments = allPrevSegments.filter(isReachable);

        /**
         * An array of all next segments including reachable and unreachable.
         * @type {CodePathSegment[]}
         */
        this.allNextSegments = [];

        /**
         * An array of all previous segments including reachable and unreachable.
         * @type {CodePathSegment[]}
         */
        this.allPrevSegments = allPrevSegments;

        /**
         * A flag which shows this is reachable.
         * @type {boolean}
         */
        this.reachable = reachable;

        /* c8 ignore start */
        if (debug.enabled) {
            this.#internal.nodes = [];
        } /* c8 ignore stop */
    }

    /**
     * Checks a given previous segment is coming from the end of a loop.
     * @param {CodePathSegment} segment A previous segment to check.
     * @returns {boolean} `true` if the segment is coming from the end of a loop.
     */
    isLoopedPrevSegment(segment) {
        return this.#internal.loopedPrevSegments.includes(segment);
    }

    /**
     * Creates the root segment.
     * @param {string} id An identifier.
     * @returns {CodePathSegment} The created segment.
     */
    static newRoot(id) {
        return new CodePathSegment(id, [], true);
    }

    /**
     * Creates a reachable segment and appends it after the given segments.
     * @param {string} id Segment identifier.
     * @param {CodePathSegment[]} allPrevSegments Previous segments to append to.
     * @returns {CodePathSegment} The created segment.
     */
    static newNext(id, allPrevSegments) {
        return new CodePathSegment(
            id,
            CodePathSegment.flattenUnusedSegments(allPrevSegments),
            allPrevSegments.some(isReachable),
        );
    }

    /**
     * Creates an unreachable segment and appends it after the given segments.
     * @param {string} id Segment identifier.
     * @param {CodePathSegment[]} allPrevSegments Previous segments to append to.
     * @returns {CodePathSegment} The created segment.
     */
    static newUnreachable(id, allPrevSegments) {
        const segment = new CodePathSegment(
            id,
            CodePathSegment.flattenUnusedSegments(allPrevSegments),
            false,
        );

        /*
         * In `if (a) return a; foo();` case, the unreachable segment preceded by
         * the return statement is not used but must not be removed.
         */
        CodePathSegment.markUsed(segment);

        return segment;
    }

    /**
     * Creates a detached segment that inherits reachability from the inputs.
     * @param {string} id Segment identifier.
     * @param {CodePathSegment[]} allPrevSegments Previous segments used to infer reachability.
     * @returns {CodePathSegment} The created segment.
     */
    static newDisconnected(id, allPrevSegments) {
        return new CodePathSegment(id, [], allPrevSegments.some(isReachable));
    }

    /**
     * Marks a given segment as used.
     *
     * And this function registers the segment into the previous segments as a next.
     * @param {CodePathSegment} segment A segment to mark.
     * @returns {void}
     */
    static markUsed(segment) {
        if (segment.#internal.used) {
            return;
        }
        segment.#internal.used = true;

        if (segment.reachable) {
            /*
             * If the segment is reachable, then it's officially part of the
             * code path. This loops through all previous segments to update
             * their list of next segments. Because the segment is reachable,
             * it's added to both `nextSegments` and `allNextSegments`.
             */
            for (let i = 0; i < segment.allPrevSegments.length; i += 1) {
                const prevSegment = segment.allPrevSegments[i];

                prevSegment.allNextSegments.push(segment);
                prevSegment.nextSegments.push(segment);
            }
        } else {
            /*
             * If the segment is not reachable, then it's not officially part of the
             * code path. This loops through all previous segments to update
             * their list of next segments. Because the segment is not reachable,
             * it's added only to `allNextSegments`.
             */
            for (let i = 0; i < segment.allPrevSegments.length; i += 1) {
                segment.allPrevSegments[i].allNextSegments.push(segment);
            }
        }
    }

    /**
     * Marks a previous segment as looped.
     * @param {CodePathSegment} segment A segment.
     * @param {CodePathSegment} prevSegment A previous segment to mark.
     * @returns {void}
     */
    static markPrevSegmentAsLooped(segment, prevSegment) {
        segment.#internal.loopedPrevSegments.push(prevSegment);
    }

    /**
     * Creates a new array based on an array of segments. If any segment in the
     * array is unused, then it is replaced by all of its previous segments.
     * All used segments are returned as-is without replacement.
     * @param {CodePathSegment[]} segments The array of segments to flatten.
     * @returns {CodePathSegment[]} The flattened array.
     */
    static flattenUnusedSegments(segments) {
        const done = new Set();

        for (let i = 0; i < segments.length; i += 1) {
            const segment = segments[i];

            // Ignores duplicated.
            if (done.has(segment)) {
                continue;
            }

            // Use previous segments if unused.
            if (!segment.#internal.used) {
                for (let j = 0; j < segment.allPrevSegments.length; j += 1) {
                    const prevSegment = segment.allPrevSegments[j];

                    if (!done.has(prevSegment)) {
                        done.add(prevSegment);
                    }
                }
            } else {
                done.add(segment);
            }
        }

        return [...done];
    }
}
