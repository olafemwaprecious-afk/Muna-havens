/**
 * Site-root resolution, brand rules and generated files.
 *
 * Two separate worries live here. First, this project is published under a
 * GitHub Pages *project* path (`/Muna-havens/`), so every absolute link has to
 * be derived from the document rather than assumed to start at `/` — a wrong
 * guess is a blank page for every shared link. Second, the brand rules are
 * fixed by the brief and must not drift: prices are always dark espresso on the
 * signature blush, defined once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

const { siteRoot, siteOrigin, assetUrl, loadConfig } = await import('../assets/js/lib/config.js');

/**
 * Installs just enough of a browser for config.js: a document URL, an optional
 * `<meta name="mh-root">`, and an optional generated config object.
 */
function withPage({ url, meta, config }) {
  globalThis.document = {
    baseURI: url,
    querySelector: (selector) =>
      selector === 'meta[name="mh-root"]' && meta !== undefined ? { getAttribute: () => meta } : null,
  };
  globalThis.window = config ? { MUNA_HAVEN_CONFIG: config } : undefined;
}

test('the project path is kept when the site root is derived from the page', () => {
  withPage({ url: 'https://user.github.io/Muna-havens/index.html', meta: './' });
  assert.equal(siteRoot(), 'https://user.github.io/Muna-havens/');

  withPage({ url: 'https://user.github.io/Muna-havens/', meta: './' });
  assert.equal(siteRoot(), 'https://user.github.io/Muna-havens/');
});

test('the dashboard lives one level down but still points at the site root', () => {
  withPage({ url: 'https://user.github.io/Muna-havens/owner/index.html', meta: '../' });
  assert.equal(siteRoot(), 'https://user.github.io/Muna-havens/');
  assert.equal(assetUrl('assets/img/mark.svg'), 'https://user.github.io/Muna-havens/assets/img/mark.svg');
});

test('a custom domain without a project path still works', () => {
  withPage({ url: 'https://munashaven.com/', meta: './' });
  assert.equal(siteRoot(), 'https://munashaven.com/');
  assert.equal(siteOrigin(), 'https://munashaven.com');
});

test('localhost preview resolves the same way, so development mirrors deployment', () => {
  withPage({ url: 'http://localhost:8080/Muna-havens/', meta: './' });
  assert.equal(assetUrl('assets/data/demo-products.json'), 'http://localhost:8080/Muna-havens/assets/data/demo-products.json');
});

test('absolute and data URLs pass through untouched', () => {
  withPage({ url: 'https://user.github.io/Muna-havens/', meta: './' });
  assert.equal(assetUrl('https://x.supabase.co/storage/v1/object/public/b/f.jpg'), 'https://x.supabase.co/storage/v1/object/public/b/f.jpg');
  assert.equal(assetUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(assetUrl(''), '');
});

test('a product route is built on the site root, never on the current folder', () => {
  withPage({ url: 'https://user.github.io/Muna-havens/', meta: './' });
  const root = siteRoot();
  assert.equal(`${root}#/product/MH-JEW-002`, 'https://user.github.io/Muna-havens/#/product/MH-JEW-002');
  assert.ok(!root.includes('#'), 'the root must not carry a hash, or the route would be doubled');
});

test('missing configuration falls back to labelled demo mode', async () => {
  withPage({ url: 'https://user.github.io/Muna-havens/', meta: './', config: undefined });
  const config = loadConfig();
  assert.equal(config.mode, 'demo');
  assert.equal(config.supabaseUrl, null);
  assert.ok(config.reason, 'the reason is stated, so the pill on screen can explain itself');
});

test('a half-filled configuration is treated as unconfigured, not as live', () => {
  withPage({ url: 'https://user.github.io/Muna-havens/', meta: './', config: { supabaseUrl: 'https://ref.supabase.co', supabaseAnonKey: '' } });
  assert.equal(loadConfig().mode, 'demo');
});

test('a complete configuration is reported as live', () => {
  withPage({
    url: 'https://user.github.io/Muna-havens/',
    meta: './',
    config: { supabaseUrl: 'https://ref.supabase.co', supabaseAnonKey: 'sb_publishable_abc', realtime: true, siteUrl: 'https://user.github.io/Muna-havens/' },
  });
  const config = loadConfig();
  assert.equal(config.mode, 'supabase');
  assert.equal(config.realtime, true);
  assert.equal(config.siteUrl, 'https://user.github.io/Muna-havens');
});

/* ------------------------------------------------------------------ brand -- */

test('the signature blush and espresso pair is defined once, on the price tag', async () => {
  const tokens = await read('assets/css/tokens.css');
  assert.match(tokens, /--mh-blush:\s*#d9a0a7/i);
  assert.match(tokens, /--mh-espresso:\s*#382724/i);
  const rule = /--mh-price-tag-bg:\s*var\(--mh-blush\)/.test(tokens)
    ? 'tokenised'
    : /\.mh-price-tag\s*\{[^}]*background:\s*var\(--mh-blush\)/.test(tokens)
      ? 'direct'
      : null;
  assert.ok(rule, 'the price tag must take its background from the blush token');
  assert.match(tokens, /\.mh-price-tag\s*\{[^}]*color:\s*var\(--mh-espresso\)/);
});

test('no stylesheet redefines the price tag anywhere else', async () => {
  for (const file of ['assets/css/store.css', 'assets/css/dashboard.css']) {
    const css = await read(file);
    assert.doesNotMatch(css, /\.mh-price-tag[^{]*\{[^}]*(background|color)\s*:/s, `${file} must not restyle price tags`);
  }
});

test('the palette stays inside the approved set', async () => {
  const tokens = await read('assets/css/tokens.css');
  for (const hex of ['d9a0a7', '382724', 'c6a46a', '78866b']) {
    assert.ok(tokens.toLowerCase().includes(`#${hex}`), `#${hex} must be a declared token`);
  }
});

/* ------------------------------------------------------- shipped documents -- */

test('the storefront shell declares its root and its absolute share metadata', async () => {
  const html = await read('index.html');
  // Attribute order and line wrapping are the formatter's business, so these
  // match on the pair of attributes that must coexist in one tag.
  assert.match(html, /<meta[^>]*name="mh-root"[^>]*content="\.\/"/);
  assert.match(
    html,
    /<meta[^>]*property="og:url"[^>]*content="https:\/\/olafemwaprecious-afk\.github\.io\/Muna-havens\/"/,
    'og:url must be absolute and include the project path',
  );
  assert.match(
    html,
    /<meta[^>]*property="og:image"[^>]*content="https:\/\/olafemwaprecious-afk\.github\.io\/Muna-havens\/assets\/img\/og-cover\.jpg"/,
    'the share image must be an absolute URL, or WhatsApp shows no picture',
  );
  assert.match(html, /<meta[^>]*name="twitter:card"[^>]*content="summary_large_image"/);
  assert.match(html, /<noscript>/, 'a visitor without JavaScript still gets an explanation');
  assert.match(html, /assets\/js\/config\.js/, 'the generated config is loaded before the app module');
});

test('the dashboard opts out of search indexing and declares the parent root', async () => {
  const html = await read('owner/index.html');
  assert.match(html, /<meta name="robots" content="noindex, nofollow"\s*\/>/);
  assert.match(html, /<meta name="mh-root" content="\.\.\/"\s*\/>/);
});

test('404.html rescues a hand-typed clean path onto a hash route', async () => {
  const html = await read('404.html');
  assert.match(html, /location\.replace/);
  assert.match(html, /#\/not-found|'#\/'/, 'it must land somewhere the app understands');
});

test('the generated config file is ignored, and the template documents what is forbidden', async () => {
  const ignored = await read('.gitignore');
  assert.match(ignored, /assets\/js\/config\.js/);
  assert.match(ignored, /\.env/);
  const example = await read('.env.example');
  assert.match(example, /SUPABASE_URL=/);
  assert.match(example, /SUPABASE_ANON_KEY=/);
  assert.match(example, /service_role|secret/i, 'the example has to warn against the privileged key');
});

test('build output and vendored library are not treated as source', async () => {
  const ignored = await read('.gitignore');
  assert.match(ignored, /_site\//);
  const license = await read('assets/vendor/supabase-LICENSE.txt');
  assert.match(license, /MIT/u, 'the vendored client keeps its licence text');
});
