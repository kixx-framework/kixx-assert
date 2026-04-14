import {
    AssertionError,
    toFriendlyString,
    assertMatches,
} from '../mod.js';

import { assertThrowsErrorMessage } from './helpers.js';

import { tests } from './does-match-test.js';


export default function test_assertMatches() {

    tests.forEach(([ matcher, val, messageSuffix, expectedToPass ]) => {
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
            assertMatches(matcher, val, messageSuffix);
        } else {
            assertThrowsErrorMessage(messageSuffix, () => {
                assertMatches(matcher, val, messageSuffix);
            });
        }
    });

    tests.forEach(([ matcher, val, messageSuffix, expectedToPass ]) => {
        messageSuffix = 'with (curried) ' + messageSuffix;

        const assertMatchesMatcher = assertMatches(matcher);

        if (expectedToPass) {
            assertMatchesMatcher(val, messageSuffix);
        } else {
            assertThrowsErrorMessage(messageSuffix, () => {
                assertMatchesMatcher(val, messageSuffix);
            });
        }
    });

    // eslint-disable-next-line no-console,no-undef
    console.log('Test assertMatches() passed.');
}
