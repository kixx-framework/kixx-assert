import {
    AssertionError,
    toFriendlyString,
    assert,
} from '../mod.js';

import { assertThrowsErrorMessage } from './helpers.js';

import { getValues } from './values.js';


export default function test_assert() {
    const list = [
        false, // [ null, 'null' ],
        false, // [ _undefined, 'undefined' ],
        true, // [ true, 'true' ],
        false, // [ false, 'false' ],
        true, // [ Boolean(1), 'Boolean(1)' ],
        false, // [ Boolean(0), 'Boolean(0)' ],
        true, // [ -1, '-1' ],
        false, // [ 0, '0' ],
        true, // [ 1, '1' ],
        true, // [ 0.1, '0.1' ],
        true, // [ Number(-1), 'Number(-1)' ],
        false, // [ Number(0), 'Number(0)' ],
        true, // [ Number(1), 'Number(1)' ],
        true, // [ Number(0.1), 'Number(0.1)' ],
        false, // [ NaN, 'NaN' ],
        true, // [ BigInt(-1), 'BigInt(-1)' ],
        false, // [ BigInt(0), 'BigInt(0)' ],
        true, // [ BigInt(1), 'BigInt(1)' ],
        true, // [ '1', '"1"' ],
        true, // [ '0.1', '"0.1"' ],
        true, // [ '7n', '"7n"' ],
        false, // [ '', 'empty String' ],
        true, // [ 'foo', '"foo"' ],
        false, // [ String(''), 'String("")' ],
        true, // [ String('foo'), 'String("foo")' ],
        true, // [ Symbol(), 'Symbol()', ],
        true, // [ Symbol('foo'), 'Symbol("foo")' ],
        true, // [ Dog, 'class Dog' ],
        true, // [ arrowFunc, 'arrow function expression' ],
        true, // [ funcDef, 'function definition' ],
        true, // [ () => { return null; }, 'anonymous arrow function' ],
        true, // [ function () { return null; }, 'anonymous function' ],
        true, // [ {}, 'empty Object {}' ],
        true, // [ Object.create(null), 'Object.create(null)' ],
        true, // [ { foo: 'bar' }, '{ foo: "bar" }' ],
        true, // [ new Dog(), 'new Dog()' ],
        true, // [ new Cat(), 'new Cat()' ],
        true, // [ new Date(), 'new Date()' ],
        true, // [ new Date(2019, 0, 3, 4, 20, 1, 10), 'new Date(2019, 0, 3, 4, 20, 1, 10)' ],
        true, // [ new Date('invalid'), 'new Date("invalid")', false ],
        true, // [ [], 'empty Array []' ],
        true, // [ [ 1 ], 'Array [ 1 ]' ],
        true, // [ new Map(), 'new Map()' ],
        true, // [ new Map([[ 'one', 1 ], [ 'two', 2 ]]), 'new Map([[ "one", 1 ], [ "two", 2 ]])' ],
        true, // [ new Set(), 'new Set()' ],
        true, // [ new Set([ 1, 2 ]), 'new Set([ 1, 2 ])' ],
        true, // [ new WeakMap(), 'new WeakMap()' ],
        true, // [ new WeakSet(), 'new WeakSet()' ],
        true, // [ /^start/i, '/^start/i' ],
        true, // [ new RegExp('^start', 'i'), 'new RegExp("^start", "i")' ],
    ];

    const tests = getValues(([ val, messageSuffix ], index) => {
        const expectedToPass = list[index];
        return [ val, `for ${ messageSuffix };`, expectedToPass ];
    });

    if (tests.length !== list.length) {
        throw new AssertionError(
            `Values length ${ tests.length } is not expected length of ${ list.length }`,
        );
    }

    tests.forEach(([ val, messageSuffix, expectedToPass ]) => {
        if (typeof messageSuffix !== 'string') {
            throw new AssertionError(
                `Expected messageSuffix ${ toFriendlyString(messageSuffix) } to be a String`,
            );
        }
        if (typeof expectedToPass !== 'boolean') {
            throw new AssertionError(
                `Expected expectedToPass ${ toFriendlyString(expectedToPass) } to be a Boolean`,
            );
        }

        messageSuffix = 'with ' + messageSuffix;

        if (expectedToPass) {
            assert(val, messageSuffix);
        } else {
            assertThrowsErrorMessage(messageSuffix, () => {
                assert(val, messageSuffix);
            });
        }
    });

    // eslint-disable-next-line no-console,no-undef
    console.log('Test assert() passed.');
}
