/**
 * Route resolution.
 *
 * Hash routes are what a customer receives on WhatsApp, so a reference has to
 * survive the trip through `encodeURIComponent`, an autocorrected slash and a
 * shared link with a trailing slash.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseHash, toHash } from '../assets/js/lib/router.js';

test('the home route', () => {
  assert.equal(parseHash('').name, 'home');
  assert.equal(parseHash('#/').name, 'home');
});

test('a product deep link resolves to the product reference', () => {
  const route = parseHash('#/product/MH-HAIR-001');
  assert.equal(route.name, 'product');
  assert.equal(route.params.reference, 'MH-HAIR-001');
});

test('an encoded reference is decoded once', () => {
  assert.equal(parseHash('#/product/MH-JEW-002').params.reference, 'MH-JEW-002');
  assert.equal(parseHash(`#/product/${encodeURIComponent('MH JEW 002')}`).params.reference, 'MH JEW 002');
});

test('catalogue category and search query both parse', () => {
  const category = parseHash('#/catalogue/jewellery');
  assert.equal(category.name, 'catalogue');
  assert.equal(category.params.category, 'jewellery');

  const filtered = parseHash('#/catalogue/hair?query=bob');
  assert.equal(filtered.params.category, 'hair');
  assert.equal(filtered.query.get('query'), 'bob');

  const search = parseHash('#/search?query=wig');
  assert.equal(search.name, 'search');
  assert.equal(search.query.get('query'), 'wig');
});

test('information pages have a section and a default', () => {
  assert.equal(parseHash('#/info').params.section, 'delivery');
  assert.equal(parseHash('#/info/returns').params.section, 'returns');
});

test('anything unknown becomes an explicit not-found route, never a blank screen', () => {
  const route = parseHash('#/definitely/not/here');
  assert.equal(route.name, 'not-found');
  assert.equal(route.params.path, '/definitely/not/here');
});

test('toHash always produces a leading slash so the route is shareable', () => {
  assert.equal(toHash('/product/MH-JEW-001'), '#/product/MH-JEW-001');
  assert.equal(toHash('product/MH-JEW-001'), '#/product/MH-JEW-001');
});

test('a round trip through toHash and parseHash preserves the reference', () => {
  for (const reference of ['MH-HAIR-001', 'MH-JEW-002', 'MH-ACC-010']) {
    const path = `/product/${encodeURIComponent(reference)}`;
    assert.equal(parseHash(toHash(path)).params.reference, reference);
  }
});

test('a stray query string on a product route does not break the reference', () => {
  const route = parseHash('#/product/MH-HAIR-001?from=whatsapp');
  assert.equal(route.name, 'product');
  assert.equal(route.params.reference, 'MH-HAIR-001');
});
