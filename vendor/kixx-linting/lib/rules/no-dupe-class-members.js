/**
 * no-dupe-class-members — disallow duplicate class member names.
 * Adapted from ESLint's no-dupe-class-members rule.
 */

import { getPropertyKeyName } from "./utils.js";

function getMemberName(member) {
    return getPropertyKeyName(member);
}

function getMemberKind(member) {
    if (member.type === "PropertyDefinition") {
        return "value";
    }

    if (member.kind === "get" || member.kind === "set") {
        return member.kind;
    }

    return "value";
}

function isDuplicateMemberKind(kind, state) {
    if (kind === "get") {
        return state.get || state.value;
    }

    if (kind === "set") {
        return state.set || state.value;
    }

    return state.get || state.set || state.value;
}

const noDupeClassMembersRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        return {
            ClassBody(node) {
                const seen = new Map();

                for (const member of node.body) {
                    const name = getMemberName(member);
                    if (name === null) continue;

                    // The actual class constructor syntax is special and should
                    // not conflict with ordinary instance members named "constructor".
                    if (!member.static && member.type === "MethodDefinition" && member.kind === "constructor") {
                        continue;
                    }

                    const key = `${member.static ? "static:" : ""}${name}`;
                    const kind = getMemberKind(member);
                    const state = seen.get(key) ?? { get: false, set: false, value: false };
                    const isDuplicate = isDuplicateMemberKind(kind, state);

                    if (isDuplicate) {
                        context.report({
                            node: member,
                            message: `Duplicate class member '${name}'.`,
                        });
                    }

                    state[kind] = true;
                    seen.set(key, state);
                }
            },
        };
    },
};

export default noDupeClassMembersRule;
