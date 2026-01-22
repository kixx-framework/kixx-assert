# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

kixx-assert is a JavaScript assertion library providing type-checking functions (e.g., `isString()`, `isNonEmptyString()`) that return Booleans, and assertion functions (e.g., `assertEqual()`) that throw `AssertionError` on failure. Many assertion functions support currying.

## Commands

```bash
# Run linting and tests
npm test

# Run linting only
npm run lint

# Run tests only (without linting)
node ./test/run-tests.js
```

## Architecture

- **mod.js** - Single-file library containing all exports. No build step required.
- **test/run-tests.js** - Test runner that imports and executes all test modules.
- **test/*-test.js** - Individual test files, each exporting a default function that runs tests.
- **test/values.js** - Shared test values used across test files.
- **test/helpers.js** - Test utilities like `assertThrowsAssertionError()`.

## Code Style

- ES6 modules only (no CommonJS)
- 4-space indentation
- Single quotes for strings
- Spaces inside template literal braces: `${ value }`
- Spaces inside array brackets: `[ 1, 2, 3 ]`
- Trailing commas in multiline arrays/objects, but not in function parameters
- No `console.log` (eslint error) except in test output
- No `++`/`--` operators (use `+= 1` instead)
- Use `const`/`let`, never `var`

## Testing Pattern

Tests use a custom lightweight approach (no test framework). Each test file:
1. Exports a default function
2. Uses values from `test/values.js` for consistent test data
3. Throws `AssertionError` on failure
4. Logs success message via `console.log`

## Design Philosophy

- Targets ES2022+ (Node.js >= 16.13.2, Deno >= 1.0.0)
- Prioritizes correctness and readability over performance
- No TypeScript
- No build process - single source file is the published package
