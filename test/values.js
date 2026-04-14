
export class Cat {}

export class Dog {
    constructor() {
        this.foo = 1;
        this.notta = null;

        Object.defineProperty(this, 'hidden', {
            enumerable: false,
            value: 3,
        });
    }

    get bar() {
        return 2;
    }
}

export const arrowFunc = () => {
    return null;
};

export function funcDef() {
    return null;
}

export function getValues(mapper, _undefined) {

    const list = [
        [ null, 'null' ],
        [ _undefined, 'undefined' ],
        [ true, 'true' ],
        [ false, 'false' ],
        [ Boolean(1), 'Boolean(1)' ],
        [ Boolean(0), 'Boolean(0)' ],
        [ -1, '-1' ],
        [ 0, '0' ],
        [ 1, '1' ],
        [ 0.1, '0.1' ],
        [ Number(-1), 'Number(-1)' ],
        [ Number(0), 'Number(0)' ],
        [ Number(1), 'Number(1)' ],
        [ Number(0.1), 'Number(0.1)' ],
        [ NaN, 'NaN' ],
        [ BigInt(-1), 'BigInt(-1)' ],
        [ BigInt(0), 'BigInt(0)' ],
        [ BigInt(1), 'BigInt(1)' ],
        [ '1', '"1"' ],
        [ '0.1', '"0.1"' ],
        [ '7n', '"7n"' ],
        [ '', 'empty String' ],
        [ 'foo', '"foo"' ],
        [ String(''), 'String("")' ],
        [ String('foo'), 'String("foo")' ],
        [ Symbol(), 'Symbol()' ],
        [ Symbol('foo'), 'Symbol("foo")' ],
        [ Dog, 'class Dog' ],
        [ arrowFunc, 'arrow function expression' ],
        [ funcDef, 'function definition' ],
        [ () => { return null }, 'anonymous arrow function' ],
        [ function () { return null }, 'anonymous function' ],
        [ {}, 'emty Object {}' ],
        [ Object.create(null), 'Object.create(null)' ],
        [ { foo: 'bar' }, '{ foo: "bar" }' ],
        [ new Dog(), 'new Dog()' ],
        [ new Cat(), 'new Cat()' ],
        [ new Date(), 'new Date()' ],
        [ new Date(2019, 0, 3, 4, 20, 1, 10), 'new Date(2019, 0, 3, 4, 20, 1, 10)' ],
        [ new Date('invalid'), 'new Date("invalid")', false ],
        [ [], 'empty Array []' ],
        [ [ 1 ], 'Array [ 1 ]' ],
        [ new Map(), 'new Map()' ],
        [ new Map([[ 'one', 1 ], [ 'two', 2 ]]), 'new Map([[ "one", 1 ], [ "two", 2 ]])' ],
        [ new Set(), 'new Set()' ],
        [ new Set([ 1, 2 ]), 'new Set([ 1, 2 ])' ],
        [ new WeakMap(), 'new WeakMap()' ],
        [ new WeakSet(), 'new WeakSet()' ],
        [ /^start/i, '/^start/i' ],
        [ new RegExp('^start', 'i'), 'new RegExp("^start", "i")' ],
    ];


    return list.map(mapper);
}
