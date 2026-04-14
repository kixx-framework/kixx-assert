import {
    assertEqual,
    assertDefined,
} from '../mod.js';

import { assertThrowsAssertionError } from './helpers.js';

export default function test_assertDefined() {

    assertThrowsAssertionError(() => {
        assertDefined(undefined, 'of undefined');
    });

    try {
        assertDefined(undefined, 'of undefined');
    } catch (err) {
        assertEqual(
            'of undefined (Expected undefined to be defined)',
            err.message,
        );
    }

    assertDefined({});

    // eslint-disable-next-line no-console,no-undef
    console.log('Test assertDefined() passed.');
}

