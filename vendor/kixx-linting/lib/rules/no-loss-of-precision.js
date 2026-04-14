/**
 * no-loss-of-precision — disallow number literals that lose precision.
 * Adapted from ESLint's no-loss-of-precision rule.
 */

function getRaw(node) {
    return node.raw.replace(/_/gu, "");
}

function isBaseTen(node) {
    const prefixes = ["0x", "0X", "0b", "0B", "0o", "0O"];
    return (
        prefixes.every(prefix => !node.raw.startsWith(prefix)) &&
        !/^0[0-7]+$/u.test(node.raw)
    );
}

function removeLeadingZeros(str) {
    for (let i = 0; i < str.length; i += 1) {
        if (str[i] !== "0") return str.slice(i);
    }
    return str;
}

function removeTrailingZeros(str) {
    for (let i = str.length - 1; i >= 0; i -= 1) {
        if (str[i] !== "0") return str.slice(0, i + 1);
    }
    return str;
}

function normalizeInteger(s) {
    const trimmed = removeLeadingZeros(s);
    const sig = removeTrailingZeros(trimmed);
    return { coefficient: sig, magnitude: trimmed.length - 1 };
}

function normalizeFloat(s) {
    const trimmed = removeLeadingZeros(s);
    const dot = trimmed.indexOf(".");
    if (dot === 0) {
        const sig = removeLeadingZeros(trimmed.slice(1));
        return { coefficient: sig, magnitude: sig.length - trimmed.length };
    }
    if (dot === -1) {
        return { coefficient: trimmed, magnitude: trimmed.length - 1 };
    }
    return { coefficient: trimmed.replace(".", ""), magnitude: dot - 1 };
}

function toScientific(raw, parseAsFloat) {
    const parts = raw.split("e");
    const coeff = parts[0];
    const norm = (parseAsFloat || raw.includes("."))
        ? normalizeFloat(coeff)
        : normalizeInteger(coeff);
    if (parts.length > 1) norm.magnitude += parseInt(parts[1], 10);
    return norm;
}

function notBaseTenLosesPrecision(node) {
    const raw = getRaw(node).toUpperCase();
    let base;
    if (raw.startsWith("0B")) {
        base = 2;
    } else if (raw.startsWith("0X")) {
        base = 16;
    } else {
        base = 8;
    }
    return !raw.endsWith(node.value.toString(base).toUpperCase());
}

function baseTenLosesPrecision(node) {
    const raw = getRaw(node).toLowerCase();
    const normRaw = toScientific(raw, false);
    const reqPrecision = normRaw.coefficient.length;
    if (reqPrecision > 100) return true;
    const stored = node.value.toPrecision(reqPrecision);
    const normStored = toScientific(stored, true);
    return (
        normRaw.magnitude !== normStored.magnitude ||
        normRaw.coefficient !== normStored.coefficient
    );
}

function losesPrecision(node) {
    return isBaseTen(node) ? baseTenLosesPrecision(node) : notBaseTenLosesPrecision(node);
}

const noLossOfPrecisionRule = {
    meta: {
        type: "problem",
        schema: [],
    },

    create(context) {
        return {
            Literal(node) {
                if (node.value && typeof node.value === "number" && losesPrecision(node)) {
                    context.report({
                        node,
                        message: "This number literal will lose precision at runtime.",
                    });
                }
            },
        };
    },
};

export default noLossOfPrecisionRule;
