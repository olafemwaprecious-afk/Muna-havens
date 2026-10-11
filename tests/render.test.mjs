/**
 * Presentation contract, checked without a browser.
 *
 * These tests exist for three reasons the brand brief is strict about:
 *   1. every price renders through the one `priceTag` definition, so the blush
 *      tag on a card is identical to the tag on a product page;
 *   2. a value from the database is never turned into markup;
 *   3. an unconfirmed stock state is stated as unconfirmed, never as a number.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

import { installDom, inspect } from './helpers/dom-shim.mjs';

before(() => {
  installDom();
});

const { priceTag, productCard, productGrid, availabilityInfo, illustrativeNote, statusFlags, AVAILABILITY_LABELS } =
  await import('../assets/js/lib/products.js');

const PRODUCT = {
  id: 'p1',
  reference: 'MH-HAIR-001',
  name: 'Pure Human Hair — Full Bob Closure',
  price: '28000.00',
  currency: 'NGN',
  description: 'A full bob closure.',
  availability: 'unknown',
  status: 'published',
  image_url: 'assets/img/placeholder-wig.svg',
  image_is_illustrative: true,
  category_name: 'Hair',
  is_featured: true,
  is_new_arrival: false,
};

function classesOf(node) {
  return String(node.className || node.getAttribute('class') || '');
}

test('a price is rendered inside the mandated price-tag element', () => {
  const tag = priceTag(PRODUCT);
  assert.match(classesOf(tag), /mh-price-tag/u);
  assert.equal(tag.textContent, '₦28,000');
  assert.equal(tag.getAttribute('aria-label'), 'Price: ₦28,000');
});

test('the same record produces the identical tag on a card and on its own', () => {
  const card = productCard(PRODUCT);
  const inCard = card.querySelectorAll('.mh-price-tag');
  assert.equal(inCard.length, 1, 'exactly one price tag per card');
  assert.equal(inCard[0].textContent, priceTag(PRODUCT).textContent);
  assert.equal(classesOf(inCard[0]).replace('mh-price-tag--lg', ''), classesOf(priceTag(PRODUCT)).replace('mh-price-tag--lg', ''));
});

test('the large variant differs only by its size modifier', () => {
  const small = classesOf(priceTag(PRODUCT));
  const large = classesOf(priceTag(PRODUCT, { size: 'lg' }));
  assert.match(large, /mh-price-tag--lg/u);
  assert.equal(large.replace(' mh-price-tag--lg', ''), small);
});

test('a price that is absent is never shown as ₦0', () => {
  const tag = priceTag({ ...PRODUCT, price: null });
  assert.equal(tag.textContent, 'Price on request');
  assert.match(classesOf(tag), /mh-price-tag/u, 'still the same element, so styling stays consistent');
});

test('availability is stated honestly and never invents a count', () => {
  assert.equal(availabilityInfo({ availability: 'unknown' }).label, AVAILABILITY_LABELS.unknown);
  assert.equal(availabilityInfo({}).tone, 'neutral');
  assert.equal(availabilityInfo({ availability: 'in_stock', stock_quantity: 7 }).label, 'Available to order');
  assert.ok(!/\d/.test(availabilityInfo({ availability: 'unknown' }).label), 'no number in an unconfirmed state');
  assert.equal(availabilityInfo({ availability: 'out_of_stock' }).tone, 'danger');
  assert.equal(availabilityInfo({ availability: 'low_stock' }).tone, 'warn');
  assert.equal(availabilityInfo({ availability: 'nonsense-value' }).label, AVAILABILITY_LABELS.unknown);
});

test('an illustrative image is labelled as such wherever it appears', () => {
  const note = illustrativeNote({ image_is_illustrative: true, image_source_label: 'Illustrative placeholder — not a photograph of this item' });
  assert.match(classesOf(note), /mh-illustrative-note/u);
  assert.match(note.textContent, /Illustrative placeholder/u);
  assert.equal(illustrativeNote({ image_is_illustrative: false }), null, 'no note for the owner’s own photograph');
  assert.match(illustrativeNote({ image_is_illustrative: true }).textContent, /not a photograph of Muna/u);
});

test('product text from the database is rendered as text, never as markup', () => {
  const hostile = {
    ...PRODUCT,
    name: '<img src=x onerror="alert(1)">',
    description: '<script>alert(2)</script>',
    reference: 'MH-JEW-001',
    image_alt: '"><b>bold</b>',
  };
  const card = productCard(hostile);
  const elements = [];
  (function walk(node) {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 1) {
        elements.push(child);
        walk(child);
      }
    }
  })(card);

  // The real claim: nothing in the tree was *created* from the stored strings.
  assert.equal(elements.filter((n) => n.localName === 'script').length, 0, 'no script element from a description');
  assert.equal(elements.filter((n) => n.localName === 'b').length, 0, 'no element from alt text');
  assert.equal(elements.filter((n) => n.localName === 'img' && n.getAttribute('src') === 'x').length, 0, 'no injected image');
  assert.ok(card.textContent.includes('<img src=x onerror="alert(1)">'), 'the literal text is still shown to the customer');
  assert.ok(inspect(card).includes('<h3'), 'and it sits inside the title element it belongs to');
});

test('a card links to the product by reference and carries the reference as data', () => {
  const card = productCard(PRODUCT);
  assert.equal(card.getAttribute('data-reference'), 'MH-HAIR-001');
  const links = card.querySelectorAll('a');
  assert.ok(links.length >= 2, 'the whole card and the title are both usable targets');
  for (const link of links) {
    assert.equal(link.getAttribute('href'), '#/product/MH-HAIR-001');
  }
});

test('flags only appear when they are set', () => {
  assert.equal(statusFlags({ is_featured: false, is_new_arrival: false }).length, 0);
  const flags = statusFlags({ is_featured: true, is_new_arrival: true });
  assert.equal(flags.length, 2);
  assert.match(flags.map((f) => f.textContent).join(' '), /Featured/u);
  assert.match(flags.map((f) => f.textContent).join(' '), /New arrival/u);
});

test('a grid wraps every card in a list role, and an empty grid is still valid', () => {
  const grid = productGrid([PRODUCT, { ...PRODUCT, reference: 'MH-JEW-001' }]);
  assert.match(classesOf(grid), /mh-grid/u);
  assert.equal(grid.querySelectorAll('.mh-product-card').length, 2);
  assert.equal(productGrid([]).childNodes.length, 0);
});

test('every availability state has a label a customer can read', () => {
  for (const [key, label] of Object.entries(AVAILABILITY_LABELS)) {
    assert.equal(availabilityInfo({ availability: key }).label, label);
    assert.ok(label.length > 3, `${key} has a real label`);
    assert.ok(!/undefined/.test(label));
  }
});
