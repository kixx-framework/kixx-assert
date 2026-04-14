/**
 * no-unreachable — disallow unreachable code after return, throw, continue, and break statements.
 * Ported from ESLint's code-path-driven implementation.
 */

const MESSAGE = "Unreachable code.";

function isInitialized(declarator) {
    return Boolean(declarator.init);
}

function areAllSegmentsUnreachable(segments) {
    for (const segment of segments) {
        if (segment.reachable) {
            return false;
        }
    }
    return true;
}

class ConsecutiveRange {
    constructor(sourceCode) {
        this.sourceCode = sourceCode;
        this.startNode = null;
        this.endNode = null;
    }

    get location() {
        return {
            start: this.startNode.loc.start,
            end: this.endNode.loc.end,
        };
    }

    get isEmpty() {
        return !(this.startNode && this.endNode);
    }

    contains(node) {
        return (
            node.range[0] >= this.startNode.range[0] &&
            node.range[1] <= this.endNode.range[1]
        );
    }

    isConsecutive(node) {
        const tokenBefore = this.sourceCode.getTokenBefore(node);
        return Boolean(tokenBefore && this.contains(tokenBefore));
    }

    merge(node) {
        this.endNode = node;
    }

    reset(node) {
        this.startNode = node;
        this.endNode = node;
    }
}

const noUnreachableRule = {
    meta: {
        type: "problem",
        schema: [],
    },
    create(context) {
        let constructorInfo = null;
        const range = new ConsecutiveRange(context.sourceCode);
        const codePathSegments = [];
        let currentCodePathSegments = new Set();

        function reportIfUnreachable(node) {
            let nextNode = null;

            if (
                node &&
                (
                    node.type === "PropertyDefinition" ||
                    areAllSegmentsUnreachable(currentCodePathSegments)
                )
            ) {
                if (range.isEmpty) {
                    range.reset(node);
                    return;
                }

                if (range.contains(node)) {
                    return;
                }

                if (range.isConsecutive(node)) {
                    range.merge(node);
                    return;
                }

                nextNode = node;
            }

            if (!range.isEmpty) {
                context.report({
                    node: range.startNode,
                    loc: range.location,
                    message: MESSAGE,
                });
            }

            range.reset(nextNode);
        }

        function onConstructorStart(node) {
            if (node.kind !== "constructor") {
                return;
            }

            constructorInfo = {
                upper: constructorInfo,
                hasSuperCall: false,
            };
        }

        function onConstructorEnd(node) {
            if (node.kind !== "constructor" || !constructorInfo) {
                return;
            }

            const { hasSuperCall } = constructorInfo;
            constructorInfo = constructorInfo.upper;

            if (!node.value || !node.value.body) {
                return;
            }

            const classDefinition = node.parent?.parent;
            if (!classDefinition || !classDefinition.superClass || hasSuperCall) {
                return;
            }

            for (const element of classDefinition.body.body) {
                if (element.type === "PropertyDefinition" && !element.static) {
                    reportIfUnreachable(element);
                }
            }
        }

        function onCallExpression(node) {
            if (
                constructorInfo &&
                node.callee &&
                node.callee.type === "Super"
            ) {
                constructorInfo.hasSuperCall = true;
            }
        }

        return {
            onCodePathStart() {
                codePathSegments.push(currentCodePathSegments);
                currentCodePathSegments = new Set();
            },
            onCodePathEnd() {
                currentCodePathSegments = codePathSegments.pop();
            },
            onUnreachableCodePathSegmentStart(segment) {
                currentCodePathSegments.add(segment);
            },
            onUnreachableCodePathSegmentEnd(segment) {
                currentCodePathSegments.delete(segment);
            },
            onCodePathSegmentStart(segment) {
                currentCodePathSegments.add(segment);
            },
            onCodePathSegmentEnd(segment) {
                currentCodePathSegments.delete(segment);
            },

            BlockStatement: reportIfUnreachable,
            BreakStatement: reportIfUnreachable,
            ClassDeclaration: reportIfUnreachable,
            ContinueStatement: reportIfUnreachable,
            DebuggerStatement: reportIfUnreachable,
            DoWhileStatement: reportIfUnreachable,
            ExpressionStatement: reportIfUnreachable,
            ForInStatement: reportIfUnreachable,
            ForOfStatement: reportIfUnreachable,
            ForStatement: reportIfUnreachable,
            IfStatement: reportIfUnreachable,
            ImportDeclaration: reportIfUnreachable,
            LabeledStatement: reportIfUnreachable,
            ReturnStatement: reportIfUnreachable,
            SwitchStatement: reportIfUnreachable,
            ThrowStatement: reportIfUnreachable,
            TryStatement: reportIfUnreachable,
            WhileStatement: reportIfUnreachable,
            WithStatement: reportIfUnreachable,
            ExportNamedDeclaration: reportIfUnreachable,
            ExportDefaultDeclaration: reportIfUnreachable,
            ExportAllDeclaration: reportIfUnreachable,

            VariableDeclaration(node) {
                if (
                    node.kind !== "var" ||
                    node.declarations.some(isInitialized)
                ) {
                    reportIfUnreachable(node);
                }
            },

            MethodDefinition: onConstructorStart,
            "MethodDefinition:exit": onConstructorEnd,
            CallExpression: onCallExpression,

            "Program:exit"() {
                reportIfUnreachable();
            },
        };
    },
};

export default noUnreachableRule;
