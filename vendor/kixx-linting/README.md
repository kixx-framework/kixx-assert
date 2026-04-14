Kixx Linting
============

A narrowly scoped JavaScript linter written in JavaScript. Derived from [ESLint](https://github.com/eslint/eslint), but with only a limited subset of rules and options supported.

The primary objective of Kixx Linting is to provide a tool to agentic software engineering systems which will cheaply inform them of bugs and code smells. Kixx Linting intends to be cheap to run, providing straightforward and targeted feedback which large language models can understand.

Lint CLI
--------

Run linting with:

```bash
node lint.js <pathname>
```

The `<pathname>` argument is optional. If omitted, the CLI uses the current working directory.

`lint.js` always loads `eslint.config.js` from the current working directory. The config must default-export an array of config objects.

When the target is a directory, linting walks it recursively and only lints `.js` files. Other file extensions are ignored during directory traversal.

`files` and `ignores` matching is literal path-segment matching (no glob support). Diagnostic output is written to `stderr`, grouped by file.

Exit behavior:
- Exits `1` when any lint error is present (or when CLI/config loading fails).
- Exits `0` when results are warnings-only or fully clean.

Programmatic API
----------------

### `lintText(sourceFile, rules, languageOptions)` — `lib/linter.js`

Lints JavaScript source text with the built-in rule registry. Syntax errors are returned as fatal diagnostics with `ruleId: null`; they are not thrown and are not suppressed by inline disable comments. Rule violations honor the supported `eslint-disable` directive subset.

```js
import { lintText } from "./lib/linter.js";

const result = lintText(
    { text: "var x = 1", name: "example.js" },
    { "no-var": 2 },
    { ecmaVersion: "2024", sourceType: "module" },
);
```

**Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `sourceFile.text` | `string` | JavaScript source text to lint. |
| `sourceFile.name` | `string` | File path or label used in the lint result. Defaults to `"<input>"`. |
| `rules` | `Object<string, string\|number\|Array>` | Rule configuration map keyed by rule ID. |
| `languageOptions.ecmaVersion` | `string\|number` | ECMAScript version passed to the parser. Defaults to `"2024"`. |
| `languageOptions.sourceType` | `string` | Source type passed to the parser. Defaults to `"module"`. |
| `languageOptions.globals` | `Object<string, string\|boolean>` | Global variables available to scope-aware rules. Set a name to `"off"` to disable it. |
| `languageOptions.parserOptions.ecmaFeatures.globalReturn` | `boolean` | Allow `return` statements outside functions. Defaults to `false`. |

**Returns** `LintResult`

| Field | Type | Description |
|-------|------|-------------|
| `filePath` | `string` | Source file name or `<input>` when no name was provided. |
| `messages` | `LintMessage[]` | Diagnostics not suppressed by inline disable directives. |
| `errorCount` | `number` | Number of diagnostics with severity 2. |
| `warningCount` | `number` | Number of diagnostics with severity 1. |

Each `LintMessage` has: `ruleId` (`string|null`), `severity` (`1|2`), `message` (`string`), `line` (`number`), `column` (`number`).

**Throws** when a configured rule is unknown or has an invalid severity.

---

### `runLintCli(args)` — `lib/lint-cli.js`

Runs the config-driven lint CLI programmatically and returns a process-style exit code. Loads `eslint.config.js` from `cwd`, recursively discovers `.js` files when the target is a directory, applies literal `files` and `ignores` matching, writes diagnostics to `stderr`, and returns `1` when any lint error or CLI setup error occurs.

```js
import { runLintCli } from "./lib/lint-cli.js";

const exitCode = await runLintCli({
    argv: ["src/"],
    cwd: process.cwd(),
    stderr: process.stderr,
});
process.exit(exitCode);
```

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `args.argv` | `string[]` | `[]` | Positional CLI arguments after the executable and script name. |
| `args.cwd` | `string` | `process.cwd()` | Working directory used to resolve the target and load `eslint.config.js`. |
| `args.stderr` | `Writable` | `process.stderr` | Writable stream for diagnostics and operational errors. |

**Returns** `Promise<number>` — `0` for clean or warnings-only results, `1` for errors.

---

### Config Object Format — `lib/lint-cli.js`

`eslint.config.js` must default-export an array of plain config objects. Each object may have:

| Field | Type | Description |
|-------|------|-------------|
| `files` | `string[]` | Literal file or directory entries that select lint targets (no glob support). |
| `ignores` | `string[]` | Literal file or directory entries that exclude lint targets. |
| `rules` | `Object<string, string\|number\|Array>` | Rule configuration map passed to `lintText()`. |
| `languageOptions` | `Object` | Parser, scope, and rule language options passed to `lintText()`. |

A config object with only an `ignores` key is treated as a **global ignore**: its entries exclude files before any other config matching is applied.

When multiple config objects match a file, they are deep-merged in order with later entries taking precedence. `files` and `ignores` keys are stripped from the merged result before linting.

---

Disabling Rules Inline
----------------------

Kixx Linting supports a small subset of ESLint-style inline disabling comments.
The `eslint-` prefix is required.

Supported forms:

```js
console.log(value); // eslint-disable-line no-console
console.log(value); /* eslint-disable-line no-console */

// eslint-disable-next-line no-console
console.log(value);

/* eslint-disable-next-line no-console, no-debugger */
console.log(value); debugger;

/* eslint-disable-next-line no-console,
   no-debugger */
console.log(value); debugger;

/* eslint-disable */
console.log(value);
debugger;
/* eslint-enable */

/* eslint-disable no-console, no-debugger */
console.log(value);
debugger;
/* eslint-enable no-console, no-debugger */

/* eslint-disable no-console */
console.log(value);
```

Behavior:
- `eslint-disable-line` applies to the line containing the directive comment.
- `eslint-disable-next-line` applies only to the immediately following line.
- `eslint-disable` applies after the block comment until a later `eslint-enable` block comment or the end of the file.
- A top-of-file `eslint-disable` comment with no later `eslint-enable` disables matching rule diagnostics for the rest of the file.
- Bare `eslint-disable` and `eslint-enable` comments affect all rule diagnostics.
- Rule-specific `eslint-disable` and `eslint-enable` comments affect only the listed rules.
- Multiple rules may be listed as comma-separated rule IDs.
- Line-scoped directives may use line comments or block comments.
- Range-scoped `eslint-disable` and `eslint-enable` directives use block comments.
- Parse errors are not suppressed by disable comments.


Copyright and License
---------------------
Copyright by Kris Walker (www.kriswalker.me).

Unless otherwise indicated, all source code is licensed under the MIT license. See LICENSE for details.

Significant portions of this software was derived from ESLint and the OpenJS Foundation (copyright OpenJS Foundation and other contributors, <www.openjsf.org>). The appropriate attribution and LICENSE notices are included in all substantial portions of this software.
