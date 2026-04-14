import {
    assertGreaterThan,
    assertLessThan,
} from '../mod.js';

import { assertThrowsAssertionError } from './helpers.js';

export default function test_assertGTandLT() {

    // Using Date objects as test subjects here:
    // 1. I think that's a cool use case.
    // 2. We don't need waste time testing JavaScript's <, >, >=, <= functionality.
    // 3. I'm tired of writing tests.
    const flowerPower = new Date('1969');
    const dotCom = new Date('1999');
    const assertBefore1999 = assertLessThan(dotCom);
    const assertAfter1969 = assertGreaterThan(flowerPower);

    assertThrowsAssertionError(() => {
        assertGreaterThan(dotCom, flowerPower);
    });

    assertThrowsAssertionError(() => {
        assertLessThan(flowerPower, dotCom);
    });

    assertThrowsAssertionError(() => {
        assertBefore1999(new Date('2000'));
    });

    assertThrowsAssertionError(() => {
        assertAfter1969(new Date('1929'));
    });

    assertThrowsAssertionError(() => {
        assertBefore1999(new Date('1999'));
    });

    assertThrowsAssertionError(() => {
        assertAfter1969(new Date('1969'));
    });

    assertGreaterThan(flowerPower, dotCom);
    assertLessThan(dotCom, flowerPower);
    assertBefore1999(new Date('1997'));
    assertAfter1969(new Date('1978'));

    // eslint-disable-next-line no-console,no-undef
    console.log('Test assertGreaterThan() and assertLessThan() passed.');
}
