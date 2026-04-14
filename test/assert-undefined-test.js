import {
    assertEqual,
    assertUndefined,
} from '../mod.js';

import { assertThrowsAssertionError } from './helpers.js';


export default function test_assertUndefined() {
    assertThrowsAssertionError(() => {
        assertUndefined(1, 'of 1');
    });

    try {
        assertUndefined(1, 'of 1');
    } catch (err) {
        assertEqual(
            'of 1 (Expected Number(1) to be undefined)',
            err.message,
        );
    }

    assertUndefined(undefined);

    // eslint-disable-next-line no-console,no-undef
    console.log('Test assertUndefined() passed.');
}

