import { AssertionError } from '../mod.js';

/* eslint-disable indent */

export default function test_AssertionError() {

    // Is a subclass of Error.
    {
        const err = new AssertionError('test message');
        if (!(err instanceof Error)) {
            throw new AssertionError('Expected AssertionError to be an instance of Error');
        }
        if (!(err instanceof AssertionError)) {
            throw new AssertionError('Expected AssertionError to be an instance of AssertionError');
        }
    }

    // Sets the message property.
    {
        const err = new AssertionError('something went wrong');
        if (err.message !== 'something went wrong') {
            throw new AssertionError(`Expected message "something went wrong" but got "${ err.message }"`);
        }
    }

    // Default name is "AssertionError".
    {
        const err = new AssertionError('test');
        if (err.name !== 'AssertionError') {
            throw new AssertionError(`Expected name "AssertionError" but got "${ err.name }"`);
        }
    }

    // Default code is AssertionError.CODE ("ASSERTION_ERROR").
    {
        const err = new AssertionError('test');
        if (err.code !== 'ASSERTION_ERROR') {
            throw new AssertionError(`Expected code "ASSERTION_ERROR" but got "${ err.code }"`);
        }
    }

    // Static CODE property equals "ASSERTION_ERROR".
    {
        if (AssertionError.CODE !== 'ASSERTION_ERROR') {
            throw new AssertionError(`Expected AssertionError.CODE "ASSERTION_ERROR" but got "${ AssertionError.CODE }"`);
        }
    }

    // Custom name via spec.name.
    {
        const err = new AssertionError('test', { name: 'CustomError' });
        if (err.name !== 'CustomError') {
            throw new AssertionError(`Expected name "CustomError" but got "${ err.name }"`);
        }
    }

    // Custom code via spec.code.
    {
        const err = new AssertionError('test', { code: 'MY_CODE' });
        if (err.code !== 'MY_CODE') {
            throw new AssertionError(`Expected code "MY_CODE" but got "${ err.code }"`);
        }
    }

    // operator property is set from spec.operator.
    {
        const err = new AssertionError('test', { operator: 'assertEqual' });
        if (err.operator !== 'assertEqual') {
            throw new AssertionError(`Expected operator "assertEqual" but got "${ err.operator }"`);
        }
    }

    // operator is not set when not provided.
    {
        const err = new AssertionError('test');
        if ('operator' in err) {
            throw new AssertionError('Expected operator property to be absent when not specified');
        }
    }

    // cause is set from spec.cause.
    {
        const cause = new Error('original error');
        const err = new AssertionError('test', { cause });
        if (err.cause !== cause) {
            throw new AssertionError('Expected cause to be the provided Error instance');
        }
    }

    // code inherits from cause.code when spec.code is not provided.
    {
        const cause = new Error('original');
        cause.code = 'CAUSE_CODE';
        const err = new AssertionError('test', { cause });
        if (err.code !== 'CAUSE_CODE') {
            throw new AssertionError(`Expected code to inherit from cause.code "CAUSE_CODE" but got "${ err.code }"`);
        }
    }

    // spec.code takes precedence over cause.code.
    {
        const cause = new Error('original');
        cause.code = 'CAUSE_CODE';
        const err = new AssertionError('test', { code: 'SPEC_CODE', cause });
        if (err.code !== 'SPEC_CODE') {
            throw new AssertionError(`Expected spec.code "SPEC_CODE" to take precedence, but got "${ err.code }"`);
        }
    }

    // name property is enumerable.
    {
        const err = new AssertionError('test');
        const keys = Object.keys(err);
        if (!keys.includes('name')) {
            throw new AssertionError(`Expected "name" to be enumerable, got keys: ${ JSON.stringify(keys) }`);
        }
    }

    // code property is enumerable.
    {
        const err = new AssertionError('test');
        const keys = Object.keys(err);
        if (!keys.includes('code')) {
            throw new AssertionError(`Expected "code" to be enumerable, got keys: ${ JSON.stringify(keys) }`);
        }
    }

    // operator property is enumerable when set.
    {
        const err = new AssertionError('test', { operator: 'assert' });
        const keys = Object.keys(err);
        if (!keys.includes('operator')) {
            throw new AssertionError(`Expected "operator" to be enumerable, got keys: ${ JSON.stringify(keys) }`);
        }
    }

    // name property is not writable.
    {
        const err = new AssertionError('test');
        try {
            err.name = 'SomethingElse';
        } catch {
            // Strict mode throws; non-strict silently fails — both are fine.
        }
        if (err.name !== 'AssertionError') {
            throw new AssertionError(`Expected name to be non-writable, but it changed to "${ err.name }"`);
        }
    }

    // code property is not writable.
    {
        const err = new AssertionError('test');
        try {
            err.code = 'CHANGED';
        } catch {
            // Strict mode throws; non-strict silently fails — both are fine.
        }
        if (err.code !== 'ASSERTION_ERROR') {
            throw new AssertionError(`Expected code to be non-writable, but it changed to "${ err.code }"`);
        }
    }

    // No spec argument (undefined) is handled gracefully.
    {
        const err = new AssertionError('test', undefined);
        if (err.name !== 'AssertionError') {
            throw new AssertionError(`Expected default name with undefined spec, got "${ err.name }"`);
        }
        if (err.code !== 'ASSERTION_ERROR') {
            throw new AssertionError(`Expected default code with undefined spec, got "${ err.code }"`);
        }
    }

    // sourceFunction excludes itself from the stack trace.
    {
        function sourceFunc() {
            throw new AssertionError('test', {}, sourceFunc);
        }
        try {
            sourceFunc();
        } catch (err) {
            if (err.stack.includes('sourceFunc')) {
                throw new AssertionError('Expected sourceFunc to be excluded from the stack trace');
            }
        }
    }

    // eslint-disable-next-line no-console,no-undef
    console.log('Test AssertionError() passed.');
}
