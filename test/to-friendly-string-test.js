import {
    AssertionError,
    assertEqual,
    toFriendlyString,
} from '../mod.js';

import { getValues } from './values.js';


export default function test_toFriendlyString() {

    const assertString = assertEqual('string');

    const tests = getValues(([ obj, messageSuffix ]) => {
        return [ obj, `for ${ messageSuffix };` ];
    });

    // Iterate through all the test values, not to get a result, but to ensure the
    // target function does not throw.
    tests.forEach(([ obj, messageSuffix ]) => {
        let result;
        try {
            result = toFriendlyString(obj);
        } catch (err) {
            throw new AssertionError(
                `Unexpected error calling target function ${ messageSuffix }`,
                { cause: err },
            );
        }

        assertString(typeof result, messageSuffix);
    });

    // eslint-disable-next-line no-console,no-undef
    console.log('Test toFriendlyString() passed.');
}

