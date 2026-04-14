/**
 * no-dupe-else-if — disallow duplicate conditions in if-else-if chains.
 * Adapted from ESLint's no-dupe-else-if rule.
 */

function getTokenText(node, sourceCode) {
    return sourceCode.getTokens(node).map(token => token.value).join("");
}

function toDNFClauses(node, sourceCode) {
    if (node.type === "LogicalExpression") {
        if (node.operator === "&&") {
            const leftClauses = toDNFClauses(node.left, sourceCode);
            const rightClauses = toDNFClauses(node.right, sourceCode);
            const combined = [];

            for (const leftClause of leftClauses) {
                for (const rightClause of rightClauses) {
                    combined.push([...leftClause, ...rightClause]);
                }
            }

            return normalizeClauses(combined);
        }

        if (node.operator === "||") {
            return normalizeClauses([
                ...toDNFClauses(node.left, sourceCode),
                ...toDNFClauses(node.right, sourceCode),
            ]);
        }
    }

    return [[getTokenText(node, sourceCode)]];
}

function normalizeClauses(clauses) {
    const unique = [];
    const seen = new Set();

    for (const clause of clauses) {
        const normalizedClause = [...new Set(clause)].sort();
        const key = normalizedClause.join("&");

        if (!seen.has(key)) {
            seen.add(key);
            unique.push(normalizedClause);
        }
    }

    unique.sort((a, b) => a.length - b.length);

    const minimal = [];
    for (const clause of unique) {
        if (!minimal.some(existing => isSubset(existing, clause))) {
            minimal.push(clause);
        }
    }

    return minimal;
}

function isSubset(subset, superset) {
    return subset.every(term => superset.includes(term));
}

function isCovered(clauses, previousClauses) {
    return clauses.every(clause =>
        previousClauses.some(previousClause => isSubset(previousClause, clause)),
    );
}

function getElseIfChain(node) {
    const chain = [node];
    let current = node;

    while (current.alternate?.type === "IfStatement") {
        chain.push(current.alternate);
        current = current.alternate;
    }

    return chain;
}

const noDupeElseIfRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        const sourceCode = context.sourceCode;

        return {
            IfStatement(node) {
                if (node.parent?.type === "IfStatement" && node.parent.alternate === node) {
                    return;
                }

                const chain = getElseIfChain(node);
                let previousClauses = toDNFClauses(chain[0].test, sourceCode);

                for (let i = 1; i < chain.length; i += 1) {
                    const currentClauses = toDNFClauses(chain[i].test, sourceCode);

                    if (isCovered(currentClauses, previousClauses)) {
                        context.report({
                            node: chain[i].test,
                            message: "This branch can never execute. Its condition is a duplicate or covered by previous conditions in the if-else-if chain.",
                        });
                        return;
                    }

                    previousClauses = normalizeClauses([...previousClauses, ...currentClauses]);
                }
            },
        };
    },
};

export default noDupeElseIfRule;
