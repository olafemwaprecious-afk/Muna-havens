/**
 * End-to-end smoke tests in a real DOM.
 *
 * The unit tests prove the pieces; these prove the pages actually boot: HTML is
 * parsed, the module graph loads, the demo catalogue is fetched, and the
 * storefront renders three priced cards with a working WhatsApp link. That is
 * the shortest path to catching the failure mode every other check misses — a
 * typo in an import, an id that does not exist, a render that throws before the
 * first paint.
 *
 * jsdom is an optional dev-only dependency: with it absent the whole suite still
 * runs and these tests report as skipped, so a clone with no network is never
 * red for the wrong reason.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  JSDOM = null;
}

const skip = JSDOM ? false : 'jsdom is not installed (npm i --no-save jsdom to run the browser tests)';

/** Serves the repo over `fetch`, so the test needs no dev server and no network. */
function installFetchFromDisk() {
  globalThis.fetch = async (input) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const pathname = new URL(url, 'http://localhost:8080/').pathname;
    const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
    try {
      const body = await readFile(path.join(root, relative), 'utf8');
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => body,
        json: async () => JSON.parse(body),
      };
    } catch {
      return { ok: false, status: 404, statusText: 'Not Found', text: async () => '', json: async () => null };
    }
  };
}

let instance = 0;

async function bootPage({ html, url, hash = '' }) {
  const dom = new JSDOM(await readFile(path.join(root, html), 'utf8'), {
    url: `http://localhost:8080/${url}${hash}`,
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // The app refers to these bare (`new FormData(form)`), so they have to come
  // from the same realm as the elements they are handed: Node's global FormData
  // rejects a jsdom form outright, which looks exactly like an app bug and is not.
  for (const key of [
    'document',
    'navigator',
    'location',
    'history',
    'HTMLElement',
    'HTMLFormElement',
    'Element',
    'Node',
    'Event',
    'CustomEvent',
    'HashChangeEvent',
    'FormData',
    'CSS',
    'URL',
    'URLSearchParams',
    'Blob',
    'File',
    'getComputedStyle',
    'requestAnimationFrame',
    'matchMedia',
    'scrollTo',
  ]) {
    if (window[key] === undefined) continue;
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
  }
  globalThis.window = window;
  installFetchFromDisk();

  /**
   * Each scenario needs its own copy of the app module: the entry point captures
   * `document.getElementById(...)` while it is being evaluated, so a second test
   * reusing the cached module would paint into the first test's detached tree.
   * A fresh query string gives a fresh module graph, nothing more.
   */
  const boot = (entry) => import(`../assets/js/${entry}?v=${++instance}`);
  return { dom, window, boot };
}

const settle = (times = 12) =>
  new Promise((resolve) => {
    let n = 0;
    const tick = () => (n++ >= times ? resolve() : setTimeout(tick, 12));
    tick();
  });

test('the storefront boots, fetches the catalogue and shows priced cards', { skip }, async () => {
  const { window, boot } = await bootPage({ html: 'index.html', url: '' });
  await boot('store-app.js');
  await settle();

  // The home page repeats cards on purpose (featured rail, new arrivals, the
  // full grid), so uniqueness is measured by reference and every appearance must
  // agree — which is exactly the "one price everywhere" rule, tested.
  const cards = [...window.document.querySelectorAll('.mh-product-card')];
  const byReference = new Map();
  for (const card of cards) {
    const reference = card.getAttribute('data-reference');
    const tags = card.querySelectorAll('.mh-price-tag');
    assert.equal(tags.length, 1, 'one price tag per card, from one shared definition');
    const price = tags[0].textContent;
    assert.match(card.querySelector('a').getAttribute('href'), new RegExp(`^#/product/${reference}$`));
    if (byReference.has(reference)) {
      assert.equal(byReference.get(reference), price, `${reference} must not show two different prices`);
    }
    byReference.set(reference, price);
  }
  assert.deepEqual([...byReference.keys()].sort(), ['MH-HAIR-001', 'MH-JEW-001', 'MH-JEW-002']);
  assert.equal(byReference.get('MH-HAIR-001'), '₦28,000');
  assert.equal(byReference.get('MH-JEW-001'), '₦3,500');
  assert.equal(byReference.get('MH-JEW-002'), '₦5,500');

  // Nothing may claim a stock count the owner has not confirmed.
  const availability = [...window.document.querySelectorAll('.mh-badge')].map((n) => n.textContent);
  assert.ok(availability.includes('Availability to be confirmed'), availability.join(' | '));

  const chat = [...window.document.querySelectorAll('a[href*="wa.me"]')];
  assert.ok(chat.length >= 1, 'a WhatsApp enquiry link is present');
  for (const link of chat) {
    assert.match(link.href, /^https:\/\/wa\.me\/2347018733485\?text=/, 'the approved number, digits only');
  }

  // An unconfigured build must say so, not pretend to be the live store.
  assert.match(window.document.body.textContent, /preview|demo/iu, 'the data source is labelled on screen');
});

test('the product page renders from a hash route and keeps the price identical', { skip, concurrency: false }, async () => {
  const { window, boot } = await bootPage({ html: 'index.html', url: '', hash: '#/product/MH-JEW-002' });
  await boot('store-app.js');
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await settle(20);

  const main = window.document.getElementById('mh-main');
  const textContent = main.textContent;
  assert.match(textContent, /Diamond Ball Set/u, 'the named product is on screen');
  assert.match(textContent, /₦5,500/u, 'the price on the product page matches the card');
  assert.match(textContent, /MH-JEW-002/u, 'the reference the owner quotes is shown');
  assert.match(textContent, /Delivery: Coming soon\./u, 'the honest delivery note is printed, not invented');
  assert.match(textContent, /Referral programme: Coming soon\./u);
  const note = main.querySelector('.mh-illustrative-note');
  assert.ok(note, 'a placeholder image carries a visible note on the product page');
  assert.ok(note.textContent.trim().length > 12, `and the note says something: “${note?.textContent}”`);
  assert.match(note.textContent, /placeholder|illustrative/iu);

  const tag = main.querySelector('.mh-price-tag');
  assert.ok(tag, 'the price uses the shared tag element');
  assert.equal(tag.textContent, '₦5,500');
});

test('an unknown route tells the visitor, instead of an empty white page', { skip }, async () => {
  const { window, boot } = await bootPage({ html: 'index.html', url: '', hash: '#/product/MH-NOPE-999' });
  await boot('store-app.js');
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await settle(20);

  const main = window.document.getElementById('mh-main');
  const copy = main.textContent;
  assert.ok(copy.trim().length > 40, 'the state has real wording, not a bare heading');
  assert.match(copy, /not listed/iu, 'it says the piece is not listed');
  assert.match(copy, /MH-NOPE-999/u, 'and repeats back what was asked for, so a typo is visible');
  assert.ok(!/undefined|null/iu.test(copy), 'it never leaks a placeholder value');
  // The framing must not confirm that a hidden product exists: the shopper and a
  // nosy crawler get the same answer, which is why this is not a plain 404 page.
  assert.ok(!/has been unpublisched|is hidden|exists but/iu.test(copy));
  const links = [...main.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  assert.deepEqual(links, ['#/catalogue', '#/'], 'and offers both ways back out');
});

test('the dashboard guards a protected route, then opens the shell when authorised', { skip }, async () => {
  const { window, boot } = await bootPage({ html: 'owner/index.html', url: 'owner/' });
  const ownerApp = await boot('owner-app.js');
  await settle(20);

  // Unconfigured, so no session is possible: the login card must be what renders.
  assert.ok(window.document.querySelector('.mh-login__card'), 'an unauthenticated visitor sees sign-in, not the store data');
  const form = window.document.querySelector('.mh-login__card form');
  assert.ok(form, 'the sign-in form is a real form');
  assert.ok(window.document.querySelector('input[name="password"]')?.type === 'password', 'the password field starts masked');

  // Loopback plus no configuration is the only place a layout preview exists.
  const previewButton = [...window.document.querySelectorAll('button')].find((button) =>
    /Preview the dashboard layout/iu.test(button.textContent),
  );
  assert.ok(previewButton, 'a local preview affordance is offered off-production');
  previewButton.dispatchEvent(new window.Event('click', { bubbles: true }));
  await settle(20);

  assert.ok(window.document.querySelector('.mh-shell'), 'the dashboard shell renders');
  assert.match(window.document.querySelector('.mh-main').textContent, /no store is connected/iu, 'and it says so in the preview strip');
  assert.ok(ownerApp !== undefined);

  const nav = [...window.document.querySelectorAll('.mh-side nav a')].map((a) => a.getAttribute('href'));
  assert.deepEqual(nav, ['#/', '#/products', '#/orders', '#/settings', '#/promotions'], 'the menu covers every part of the brief');

  window.location.hash = '#/products';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await settle(20);
  const main = window.document.querySelector('.mh-main');
  assert.match(main.textContent, /Products/u);
  assert.match(main.textContent, /Pure Human Hair/u, 'the catalogue rows are listed for editing');
  assert.equal(main.querySelectorAll('button').length > 3, true, 'each row carries its actions');

  window.location.hash = '#/promotions';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await settle(20);
  const promo = window.document.querySelector('.mh-main').textContent;
  assert.match(promo, /not built|Coming soon|not switched on/iu, 'promotions are stated as absent, not faked');
  assert.match(promo, /no discount, code or reward is calculated/iu);
});

test('the product editor validates before it asks the database', { skip }, async () => {
  const { window, boot } = await bootPage({ html: 'owner/index.html', url: 'owner/' });
  await boot('owner-app.js');
  await settle(20);

  const preview = [...window.document.querySelectorAll('button')].find((b) => /Preview the dashboard layout/iu.test(b.textContent));
  assert.ok(preview, 'the local preview affordance is available off-production only');
  preview.dispatchEvent(new window.Event('click', { bubbles: true }));
  await settle(20);

  window.location.hash = '#/products/new';
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await settle(20);

  const main = window.document.querySelector('.mh-main');
  assert.match(main.textContent, /Add a product/u);
  const price = main.querySelector('#price');
  const reference = main.querySelector('#reference');
  assert.ok(price && reference, 'the form exposes a price field and a reference field');
  assert.match(reference.value, /^MH-[A-Z0-9]{2,8}-[0-9]{3}$/u, 'a reference is suggested, not left blank');

  // A nonsense price and an empty name must be caught here, with the message on
  // the field the owner has to fix — before any request leaves the device.
  price.value = '-40';
  main.querySelector('#name').value = '';
  const form = main.querySelector('form');
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await settle(10);

  const errors = [...main.querySelectorAll('.mh-error-text')].map((node) => node.textContent);
  assert.ok(errors.length >= 2, `expected field errors, saw: ${errors.join(' | ')}`);
  assert.ok(errors.some((text) => /negative/i.test(text)), 'the price error explains itself');
  assert.ok(errors.some((text) => /name/i.test(text)), 'and the name error points at the name');
  assert.equal(main.querySelector('#name').getAttribute('aria-invalid'), 'true', 'the field is marked for a screen reader');
  assert.ok(main.querySelector('#name').closest('.mh-field').contains(main.querySelector('.mh-error-text')), 'the message sits under its own field');
});
