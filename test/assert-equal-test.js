import {
    AssertionError,
    toFriendlyString,
    assertEqual,
} from '../mod.js';

import { assertThrowsErrorMessage } from './helpers.js';

import { tests } from './is-equal-test.js';


export default function test_assertEqual() {

    tests.forEach(([ a, b, messageSuffix, expectedToPass ]) => {
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
            assertEqual(a, b, messageSuffix);
        } else {
            assertThrowsErrorMessage(messageSuffix, () => {
                assertEqual(a, b, messageSuffix);
            });
        }
    });

    tests.forEach(([ a, b, messageSuffix, expectedToPass ]) => {

        messageSuffix = 'with (curried) ' + messageSuffix;

        const assertEqualToA = assertEqual(a);

        if (expectedToPass) {
            assertEqualToA(b, messageSuffix);
        } else {
            assertThrowsErrorMessage(messageSuffix, () => {
                assertEqualToA(b, messageSuffix);
            });
        }
    });

    // eslint-disable-next-line no-console,no-undef
    console.log('Test assertEqual() passed.');
}

