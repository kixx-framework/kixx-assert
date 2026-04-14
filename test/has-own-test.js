import {
    AssertionError,
    assertEqual,
    hasOwn,
} from '../mod.js';

import { getValues } from './values.js';


export default function test_hasOwn() {

    class Widget {

        constructor() {
            this.prop = 1;

            Object.defineProperties(this, {
                obvious: {
                    enumerable: true,
                    value: 2,
                },
                needToKnow: {
                    enumerable: false,
                    value: 3,
                },
            });
        }

        get bar() {
            return 4;
        }

        start() {
            return null;
        }

        static create() {
            return new Widget();
        }
    }

    function getRandomPropName() {
        const props = [
            'length',
            'size',
            'toString',
            'valueOf',
        ];

        const randomIndex = Math.floor(Math.random() * props.length);
        return props[ randomIndex ];
    }

    const tests = getValues(([ obj, messageSuffix ]) => {
        return [ obj, `for ${ messageSuffix };`, getRandomPropName() ];
    });

    // Iterate through all the test values, not to detect a prop, but to ensure the
    // target function does not throw.
    tests.forEach(([ obj, messageSuffix, propname ]) => {
        try {
            hasOwn(propname, obj);
            // The propname *should* be a String, but we don't enforce it.
            hasOwn(obj, {});
        } catch (err) {
            throw new AssertionError(
                `Unexpected error calling target function ${ messageSuffix }`,
                { cause: err },
            );
        }
    });

    const widget = Widget.create();
    const assertTrue = assertEqual(true);
    const assertFalse = assertEqual(false);
    const hasProp = hasOwn('prop');
    const hasConstructor = hasOwn('constructor');
    const hasObvious = hasOwn('obvious');
    const hasNeedToKnow = hasOwn('needToKnow');
    const hasBar = hasOwn('bar');
    const hasStart = hasOwn('start');
    const hasFoo = hasOwn('foo');
    const hasCreate = hasOwn('create');

    assertTrue(hasProp(widget));
    assertTrue(hasOwn('prop', widget));
    assertFalse(hasConstructor(widget));
    assertFalse(hasOwn('constructor', widget));
    assertTrue(hasObvious(widget));
    assertTrue(hasOwn('obvious', widget));
    assertTrue(hasNeedToKnow(widget));
    assertTrue(hasOwn('needToKnow', widget));
    assertFalse(hasBar(widget));
    assertFalse(hasOwn('bar', widget));
    assertFalse(hasStart(widget));
    assertFalse(hasOwn('start', widget));
    assertFalse(hasFoo(widget));
    assertFalse(hasOwn('foo', widget));
    assertTrue(hasCreate(Widget));
    assertTrue(hasOwn('create', Widget));

    // eslint-disable-next-line no-console,no-undef
    console.log('Test hasOwn() passed.');
}

