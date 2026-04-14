import {
    AssertionError,
    toFriendlyString,
    isPlainObject,
} from '../mod.js';

import { getValues } from './values.js';


export default function test_isPlainObject() {
    const list = [
        false, // [ null, 'null' ],
        false, // [ _undefined, 'undefined' ],
        false, // [ true, 'true' ],
        false, // [ false, 'false' ],
        false, // [ Boolean(1), 'Boolean(1)' ],
        false, // [ Boolean(0), 'Boolean(0)' ],
        false, // [ -1, '-1' ],
        false, // [ 0, '0' ],
        false, // [ 1, '1' ],
        false, // [ 0.1, '0.1' ],
        false, // [ Number(-1), 'Number(-1)' ],
        false, // [ Number(0), 'Number(0)' ],
        false, // [ Number(1), 'Number(1)' ],
        false, // [ Number(0.1), 'Number(0.1)' ],
        false, // [ NaN, 'NaN' ],
        false, // [ BigInt(-1), 'BigInt(-1)' ],
        false, // [ BigInt(0), 'BigInt(0)' ],
        false, // [ BigInt(1), 'BigInt(1)' ],
        false, // [ '1', '"1"' ],
        false, // [ '0.1', '"0.1"' ],
        false, // [ '7n', '"7n"' ],
        false, // [ '', 'empty String' ],
        false, // [ 'foo', '"foo"' ],
        false, // [ String(''), 'String("")' ],
        false, // [ String('foo'), 'String("foo")' ],
        false, // [ Symbol(), 'Symbol()', ],
        false, // [ Symbol('foo'), 'Symbol("foo")' ],
        false, // [ Dog, 'class Dog' ],
        false, // [ arrowFunc, 'arrow function expression' ],
        false, // [ funcDef, 'function definition' ],
        false, // [ () => { return null; }, 'anonymous arrow function' ],
        false, // [ function () { return null; }, 'anonymous function' ],
        true, // [ {}, 'empty Object {}' ],
        true, // [ Object.create(null), 'Object.create(null)' ],
        true, // [ { foo: 'bar' }, '{ foo: "bar" }' ],
        false, // [ new Dog(), 'new Dog()' ],
        false, // [ new Cat(), 'new Cat()' ],
        false, // [ new Date(), 'new Date()' ],
        false, // [ new Date(2019, 0, 3, 4, 20, 1, 10), 'new Date(2019, 0, 3, 4, 20, 1, 10)' ],
        false, // [ new Date('invalid'), 'new Date("invalid")', false ],
        false, // [ [], 'empty Array []' ],
        false, // [ [ 1 ], 'Array [ 1 ]' ],
        false, // [ new Map(), 'new Map()' ],
        false, // [ new Map([[ 'one', 1 ], [ 'two', 2 ]]), 'new Map([[ "one", 1 ], [ "two", 2 ]])' ],
        false, // [ new Set(), 'new Set()' ],
        false, // [ new Set([ 1, 2 ]), 'new Set([ 1, 2 ])' ],
        false, // [ new WeakMap(), 'new WeakMap()' ],
        false, // [ new WeakSet(), 'new WeakSet()' ],
        false, // [ /^start/i, '/^start/i' ],
        false, // [ new RegExp('^start', 'i'), 'new RegExp("^start", "i")' ],
    ];

    const tests = getValues(([ val, messageSuffix ], index) => {
        const expectedResult = list[index];
        return [ val, `for ${ messageSuffix };`, expectedResult ];
    });

    if (tests.length !== list.length) {
        throw new AssertionError(
            `Values length ${ tests.length } is not expected length of ${ list.length }`,
        );
    }

    tests.forEach(([ val, messageSuffix, expectedResult ]) => {
        if (typeof messageSuffix !== 'string') {
            throw new AssertionError(
                `Expected messageSuffix ${ toFriendlyString(messageSuffix) } to be a String`,
            );
        }
        if (typeof expectedResult !== 'boolean') {
            throw new AssertionError(
                `Expected expectedResult ${ toFriendlyString(expectedResult) } to be a Boolean`,
            );
        }

        const result = isPlainObject(val);

        if (result !== expectedResult) {
            let msg = `Got ${ toFriendlyString(result) }`;
            msg += ` when expecting ${ toFriendlyString(expectedResult) } `;
            throw new AssertionError(msg + messageSuffix);
        }
    });

    // eslint-disable-next-line no-console,no-undef
    console.log('Test isPlainObject() passed.');
}
