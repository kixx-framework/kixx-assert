/**
 * no-invalid-regexp — disallow invalid regular expression strings in RegExp constructors.
 * Adapted from ESLint's no-invalid-regexp rule.
 */

function isRegExpConstructor(node) {
    if (node.type !== "CallExpression" && node.type !== "NewExpression") return false;
    const callee = node.callee;
    return callee.type === "Identifier" && callee.name === "RegExp";
}

function getStringValue(node) {
    if (node.type === "Literal" && typeof node.value === "string") return node.value;
    return null;
}

const VALID_FLAGS = new Set(["d", "g", "i", "m", "s", "u", "v", "y"]);

function validateFlags(flags, allowedFlags) {
    const seen = new Set();
    for (const flag of flags) {
        if (!VALID_FLAGS.has(flag) && !(allowedFlags && allowedFlags.includes(flag))) return false;
        if (seen.has(flag)) return false;
        seen.add(flag);
    }
    // 'u' and 'v' flags are mutually exclusive
    if (seen.has("u") && seen.has("v")) return false;
    return true;
}

const noInvalidRegexpRule = {
    meta: {
        type: "problem",
        schema: [
            {
                type: "object",
                properties: {
                    allowConstructorFlags: {
                        type: "array",
                        items: { type: "string" },
                        uniqueItems: true,
                    },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const allowedFlags = context.options[0]?.allowConstructorFlags ?? [];

        function checkRegExpConstructor(node) {
            if (!isRegExpConstructor(node)) return;

            const [patternArg, flagsArg] = node.arguments;
            const patternStr = patternArg ? getStringValue(patternArg) : null;
            const flagsStr = flagsArg ? getStringValue(flagsArg) : null;

            // When the flags argument exists but its value is unknown (e.g. a variable),
            // we cannot determine validity because validity may depend on the flag (e.g. 'u').
            // Only validate when flags are a known literal string or absent.
            const flagsUnknown = flagsArg !== undefined && flagsStr === null;

            if (!flagsUnknown && flagsStr !== null && !validateFlags(flagsStr, allowedFlags)) {
                context.report({
                    node,
                    message: `Invalid flags supplied to RegExp constructor '${flagsStr}'.`,
                });
                return;
            }

            // When flags are known (or absent), validate the pattern.
            // When flags are unknown, skip pattern validation.
            if (!flagsUnknown && patternStr !== null) {
                // Strip any custom allowed flags before testing (they're not real JS flags)
                const testFlags = flagsStr
                    ? flagsStr.split("").filter(f => VALID_FLAGS.has(f)).join("")
                    : "";
                try {
                    new RegExp(patternStr, testFlags);
                } catch (e) {
                    context.report({
                        node,
                        message: `Invalid regular expression: /${patternStr}/: ${e.message}`,
                    });
                }
            }
        }

        return {
            CallExpression: checkRegExpConstructor,
            NewExpression: checkRegExpConstructor,

            Literal(node) {
                if (!node.regex) return;
                const { pattern, flags } = node.regex;
                try {
                    new RegExp(pattern, flags);
                } catch (e) {
                    context.report({
                        node,
                        message: `Invalid regular expression: /${pattern}/${flags}: ${e.message}`,
                    });
                }
            },
        };
    },
};

export default noInvalidRegexpRule;
