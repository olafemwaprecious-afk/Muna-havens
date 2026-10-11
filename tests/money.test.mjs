/**
 * Money handling.
 *
 * These tests exist because the whole price promise rests on this module: the
 * database stores `numeric(12,2)`, the API transports a string, and the only
 * places a value can be misread are the two directions of conversion here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatNaira,
  formatNairaOr,
  parseAmount,
  parseQuantity,
  toNumber,
  NAIRA_SIGN,
} from '../assets/js/lib/money.js';

test('whole naira amounts print without kobo', () => {
  assert.equal(formatNaira('28000.00'), `${NAIRA_SIGN}28,000`);
  assert.equal(formatNaira('3500'), `${NAIRA_SIGN}3,500`);
  assert.equal(formatNaira(0), `${NAIRA_SIGN}0`);
});

test('non-zero kobo are shown, and the naira sign is always used', () => {
  assert.equal(formatNaira('3500.50'), `${NAIRA_SIGN}3,500.50`);
  assert.match(formatNaira('5500.00'), /^₦5,500$/u);
  assert.doesNotMatch(formatNaira('5500.00'), /\$/);
});

test('a stored price stays a string on the way in and never round-trips through currency maths', () => {
  // 100.10 + 100.10 + 100.10 is 300.30000000000007 in float arithmetic. The
  // layer that must not create that is the parser, so it returns fixed text.
  assert.equal(parseAmount('100.10').value, '100.10');
  assert.equal(parseAmount('100,10') === undefined, false);
  assert.equal(toNumber('28000.10'), 28000.1);
  assert.equal(formatNaira('300.30'), `${NAIRA_SIGN}300.30`);
});

test('parseAmount accepts what a person actually types on a phone', () => {
  for (const raw of ['28000', '28,000', '28 000', '₦28,000', '28.000', '28000.00', ' 28000 ', 'NGN 28,000']) {
    const result = parseAmount(raw);
    assert.equal(result.ok, true, `expected ${raw} to parse`);
    assert.equal(result.value, '28000.00', `expected ${raw} to normalise to 28000.00`);
  }
});

test('a decimal comma is honoured when it cannot be thousands grouping', () => {
  assert.equal(parseAmount('3500,50').value, '3500.50');
  assert.equal(parseAmount('1.234,50').value, '1234.50');
  assert.equal(parseAmount('1,234,567').value, '1234567.00');
});

test('an ambiguous three-digit tail is only read as grouping when the head looks like grouping', () => {
  // 28.000 → 28,000. But 28000.999 is not a thousands group, so it must be
  // refused rather than silently turned into ₦28,000,999.
  assert.equal(parseAmount('28.000').value, '28000.00');
  assert.equal(parseAmount('28000.999').ok, false);
  assert.match(parseAmount('28000.999').error, /decimal places/u);
});

test('parseAmount refuses things that are not an amount', () => {
  for (const raw of ['', '   ', 'free', '-5', '-28000', '2800000000000', '1.2.3', 'abc', '.5', '5.']) {
    assert.equal(parseAmount(raw).ok, false, `expected ${JSON.stringify(raw)} to be refused`);
  }
});

test('a negative price is refused with a message that says what to do', () => {
  const result = parseAmount('-100');
  assert.equal(result.ok, false);
  assert.match(result.error, /cannot be negative/u);
});

test('the 12-digit limit of numeric(12,2) is enforced before the database sees it', () => {
  assert.equal(parseAmount('999999999999').ok, true);
  assert.equal(parseAmount('1000000000000').ok, false);
});

test('parseQuantity keeps zero as a real answer but refuses a fraction', () => {
  assert.deepEqual(parseQuantity('0', { required: true }), { ok: true, value: 0 });
  assert.equal(parseQuantity('2.5').ok, false);
  assert.equal(parseQuantity('', { required: true }).ok, false);
  assert.deepEqual(parseQuantity('', { required: false }), { ok: true, value: null });
  assert.equal(parseQuantity('-1').ok, false);
  assert.equal(parseQuantity('2000000').ok, false);
});

test('a missing price is never displayed as zero', () => {
  assert.equal(formatNairaOr(null), 'Price on request');
  assert.equal(formatNairaOr(''), 'Price on request');
  assert.equal(formatNairaOr(undefined), 'Price on request');
  assert.equal(formatNairaOr('0'), `${NAIRA_SIGN}0`);
});
