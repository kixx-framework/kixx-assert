import {
    AssertionError,
    toFriendlyString,
    doesMatch,
} from '../mod.js';

const refA = {};

function fnA() {
    return null;
}
function fnB() {
    return null;
}

const dateA = new Date('1999');
const invalidDate = new Date('invalid');

const symbolA = Symbol('A');
const symbolB = Symbol('B');

const bigIntA = BigInt(1);
const bigIntB = BigInt(2);

const arrayA = [ 1, 2, 3 ];

/* eslint-disable max-statements-per-line */
export const tests = [
    [ 1, 1, 'numbers 1, 1', true ],
    [ 0, 1, 'numbers 0, 1', false ],
    [ 2, 1, 'numbers 2, 1', false ],
    [ 0, 0, 'numbers 0, 0', true ],
    [ 1 / 3, 1 / 3, 'numbers 1/3, 1/3', true ],
    [ 0, -0, 'numbers 0, -0', true ],
    [ 1, '1', 'numbers 1, "1"', true ],
    [ NaN, -0, 'numbers NaN, -0', false ],
    [ 0, NaN, 'numbers 0, NaN', false ],
    [ 'foo', NaN, 'numbers "foo", NaN', false ],
    [ NaN, NaN, 'numbers NaN, NaN', true ],
    [ bigIntA, bigIntA, 'bigIntA, bigIntA', true ],
    [ bigIntA, BigInt(1), 'bigIntA, BigInt(1)', true ],
    [ 1, BigInt(1), '1, BigInt(1)', false ],
    [ bigIntA, bigIntB, 'bigIntA, bigIntB', false ],
    [ BigInt(0), BigInt(-0), 'BigInt(0), BigInt(-0)', true ],
    [ 'foo', 'foo', 'strings "foo", "foo"', true ],
    [ '', '', 'strings "", ""', true ],
    [ '', ' ', 'strings "", " "', true ],
    [ 'foo', String('foo'), 'strings "foo", String("foo")', true ],
    [ '1', 1, 'strings "1", 1', false ],
    [ '1', BigInt(1), 'strings "1", BigInt(1)', false ],
    [ 'a', Symbol('a'), 'strings "a", Symbol("a")', false],
    [ symbolA, symbolA, 'symbols symbolA, symbolA', true],
    [ symbolA, symbolB, 'symbols symbolA, symbolB', false],
    [ symbolA, Symbol('A'), 'symbols symbolA, Symbol("A")', false],
    [ true, true, 'bools true, true', true ],
    [ false, false, 'bools false, false', true ],
    [ true, false, 'bools true, false', false ],
    [ false, null, 'bools false, null', false ],
    [ false, 0, 'bools false, 0', false ],
    [ false, '', 'bools false, ""', false ],
    [ true, 1, 'bools true, 1', false ],
    [ true, 'x', 'bools true, "x"', false ],
    [ null, null, 'null, null', true ],
    [ null, false, 'null, false', false ],
    [ null, 0, 'null, 0', false ],
    [ null, NaN, 'null, NaN', false ],
    [ null, Object.create(null), 'null, Object.create(null)', false ],
    [ dateA, dateA, 'date dateA, dateA', true ],
    [ dateA, new Date(), 'date dateA, new Date()', false ],
    [ new Date(2019, 0, 3, 4, 20, 1, 10), new Date(2019, 0, 3, 4, 20, 1, 10), 'date new Date(), new Date()', true ],
    [ new Date(), new Date('invalid'), 'date new Date(), new Date("invalid")', false ],
    [ invalidDate, new Date('invalid'), 'date invalidDate, new Date("invalid")', false ],
    [ refA, {}, 'references refA, {}', false],
    [ refA, refA, 'references refA, refA', true],
    [ fnA, fnB, 'references fnA, fnB', false],
    [ fnA, fnA, 'references fnA, fnA', true],
    [ function () { return null }, function () { return null }, 'references function () { return null; }', false],
    [ 'oba', 'foobar', '"oba", "foobar"', true ],
    [ 'foobar', 'foobar', '"foobar", "foobar"', true ],
    [ 'foobar', 'oba', '"foobar", "oba"', false ],
    [ '', 'foobar', '"", "foobar"', true ],
    [ '', null, '"", null', false ],
    [ null, 'null', 'null, "null"', true ],
    [ 'null', null, '"null", null', false ],
    [ '', 1, '"", 1', false ],
    [ 1, '', '1, ""', false ],
    [ '', {}, '"", {}', false ],
    [ 'x', 'foobar', '"x", "foobar"', false ],
    [ '[object Object]', {}, '"[object Object]", {}', false ],
    [ {}, '[object Object]', '{}, "[object Object]"', true ],

    [ /\[object object\]/i, {}, '/\[object object\]/i, {}', true ],
    [ 1, [ 1, 2 ], '1, Array [ 1, 2 ]', true ],
    [ 0, [ 1, 2 ], '0, Array [ 1, 2 ]', false ],
    [ arrayA, arrayA, 'arrayA, arrayA', true ],
    [ /^FOO/i, 'foo', '/^FOO/i, "foo"', true ],
    [ /^FOO/i, 'oof', '/^FOO/i, "oof"', false ],
    [ /^FOO/i, /^FOO/i, '/^FOO/i, /^FOO/i', false ],
    [ 'foo', /^FOO/i, '"foo", /^FOO/i', false ],
];
/* eslint-enable max-statements-per-line */


export default function test_doesMatch() {

    tests.forEach(([ matcher, val, messageSuffix, expectedResult ]) => {
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

        messageSuffix = 'with ' + messageSuffix;

        const result = doesMatch(matcher, val);

        if (result !== expectedResult) {
            let msg = `Got ${ toFriendlyString(result) }`;
            msg += ` when expecting ${ toFriendlyString(expectedResult) } `;
            throw new AssertionError(msg + messageSuffix);
        }
    });

    tests.forEach(([ matcher, val, messageSuffix, expectedResult ]) => {
        messageSuffix = 'with ' + messageSuffix;

        const doesMatchMatcher = doesMatch(matcher);

        const result = doesMatchMatcher(val);

        if (result !== expectedResult) {
            let msg = `Got ${ toFriendlyString(result) }`;
            msg += ` when expecting ${ toFriendlyString(expectedResult) } `;
            throw new AssertionError(msg + messageSuffix);
        }
    });

    // eslint-disable-next-line no-console,no-undef
    console.log('Test doesMatch() passed.');
}
