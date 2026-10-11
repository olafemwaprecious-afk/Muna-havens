/**
 * Database contract, checked from the migration text.
 *
 * Postgres is not reachable from this repository — the SQL runs in the owner's
 * own Supabase project — so these tests assert the invariants that must survive
 * every future edit. They are not a substitute for `0005_muna_haven_verification.sql`,
 * which proves the same properties against a live database; they are the guard
 * that stops someone quietly weakening one of them in a file nobody re-ran.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * Comment text is removed before matching. The migrations explain at length what
 * they refuse to do — "never float", "no density claims" — and a grep that reads
 * those sentences would fail a file for stating the rule it obeys.
 */
const strip = (sql) => sql.replace(/--[^\n]*/g, '');
const read = (file) => readFile(new URL(`../db/migrations/${file}`, import.meta.url), 'utf8');

const SCHEMA = await read('0001_muna_haven_schema.sql');
const PRIVS = await read('0002_muna_haven_privileges_rls.sql');
const STORAGE = await read('0003_muna_haven_storage.sql');
const SEED = await read('0004_muna_haven_starter_products.sql');
const VERIFY = await read('0005_muna_haven_verification.sql');
const PREFLIGHT = await read('0000_preflight_readonly.sql');

const TABLES = [...SCHEMA.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((m) => m[1]);
const VIEWS = [...SCHEMA.matchAll(/create or replace view public\.([a-z_]+)/g)].map((m) => m[1]);

test('the expected tables exist, all namespaced', () => {
  for (const name of [
    'mh_app_role',
    'mh_store_settings',
    'mh_product_categories',
    'mh_products',
    'mh_product_variants',
    'mh_orders',
    'mh_order_items',
  ]) {
    assert.ok(TABLES.includes(name), `${name} must exist`);
  }
  assert.ok(TABLES.every((t) => t.startsWith('mh_')), 'no table outside the mh_ namespace');
  assert.ok(TABLES.length >= 8, 'owner preferences belongs to the store too');
});

test('money is exact numeric and can never go negative', () => {
  assert.match(SCHEMA, /price\s+numeric\(12,2\) not null/);
  assert.match(SCHEMA, /unit_price\s+numeric\(12,2\) not null/);
  assert.match(SCHEMA, /mh_products_price_nonnegative check \(price >= 0\)/);
  assert.match(SCHEMA, /mh_order_items_price_nonnegative check \(unit_price >= 0\)/);
  assert.doesNotMatch(
    strip(SCHEMA),
    /^\s*[a-z_]+\s+(float4|float8|double precision|real)\b/im,
    'no column may use a floating-point type',
  );
});

test('currency is pinned to naira everywhere it is stored', () => {
  assert.equal([...SCHEMA.matchAll(/currency\s+char\(3\) not null default 'NGN'/g)].length >= 2, true);
  assert.match(SCHEMA, /constraint mh_products_currency check \(currency = 'NGN'\)/);
  assert.match(SCHEMA, /constraint mh_order_items_currency check \(currency = 'NGN'\)/);
});

test('product references are readable, unique and format-checked', () => {
  assert.match(SCHEMA, /reference\s+text not null/);
  assert.match(SCHEMA, /mh_products_reference_unique unique \(reference\)/);
  assert.match(SCHEMA, /\^MH-\[A-Z0-9\]\{2,8\}-\[0-9\]\{3\}\$/);
  assert.match(SCHEMA, /mh_orders_reference_format check \(order_reference ~ '\^MH-ORD-\[0-9\]\{6\}\$'\)/);
});

test('published products cannot be incomplete, by database rule not by form', () => {
  assert.match(SCHEMA, /function public\.mh_guard_publish/);
  assert.match(SCHEMA, /A published product needs a display name\./);
  assert.match(SCHEMA, /A published product needs a description\./);
  assert.match(SCHEMA, /A published product needs an image/);
  assert.match(SCHEMA, /'23514'/, 'the publish guard raises a check-violation error');
  // Reading `old` on INSERT is an error in Postgres, so the UPDATE branch owns it.
  assert.match(SCHEMA, /if tg_op = 'UPDATE'[\s\S]{0,400}old\.published_at/);
});

test('the three order axes are separate, and payment is never implied', () => {
  assert.match(SCHEMA, /order_status in \('recorded', 'confirmed', 'completed', 'cancelled'\)/);
  assert.match(SCHEMA, /payment_status in \('unpaid', 'partial', 'paid', 'refunded'\)/);
  assert.match(SCHEMA, /fulfilment_status in \(/);
  assert.doesNotMatch(SCHEMA, /payment_status.*implied/i);
});

test('order lines snapshot the name and price they were agreed at', () => {
  assert.match(SCHEMA, /product_name\s+text not null/);
  assert.match(SCHEMA, /unit_price\s+numeric\(12,2\) not null/);
  assert.match(SCHEMA, /line_total\s+numeric\(14,2\) generated always as \(quantity \* unit_price\) stored/);
});

test('stock is optional, so an unconfirmed count is representable', () => {
  assert.match(SCHEMA, /stock_mode in \('untracked', 'quantity'\)/);
  assert.match(SCHEMA, /availability in \('unknown', 'in_stock', 'low_stock', 'out_of_stock', 'made_to_order', 'discontinued'\)/);
  assert.match(SCHEMA, /mh_products_quantity_required check \(stock_mode <> 'quantity' or stock_quantity is not null\)/);
});

test('the WhatsApp number is stored in E.164 and nothing else', () => {
  assert.match(SCHEMA, /whatsapp_number\s+text\s+not null default '\+2347018733485'/);
  assert.match(SCHEMA, /\^\\\+\[1-9\]\[0-9\]\{7,14\}\$/);
});

test('every public view filters to published data', () => {
  assert.ok(VIEWS.length >= 3, `expected published views, found ${VIEWS.join(', ')}`);
  for (const view of VIEWS.filter((v) => v.includes('product'))) {
    const body = SCHEMA.slice(SCHEMA.indexOf(`view public.${view}`));
    const definition = body.slice(0, body.indexOf('\n);') > -1 ? body.indexOf('\n);') + 3 : body.length);
    if (view === 'mh_public_product_categories') {
      assert.match(definition, /is_active/);
      continue;
    }
    assert.match(definition, /status = 'published'/, `${view} must exclude drafts and archived rows`);
  }
});

test('row level security is enabled on every store table', () => {
  for (const table of TABLES) {
    assert.match(PRIVS, new RegExp(`alter table public\\.${table}\\s+enable row level security`, 'i'), `${table} must have RLS enabled`);
  }
  // The decision not to FORCE is written down, not accidental: the public views
  // read the base tables as their owner, and FORCE would bind that path.
  assert.match(PRIVS, /Why FORCE is deliberately NOT used/, 'the reason FORCE is not used is written down');
  assert.doesNotMatch(PRIVS, /alter table[^;]*force row level security/i, 'FORCE would empty the storefront');
});

test('policies are owner-scoped, named for the store, and never grant public writes', () => {
  assert.doesNotMatch(PRIVS, /to authenticated\s+using \(true\)/i);
  assert.match(PRIVS, /mh_is_owner\(\)/);
  assert.ok([...PRIVS.matchAll(/using \(public\.mh_is_owner\(\)\)/g)].length >= 6, 'most policies hinge on owner membership');
  const policies = [...PRIVS.matchAll(/create policy ([a-z_]+)/g)].map((m) => m[1]);
  assert.ok(policies.length >= 8, `expected owner policies, found ${policies.length}`);
  assert.ok(policies.every((name) => name.startsWith('mh_')), 'every policy is namespaced');
  for (const insert of PRIVS.matchAll(/create policy [a-z_]+\s+on public\.([a-z_]+)\s+for insert/g)) {
    assert.match(PRIVS.slice(insert.index, insert.index + 900), /to authenticated/);
  }
});

test('the anonymous role can read the published views and nothing else', () => {
  const grantsToAnon = [...PRIVS.matchAll(/grant select on (public\.[a-z_]+)\s+to[^;]*\banon\b/g)].map((m) => m[1]);
  assert.ok(grantsToAnon.length >= 3, 'anon must be able to read the public views');
  assert.ok(grantsToAnon.every((object) => object.includes('mh_public_')), `anon may only read public views, got ${grantsToAnon.join(', ')}`);
  assert.doesNotMatch(PRIVS, /grant (insert|update|delete)[^;]*to anon/, 'anon must never write');
});

test('there is no path for the dashboard to grant itself a role', () => {
  // `authenticated` may read its own membership row and nothing more: no write
  // grant and no write policy on the table that decides who is an owner.
  assert.doesNotMatch(PRIVS, /grant[^;]*\b(insert|update|delete|all)\b[^;]*on public\.mh_app_role[^;]*to (anon|authenticated)/i);
  assert.doesNotMatch(PRIVS, /create policy[^;]*on public\.mh_app_role[^;]*for (insert|update|delete|all)/i);
  assert.match(VERIFY, /nobody can grant themselves the owner role via the API/);
});

test('image storage is one bucket, size-limited, and owner-writable only', () => {
  assert.match(STORAGE, /'muna-haven-product-images'/);
  assert.match(STORAGE, /5242880|5 ?MiB|5242880/i, 'a 5 MB cap must be stated in SQL, not only in JS');
  assert.match(STORAGE, /image\/jpeg|image\/png|image\/webp/);
  assert.match(STORAGE, /mh_owner_insert_product_image/);
  assert.match(STORAGE, /mh_public_read_product_image/);
  assert.doesNotMatch(STORAGE, /to anon\s+using|for insert to anon/i, 'shoppers must not upload');
});

test('the starter catalogue is the three approved products, with exact prices', () => {
  const references = [...SEED.matchAll(/'(MH-[A-Z0-9]{2,8}-[0-9]{3})'/g)].map((m) => m[1]);
  for (const expected of ['MH-HAIR-001', 'MH-JEW-001', 'MH-JEW-002']) {
    assert.ok(references.includes(expected), `${expected} must be seeded`);
  }
  assert.match(SEED, /28000\.00/);
  assert.match(SEED, /'3500\.00'|3500\.00/);
  assert.match(SEED, /5500\.00/);
  assert.match(SEED, /status', 'published'|'published'/);
  assert.match(SEED, /on conflict[\s\S]{0,60}do nothing/i, 're-running the seed must be safe');
  // No digit-then-unit anywhere in the seed: length, density, weight and carat
  // claims stay out until the owner confirms them.
  assert.doesNotMatch(strip(SEED), /\d\s*(inch(es)?|mm|cm|gram(s)?|carat(s)?|density)\b/i, 'no invented specifications');
});

test('every seeded image is a labelled placeholder that exists in the repo', async () => {
  const paths = [...new Set([...SEED.matchAll(/'(assets\/img\/[a-z0-9-]+\.svg)'/g)].map((m) => m[1]))];
  assert.equal(paths.length, 3, 'three starter images');
  for (const path of paths) {
    const svg = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(svg, /Illustrative image — not the actual product/u, `${path} must say what it is`);
  }
  assert.match(SEED, /image_is_illustrative/i);
});

test('delivery and referral stay honest “coming soon” copy in the seed', () => {
  assert.match(SEED, /Delivery: Coming soon\./);
  assert.match(SEED, /Referral programme: Coming soon\./);
});

test('promotions are not half-built into the schema', () => {
  const names = [...strip(SCHEMA).matchAll(/create table if not exists public\.([a-z_]+)/g)].map((m) => m[1]);
  assert.ok(names.every((name) => !/promotion|discount|coupon|referral|campaign/.test(name)), 'no half-built promotion tables');
  assert.match(
    SCHEMA,
    /features\s+jsonb\s+not null default '\{"promotions": false, "referrals": false, "payments": false\}'::jsonb/,
  );
});

test('the verification harness is safe to run: it rolls back and asserts the refusals', () => {
  assert.match(VERIFY, /^begin;/im);
  assert.match(VERIFY, /^rollback;/im);
  assert.doesNotMatch(VERIFY, /^commit;/im, 'a verification script must not leave data behind');
  // The probes that matter are the ones that attempt something forbidden and
  // require the database to refuse. Matching on a string pattern (the first draft)
  // was silently escaping nothing at all.
  for (const probe of [/\banon\b/, /\bauthenticated\b/, /set_config\('role'/, /mh_public_products/]) {
    assert.match(VERIFY, probe, `the harness must exercise ${probe.source}`);
  }
  assert.match(VERIFY, /\*\*FAIL\*\*/, 'a check that cannot fail is not a check');
  assert.match(VERIFY, /pg_temp\.mh_report/, 'every check reports through one harness');
});

test('the preflight survey cannot change anything', () => {
  assert.match(PREFLIGHT, /^\s*select/im);
  for (const forbidden of ['insert', 'update', 'delete', 'alter', 'create', 'drop', 'grant', 'truncate']) {
    assert.doesNotMatch(
      PREFLIGHT,
      new RegExp(`^\\s*${forbidden}\\b`, 'im'),
      `preflight must not contain ${forbidden}`,
    );
  }
  assert.match(PREFLIGHT, /pg_tables|pg_class/, 'it has to look at the existing project');
});

test('no privileged credential appears in any migration', () => {
  for (const [name, sql] of [['0001', SCHEMA], ['0002', PRIVS], ['0003', STORAGE], ['0004', SEED], ['0005', VERIFY], ['0000', PREFLIGHT]]) {
    // The role name `service_role` legitimately appears in a grant; a key, a JWT,
    // a password or an account never may.
    const code = strip(sql);
    assert.doesNotMatch(code, /sb_secret_|sb_pat_|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/, `${name} must not carry a credential`);
    assert.doesNotMatch(code, /\bpassword\b\s*(=|'")/i, `${name} must not set a password`);
    assert.doesNotMatch(code, /create user|alter role[^;]*identified by/i, `${name} must not create or alter accounts`);
  }
});

test('migrations are numbered and ordered with no gaps', () => {
  const numbers = ['0000', '0001', '0002', '0003', '0004', '0005'];
  assert.deepEqual(numbers.length, 6);
  assert.match(SCHEMA, /mh_owner_preferences/);
});

/* ------------------------------------------------- documentation drift -- */

test('the owner-granting SQL in the setup guide uses real columns', async () => {
  const setup = await readFile(new URL('../docs/SETUP.md', import.meta.url), 'utf8');
  // A doc snippet that names a column the table does not have is a support ticket
  // waiting to happen, and it is exactly what an editor forgets to update.
  const inserts = [...setup.matchAll(/insert into public\.(mh_[a-z_]+) \(([^)]*)\)/gi)];
  assert.ok(inserts.length >= 1, 'the guide should show how ownership is granted');
  const columnsOf = (table) => {
    const start = SCHEMA.indexOf(`create table if not exists public.${table} (`);
    assert.notEqual(start, -1, `${table} must exist for the guide to reference it`);
    const body = SCHEMA.slice(start, SCHEMA.indexOf('\n);', start));
    return new Set(
      [...body.matchAll(/^\s{2}([a-z_]+)\s+\S/gm)].map((m) => m[1]),
    );
  };
  for (const [, table, list] of inserts) {
    for (const column of list.split(',').map((name) => name.trim())) {
      assert.ok(columnsOf(table).has(column), `docs/SETUP.md inserts into ${table}.${column}, which has no such column`);
    }
  }
});

test('the security document quotes the real ownership check', async () => {
  const doc = await readFile(new URL('../docs/SECURITY.md', import.meta.url), 'utf8');
  const quoted = /r\.user_id = \(select auth\.uid\(\)\)[\s\S]{0,40}r\.role = 'owner'/.test(doc);
  const actual = /r\.user_id = \(select auth\.uid\(\)\)[\s\S]{0,40}r\.role = 'owner'/.test(SCHEMA);
  assert.ok(actual, 'the migration must still identify the owner this way');
  assert.ok(quoted, 'docs/SECURITY.md must show the same definition, not an older one');
  assert.match(doc, /force row level security/, 'the absence of FORCE has to be documented');
  assert.match(doc, /never trusted|is never trusted/i, 'and the boundary stated plainly');
});

test('deferred features stay deferred, in the docs and in the data', async () => {
  const deferred = await readFile(new URL('../docs/DEFERRED-FEATURES.md', import.meta.url), 'utf8');
  assert.match(deferred, /mh_promotions|promotion table/i, 'the future shape is written down');
  assert.match(deferred, /audit/i, 'and so is the audit log that must come with it');
  // No migration, and no policy, mentions a promotion table.
  assert.doesNotMatch(strip(SCHEMA), /mh_promotions|mh_discount|mh_referral/i);
  assert.doesNotMatch(strip(PRIVS), /mh_promotions|mh_discount|mh_referral/i);
  assert.doesNotMatch(strip(STORAGE), /promotion|referral/i);
});
