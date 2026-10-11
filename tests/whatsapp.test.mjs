/**
 * WhatsApp link construction — the single highest-stakes piece of pure logic in
 * the project, because a broken link is a lost sale that nobody notices.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUSINESS_WHATSAPP,
  normaliseWhatsAppNumber,
  validWhatsAppNumber,
  buildOrderMessage,
  buildWhatsAppLink,
  buildGeneralEnquiryLink,
  productEnquiry,
} from '../assets/js/lib/whatsapp.js';

const APPROVED_DIGITS = '2347018733485';

test('the approved business number is the one from the brief, digits only in the URL', () => {
  assert.equal(BUSINESS_WHATSAPP, '+2347018733485');
  const link = buildGeneralEnquiryLink(BUSINESS_WHATSAPP);
  assert.match(link.url, new RegExp(`^https://wa\\.me/${APPROVED_DIGITS}\\?text=`));
  assert.ok(!link.url.includes('%2B'), 'the plus sign must not appear in the wa.me path');
});

test('local and international spellings all normalise to the same digits', () => {
  for (const raw of ['+2347018733485', '2347018733485', '07018733485', '0701 873 3485', '+234 701 873 3485', '(0701) 873-3485']) {
    assert.equal(normaliseWhatsAppNumber(raw), APPROVED_DIGITS, `expected ${raw} to normalise`);
  }
});

test('a number already in international form is not rewritten', () => {
  assert.equal(normaliseWhatsAppNumber('2348012345678'), '2348012345678');
  // A leading zero is only replaced for an 11-digit local Nigerian number.
  assert.equal(normaliseWhatsAppNumber('002347018733485'), '002347018733485');
});

test('unusable numbers are refused instead of producing a broken link', () => {
  for (const raw of ['', null, undefined, 'not-a-number', '12345', '0701873348512345678']) {
    assert.equal(validWhatsAppNumber(raw), null, `expected ${String(raw)} to be refused`);
    assert.equal(buildGeneralEnquiryLink(raw), null, `expected no link for ${String(raw)}`);
  }
});

test('the message is percent-encoded so the naira sign, newlines and dashes survive', () => {
  const link = productEnquiry(
    { name: 'Pure Human Hair — Full Bob Closure', reference: 'MH-HAIR-001', category_name: 'Hair' },
    { number: BUSINESS_WHATSAPP, priceLabel: '₦28,000', productUrl: 'https://example.test/Muna-havens/#/product/MH-HAIR-001' },
  );
  assert.ok(link, 'a valid product must produce a link');
  assert.ok(link.url.includes('%E2%82%A628%2C000'), '₦28,000 must be encoded, not raw');
  assert.ok(link.url.includes('%0A'), 'line breaks must be encoded');
  assert.ok(!link.url.includes('₦'), 'no raw naira sign may sit in the query string');
  assert.ok(link.url.includes('MH-HAIR-001'));
});

test('the prefilled message carries everything needed to answer without asking', () => {
  const message = buildOrderMessage(
    { name: 'Ladies Set with Ring', reference: 'MH-JEW-001', price: '3500.00', category_name: 'Jewellery' },
    { priceLabel: '₦3,500', availabilityLabel: 'Availability to be confirmed', variantLabel: 'Size: Medium', productUrl: 'https://example.test/#/product/MH-JEW-001', businessName: "Muna's Haven" },
  );
  assert.match(message, /Hello Muna's Haven!/);
  assert.match(message, /Product: Ladies Set with Ring/);
  assert.match(message, /Product Reference: MH-JEW-001/);
  assert.match(message, /Listed Price: ₦3,500/);
  assert.match(message, /Availability shown: Availability to be confirmed/);
  assert.match(message, /Selected option: Size: Medium/);
  assert.match(message, /Product Link: https:\/\/example\.test/);
  assert.match(message, /Please confirm availability/);
});

test('a missing optional field is omitted rather than printed as empty or undefined', () => {
  const message = buildOrderMessage({ name: 'Diamond Ball Set', reference: 'MH-JEW-002' }, { priceLabel: '' });
  assert.ok(!/Listed Price:/.test(message), 'no price line when there is no price label');
  assert.ok(!/undefined|null/.test(message), 'never leak a placeholder value into a customer message');
  assert.ok(!/Selected option/.test(message));
});

test('a product without a name still reads like a person wrote it, never the word undefined', () => {
  const message = buildOrderMessage({ reference: 'MH-JEW-002' });
  assert.ok(!/undefined/.test(message), 'a placeholder value must never reach a customer message');
  assert.match(message, /Product Reference: MH-JEW-002/);
  assert.ok(message.length > 40, 'the enquiry skeleton is always usable');
});

test('an order link is built from the live product record, so a price change flows through', () => {
  const product = { name: 'Pure Human Hair — Full Bob Closure', reference: 'MH-HAIR-001' };
  const before = productEnquiry(product, { number: BUSINESS_WHATSAPP, priceLabel: '₦28,000' });
  const after = productEnquiry(product, { number: BUSINESS_WHATSAPP, priceLabel: '₦25,000' });
  assert.notEqual(before.url, after.url, 'the message must not hard-code a price');
  assert.ok(after.url.includes('%E2%82%A625%2C000'));
});
