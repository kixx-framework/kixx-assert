This project is a lightweight JavaScript library containing assertion functions and helpers.

See @README.md for the project overview.

DO NOT attempt to publish this project. The publishing function is a manual process performed only by humans.

## Linting

Run linting with:

```bash
node lint.js <pathname>
```

The `<pathname>` argument is optional. If omitted, the CLI uses the current working directory.

`lint.js` always loads `eslint.config.js` from the current working directory.

**Disabling lint rules**

This project supports a small subset of ESLint-style inline disabling comments.

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

When you need to fix lint problems, keep in mind that it is sometimes better to disable a rule with a comment rather than overengineering a workaround.

## Testing

Run the linter and the tests with:

```bash
npm test
```

Run just the linter with:

```bash
node lint.js
```

Or, to lint a specific file, pass in the pathname:

```bash
node lint.js <pathname>
```

Run the Deno linter:

```bash
deno lint
```

Run just the tests with:

```bash
node run-tests.js
```

Or, to target a specific test suite by directory or file name, pass in the pathname:

```bash
node run-tests.js <pathname>
```

## Code Style

**Arrow functions style:**

When an arrow function body is small and a single statement, you should prefer to write it on a single line:

```javascript
[1,2,3].map(n => n * 10);
```

When the function body becomes large or contains more than one statement, then use a multiline arrow function body in a block:

```javascript
const isConst = variable.defs.some((def) => {
    return def.type === "Variable" &&
        def.parent &&
        def.parent.kind === "const";
});
```

**Function argument objects**
When using objects as arguments to functions, you should prefer to destructure the objects after the function defintion:

```javascript
function runSubProcess(args) {
    const {
        argv = [],
        cwd = process.cwd(),
        stderr = process.stderr,
    } = args ?? {};

    // ... Function body ...
}
```

Here is an example of incorrect code for argument objects:

```javascript
function runSubProcess({
    argv = [],
    cwd = process.cwd(),
    stderr = process.stderr,
} = {}) {
    // ... Function body ...
}
```

**When importing built-in Node.js modules use the "node:" prefix.**

```javascript
import path from 'node:path';
import fsp from 'node:fs/promises';
```

**Do not use the `process` global in Node.js**

Instead of using the `process` global in Node.js, import it like this:

```javascript
import process from 'node:process';
```

**Use ES6 private elements instead of underscores "_" to denote a private member.**

Example of correct code:

```javascript
class ClassWithPrivate {
    #privateField;
    #privateFieldWithInitializer = 42;

    #privateMethod() {
        // …
    }

    static #privateStaticField;
    static #privateStaticFieldWithInitializer = 42;

    static #privateStaticMethod() {
        // …
    }
}
```

Example of incorrect code:

```javascript
class ClassWithPrivate {
    _privateField;
    __privateFieldWithInitializer = 42;

    _privateMethod() {
        // …
    }

    static __privateStaticField;
    static _privateStaticFieldWithInitializer = 42;

    static __privateStaticMethod() {
        // …
    }
}
````

