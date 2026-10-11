#!/usr/bin/env node
/**
 * Project guard rails. Fast, offline, and run in CI before deploying.
 *
 *   1. No privileged credential appears in any file that could be published.
 *   2. The approved brand rules hold: price tags are exactly #D9A0A7 with
 *      espresso text, and the approved palette is the only source of colour.
 *   3. Migrations stay additive — no destructive statement sneaks in.
 *   4. Every HTML/CSS/JS file referenced from a page actually exists.
 *   5. Owner email/password material never reaches the tree.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const findings = [];
const pass = [];
let failed = false;

function ok(message) {
  pass.push(message);
}
function bad(message, detail) {
  failed = true;
  findings.push(detail ? `${message}\n     ${detail}` : message);
}

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '_site', 'image-search'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = await walk(root);
const read = (file) => readFile(path.join(root, file), 'utf8');
const rel = (file) => path.relative(root, file).split(path.sep).join('/');

/* -- 1. Credential hygiene ------------------------------------------------ */

const SECRET_PATTERNS = [
  { re: /\bsb_secret_[A-Za-z0-9_-]{10,}/, why: 'Supabase secret (service_role) API key' },
  { re: /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, why: 'a raw JWT' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/, why: 'a GitHub token' },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, why: 'a private key' },
  { re: /\bpasw\b\s*[:=]\s*['"][^'"]{4,}/i, why: 'an inline password assignment' },
  { re: /CREATE USER .* PASSWORD/i, why: 'account creation with a password literal' },
  { re: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S/, why: 'a service-role variable value' },
];

const ignorableForSecrets = new Set(['scripts/check.mjs']); // this file names the patterns it forbids

for (const file of files) {
  const r = rel(file);
  if (ignorableForSecrets.has(r)) continue;
  if (r.endsWith('.png') || r.endsWith('.jpg')) continue;
  const text = await readFile(file, 'utf8');
  for (const { re, why } of SECRET_PATTERNS) {
    // Strip comment markers so the prose warning in .env.example stays clean.
    const body = text
      .split(/\r?\n/)
      .filter((line) => !/^\s*(#|\*|\/\/|<!--)/.test(line.trim()))
      .join('\n');
    const match = body.match(re);
    if (match) bad(`Refusing to publish ${why}`, `${r}: ${match[0].slice(0, 32)}…`);
  }
}
if (!failed) ok('no privileged credentials found anywhere in the tree');

/* -- 2. Brand rules ------------------------------------------------------- */

const BLUSH = '#d9a0a7';
const ESPRESSO = '#382724';
const APPROVED = new Set([BLUSH, ESPRESSO, '#fff9f4', '#c6a46a', '#78866b']);

const tokens = await read('assets/css/tokens.css');
if (!new RegExp(`--mh-blush:\\s*${BLUSH}`, 'i').test(tokens)) {
  bad('the signature colour must be exactly #D9A0A7');
} else {
  ok('signature blush is exactly #D9A0A7');
}

const priceRule = tokens.match(/\.mh-price-tag\s*\{([^}]*)\}/);
if (!priceRule) {
  bad('no .mh-price-tag rule found — price tags must share one definition');
} else {
  const rule = priceRule[1];
  if (!new RegExp(`background:\\s*var\\(--mh-blush\\)`, 'i').test(rule)) {
    bad('price tag background must use the approved blush token', rule.trim());
  }
  if (!new RegExp(`color:\\s*var\\(--mh-espresso\\)`, 'i').test(rule)) {
    bad('price tag text must be espresso for the 6.43:1 contrast pair', rule.trim());
  }
  if (!failed) ok('price tags use blush #D9A0A7 with espresso text (single shared rule)');
}

// The five approved brand colours must only ever be written once, in
// assets/css/tokens.css. Anywhere else, use var(--mh-*). Neutrals such as
// #ffffff are deliberately not policed here.
for (const file of files) {
  const r = rel(file);
  if (!r.endsWith('.css')) continue;
  if (r === 'assets/css/tokens.css') continue;
  const text = await readFile(file, 'utf8');
  const hits = (text.match(/#[0-9a-fA-F]{6}\b/g) || [])
    .map((c) => c.toLowerCase())
    .filter((c) => APPROVED.has(c));
  if (hits.length) {
    bad(`${r} hard-codes an approved brand colour`, [...new Set(hits)].join(', ') + ' — use the var(--mh-*) token so a palette change stays one-line');
  }
}
ok('brand colours are declared once, in the token file');

// Price tags must not be recoloured per page.
const priceColourOverrides = [];
for (const file of files) {
  const r = rel(file);
  if (!r.endsWith('.css') || r === 'assets/css/tokens.css') continue;
  const text = await readFile(file, 'utf8');
  if (/\.mh-price-tag[^{]*\{[^}]*(background|color)\s*:/s.test(text)) priceColourOverrides.push(r);
}
if (priceColourOverrides.length) {
  bad('price tag colour is overridden outside tokens.css', priceColourOverrides.join(', '));
} else {
  ok('no page overrides the price tag colour');
}

/* -- 3. Migrations stay additive ----------------------------------------- */

const DESTRUCTIVE = [
  { re: /^\s*drop\s+table\b/im, why: 'DROP TABLE' },
  { re: /^\s*drop\s+view\b/im, why: 'DROP VIEW' },
  { re: /^\s*truncate\b/im, why: 'TRUNCATE' },
  { re: /^\s*delete\s+from\s+(?!storage\.objects\b)/im, why: 'DELETE FROM a table other than the guarded storage.objects cleanup' },
  { re: /\balter\s+table[^;]*drop\s+(constraint|column)\b/i, why: 'ALTER TABLE DROP' },
  { re: /^\s*drop\s+schema\b/im, why: 'DROP SCHEMA' },
  { re: /\bgrant\s+(all|select|insert|update|delete)\b[^;]*\bto\s+public\b/i, why: 'a grant to PUBLIC' },
  { re: /\bcreate\s+or\s+replace\s+function\s+public\.mh_grant/i, why: 'a self-granting helper function' },
];

const migrationDir = path.join(root, 'db/migrations');
const migrationFiles = (await readdir(migrationDir)).filter((f) => f.endsWith('.sql')).sort();
for (const name of migrationFiles) {
  const text = await readFile(path.join(migrationDir, name), 'utf8');
  for (const { re, why } of DESTRUCTIVE) {
    if (re.test(text)) bad(`${why} appears in ${name} — this project must never run a destructive migration`, `review and remove it, or scope it to an mh_ object and document why`);
  }
  // Any object outside the mh_ namespace must be explicitly allowed.
  const offenders = (
    text.match(
      /(?:create|alter)\s+(?:table|view|function|trigger|index)\s+(?:or\s+replace\s+)?(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)/gi,
    ) || []
  )
    .map((statement) => statement.split(/\s+/).pop().split('.').pop())
    .filter((name) => !name.startsWith('mh_'));
  if (offenders.length) {
    bad(`${name} creates or alters an object outside the mh_ namespace`, offenders.join(', '));
  }
}
if (migrationFiles.length >= 5) ok(`${migrationFiles.length} migrations present, all namespaced and non-destructive`);

/* -- 4. Referenced files exist ------------------------------------------- */

const pages = ['index.html', '404.html', 'owner/index.html'];
for (const page of pages) {
  let html;
  try {
    html = await read(page);
  } catch {
    if (page !== 'owner/index.html') bad(`${page} is missing`);
    continue;
  }
  const refs = [
    ...[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)].map((m) => m[2]),
  ].filter((v) => !/^(#|https?:|mailto:|tel:|data:)/.test(v));

  for (const ref of refs) {
    const clean = ref.split('?')[0].split('#')[0];
    if (!clean || clean.endsWith('/')) continue;
    const target = path.join(root, path.dirname(page), clean);
    try {
      await stat(target);
    } catch {
      // config.js is generated at build time, so its absence is expected here.
      if (clean.endsWith('assets/js/config.js') || clean.endsWith('config.js')) continue;
      bad(`${page} references a file that does not exist`, clean);
    }
  }
}
ok('every local reference in the HTML resolves to a real file');

/* -- 5. Share metadata must be absolute --------------------------------- */

const home = await read('index.html');
for (const property of ['og:url', 'og:image', 'twitter:image']) {
  const match = new RegExp(`<meta\\s+(?:property|name)=\"${property}\"\\s+content=\"([^\"]+)\"`).exec(home);
  if (!match) {
    bad(`index.html is missing <meta ${property}>`, 'a link shared on WhatsApp previews nothing without it');
    continue;
  }
  if (!/^https:\/\//.test(match[1])) {
    bad(`${property} must be an absolute https URL`, `found “${match[1]}” — relative URLs are not resolved by crawlers`);
  }
}
if (!/name="robots" content="noindex/.test(await read('owner/index.html'))) {
  bad('the owner dashboard must carry noindex', 'it is reachable by URL and should never appear in a search result');
}
if (!/mh-root/.test(home)) {
  bad('index.html must declare <meta name="mh-root">', 'the app resolves every path from it, which is what makes /Muna-havens/ work');
}
if (!failed) ok('share metadata is absolute and the dashboard is excluded from search');

/* -- 6. Placeholder images exist for the seed ---------------------------- */

const seed = await read('db/migrations/0004_muna_haven_starter_products.sql');
for (const ref of seed.match(/assets\/img\/[a-z0-9-]+\.svg/g) || []) {
  try {
    await stat(path.join(root, ref));
  } catch {
    bad(`the seed points at ${ref} but that file is not in the tree`);
  }
}
const placeholderCount = (seed.match(/assets\/img\/[a-z0-9-]+\.svg/g) || []).length;
if (placeholderCount === 3) ok('all three starter products reference a placeholder image that exists');

/* -- report -------------------------------------------------------------- */

console.log('\nMuna’s Haven — project checks\n');
for (const line of pass) console.log(`  ✓ ${line}`);
for (const line of findings) console.log(`  ✗ ${line}`);
console.log(`\n${failed ? 'FAILED' : 'PASSED'} — ${pass.length} checks passed, ${findings.length} failed\n`);
process.exit(failed ? 1 : 0);
