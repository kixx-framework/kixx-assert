/**
 * no-duplicate-case — disallow duplicate case labels.
 * Adapted from ESLint's no-duplicate-case rule.
 */

function serializeExpression(node) {
    switch (node.type) {
        case "Identifier":
            return `id:${node.name}`;
        case "Literal":
            if (node.regex) {
                return `regex:/${node.regex.pattern}/${node.regex.flags}`;
            }
            if (typeof node.value === "bigint") {
                return `bigint:${String(node.value)}`;
            }
            return `${typeof node.value}:${String(node.value)}`;
        case "ThisExpression":
            return "this";
        case "Super":
            return "super";
        case "UnaryExpression":
            return `unary:${node.operator}:${serializeExpression(node.argument)}`;
        case "UpdateExpression":
            return `update:${node.prefix}:${node.operator}:${serializeExpression(node.argument)}`;
        case "BinaryExpression":
        case "LogicalExpression":
            return `${node.type}:${node.operator}:${serializeExpression(node.left)}:${serializeExpression(node.right)}`;
        case "ConditionalExpression":
            return `cond:${serializeExpression(node.test)}:${serializeExpression(node.consequent)}:${serializeExpression(node.alternate)}`;
        case "CallExpression":
        case "NewExpression":
            return `${node.type}:${serializeExpression(node.callee)}:(${node.arguments.map(serializeExpression).join(",")})`;
        case "MemberExpression":
            return node.computed
                ? `member:${serializeExpression(node.object)}[${serializeExpression(node.property)}]`
                : `member:${serializeExpression(node.object)}.${serializeExpression(node.property)}`;
        case "ArrayExpression":
            return `array:[${node.elements.map(element => element ? serializeExpression(element) : "<hole>").join(",")}]`;
        case "TemplateLiteral":
            return `template:${node.quasis.map((quasi, i) =>
                `${quasi.value.cooked ?? quasi.value.raw}${node.expressions[i] ? `\${${serializeExpression(node.expressions[i])}}` : ""}`,
            ).join("")}`;
        default:
            return node.type;
    }
}

const noDuplicateCaseRule = {
    meta: { type: "problem", schema: [] },
    create(context) {
        return {
            SwitchStatement(node) {
                const previousTests = new Set();
                const reportedTests = new Set();

                for (const switchCase of node.cases) {
                    if (!switchCase.test) continue;

                    const testKey = serializeExpression(switchCase.test);

                    if (previousTests.has(testKey)) {
                        if (reportedTests.has(testKey)) {
                            continue;
                        }

                        context.report({
                            node: switchCase,
                            message: "Duplicate case label.",
                        });
                        reportedTests.add(testKey);
                    } else {
                        previousTests.add(testKey);
                    }
                }
            },
        };
    },
};

export default noDuplicateCaseRule;
