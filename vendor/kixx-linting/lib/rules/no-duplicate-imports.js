/**
 * no-duplicate-imports — disallow duplicate module imports.
 * Adapted from ESLint's no-duplicate-imports rule.
 */

function classifyImport(node) {
    const hasDefault = node.specifiers.some(specifier => specifier.type === "ImportDefaultSpecifier");
    const hasNamespace = node.specifiers.some(specifier => specifier.type === "ImportNamespaceSpecifier");
    const hasNamed = node.specifiers.some(specifier => specifier.type === "ImportSpecifier");

    return {
        source: node.source.value,
        node,
        isSideEffect: node.specifiers.length === 0,
        isPlainImport: !hasNamespace && node.specifiers.length > 0,
        hasDefault: !hasNamespace && hasDefault,
        hasNamed: !hasNamespace && hasNamed,
        hasNamespace,
    };
}

function classifyExport(node) {
    return {
        source: node.source.value,
        node,
        isNamed: node.type === "ExportNamedDeclaration",
        isExportAll: node.type === "ExportAllDeclaration" && !node.exported,
        isNamespace: node.type === "ExportAllDeclaration" && Boolean(node.exported),
    };
}

const noDuplicateImportsRule = {
    meta: {
        type: "problem",
        schema: [
            {
                type: "object",
                properties: {
                    includeExports: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
    },
    create(context) {
        const includeExports = context.options[0]?.includeExports ?? false;
        const imports = [];
        const exports = [];

        return {
            ImportDeclaration(node) {
                imports.push(classifyImport(node));
            },
            ExportNamedDeclaration(node) {
                if (!includeExports || !node.source) return;
                exports.push(classifyExport(node));
            },
            ExportAllDeclaration(node) {
                if (!includeExports || !node.source) return;
                exports.push(classifyExport(node));
            },
            "Program:exit"() {
                const bySource = new Map();

                function getEntry(source) {
                    if (!bySource.has(source)) {
                        bySource.set(source, {
                            imports: [],
                            exports: [],
                        });
                    }
                    return bySource.get(source);
                }

                imports.forEach(entry => {
                    getEntry(entry.source).imports.push(entry);
                });

                exports.forEach(entry => {
                    getEntry(entry.source).exports.push(entry);
                });

                for (const [source, entry] of bySource) {
                    const sideEffectImports = entry.imports.filter(item => item.isSideEffect);
                    const plainImports = entry.imports.filter(item => item.isPlainImport);
                    const defaultPlainImports = plainImports.filter(item => item.hasDefault);
                    const namespaceImports = entry.imports.filter(item => item.hasNamespace);
                    const namedExports = entry.exports.filter(item => item.isNamed);
                    const exportAlls = entry.exports.filter(item => item.isExportAll);
                    const namespaceExports = entry.exports.filter(item => item.isNamespace);

                    const hasDuplicateImports =
                        sideEffectImports.length > 1 ||
                        plainImports.length > 1 ||
                        (sideEffectImports.length > 0 && plainImports.length > 0);

                    const hasDuplicateExports =
                        namedExports.length > 1 ||
                        exportAlls.length > 1 ||
                        (sideEffectImports.length > 0 && exportAlls.length > 0) ||
                        (plainImports.length > 0 && namedExports.length > 0) ||
                        (defaultPlainImports.length > 0 && namespaceExports.length > 0) ||
                        (namespaceImports.length > 0 && namespaceExports.length > 0);

                    if (hasDuplicateImports || hasDuplicateExports) {
                        const reportNode = [
                            ...entry.imports.map(item => item.node),
                            ...entry.exports.map(item => item.node),
                        ].at(-1);

                        context.report({
                            node: reportNode,
                            message: `'${source}' import is duplicated.`,
                        });
                    }
                }
            },
        };
    },
};

export default noDuplicateImportsRule;
