import {
    AssertionError,
    toFriendlyString,
    assertNotMatches,
} from '../mod.js';

import { assertThrowsErrorMessage } from './helpers.js';

import { tests } from './does-match-test.js';


export default function test_assertNotMatches() {

    tests.forEach(([ matcher, val, messageSuffix, expectedToFail ]) => {
        if (typeof messageSuffix !== 'string') {
            throw new AssertionError(
                `Expected messageSuffix ${ toFriendlyString(messageSuffix) } to be a String`,
            );
        }
        if (typeof expectedToFail !== 'boolean') {
            throw new AssertionError(
                `Expected expectedToPass ${ toFriendlyString(expectedToFail) } to be a Boolean`,
            );
        }

        messageSuffix = 'with ' + messageSuffix;

        if (expectedToFail) {
            assertThrowsErrorMessage(messageSuffix, () => {
                assertNotMatches(matcher, val, messageSuffix);
            });
        } else {
            assertNotMatches(matcher, val, messageSuffix);
        }
    });

    tests.forEach(([ matcher, val, messageSuffix, expectedToFail ]) => {
        messageSuffix = 'with (curried) ' + messageSuffix;

        const assertNotMatchesMatcher = assertNotMatches(matcher);

        if (expectedToFail) {
            assertThrowsErrorMessage(messageSuffix, () => {
                assertNotMatchesMatcher(val, messageSuffix);
            });
        } else {
            assertNotMatchesMatcher(val, messageSuffix);
        }
    });

    // eslint-disable-next-line no-console,no-undef
    console.log('Test assertNotMatches() passed.');
}
