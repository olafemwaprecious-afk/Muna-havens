# Muna’s Haven

A fashion and beauty catalogue with an owner dashboard. Customers browse the
catalogue, see the real price, and press a button that opens WhatsApp with the
details already written out. The owner manages products, prices, availability,
images and order records from a private dashboard.

There is no cart and no payment. An enquiry is not an order, and the site never
claims it is.

---

## What is where

```
index.html                      the storefront (one page, hash routes)
owner/index.html                the dashboard (same assets, no index)
404.html                        rescues a hand-typed path onto a hash route
assets/css/tokens.css           the whole palette, defined once
assets/css/store.css            storefront layout
assets/css/dashboard.css        dashboard layout, same tokens
assets/js/lib/                  money, WhatsApp links, routing, data layer
assets/js/pages/                the four storefront screens
assets/js/owner/                dashboard screens (products, orders, settings…)
assets/js/config.js             GENERATED at build time — not in git
assets/vendor/                  the Supabase client, vendored, with its licence
assets/data/                    preview fixtures, used only when unconfigured
assets/img/                     marks, placeholders, share cover
db/migrations/                  the database, in run order (see below)
tools/access-check.html         “is my Supabase wired up correctly?” page
scripts/                        build, local server, project checks
tests/                          85 checks, no test framework installed
docs/                           setup, handbook, security model, deferred plans
```

No bundler, no framework, no build artifacts beyond one generated file. The
browser runs exactly the source in this repository.

## Running it locally

Node 20 or newer. Nothing to install.

```bash
npm run build     # writes assets/js/config.js from .env (or into preview mode)
npm start         # serves the site at http://localhost:8080
npm run verify    # project checks + all tests
```

Without a `.env` file the site runs in **preview mode**: the demo catalogue in
`assets/data/`, with a strip across the top saying so. That is intentional — a
fresh clone should look like the shop without pretending to be the shop.

The dashboard on `http://localhost:8080/owner/` shows a sign-in screen and,
because no database is connected, one extra button: *Preview the dashboard
layout (local only)*. It renders the real interface with preview data and a
warning, and it disappears the moment the site is served from anywhere that is
not `localhost`.

## Connecting your Supabase project

Follow **[`docs/SETUP.md`](docs/SETUP.md)**. Short version:

1. Copy `.env.example` to `.env` and fill in the project URL and the
   **publishable** key. Never the secret key — see the warning in that file.
2. Run the migrations in the Supabase SQL editor, in order:

   | File | What it does |
   | --- | --- |
   | `0000_preflight_readonly.sql` | Looks at your project and reports. **Read-only.** Run this first. |
   | `0001_muna_haven_schema.sql` | Creates the `mh_` tables, rules, functions and public views. Additive and safe to re-run. |
   | `0002_muna_haven_privileges_rls.sql` | Grants and row-level security. This is the actual access control. |
   | `0003_muna_haven_storage.sql` | The image bucket and who may write to it. |
   | `0004_muna_haven_starter_products.sql` | Your three starter listings and store wording. |
   | `0005_muna_haven_verification.sql` | Runs 20-odd checks and rolls everything back. Nothing is changed. |

3. Create the owner sign-in in Supabase's dashboard, then add one row to
   `mh_app_role`. That row — not "has an account" — is what makes someone an
   owner. There is no screen for granting it, on purpose.
4. `npm run build`, then open `tools/access-check.html` on the deployed site and
   run the checks. Every line should read PASS.

Every value in the database is namespaced with `mh_`, and no migration drops,
truncates or rewrites anything that is not `mh_`. If your project hosts other
apps, they keep working.

## Deploying to GitHub Pages

`assets/js/config.js` is generated and gitignored, so the repository alone is
not publishable — something has to run the build.
`.github/workflows/deploy-pages.yml` does it: it checks, tests, builds with the
values from your **repository variables**, and uploads the result to Pages. Set
Pages → Build and deployment → **Source: GitHub Actions** and add
`SUPABASE_URL` and `SUPABASE_ANON_KEY` as variables. Details and the trade-offs
are at the top of that workflow file and in `docs/SETUP.md`.

The site lives under `/Muna-havens/`, which is why no path in the code assumes
it starts at `/`, and why routing is hash-based: GitHub Pages will not rewrite
`/product/MH-JEW-001` back to `index.html` for you, but it will serve
`#/product/MH-JEW-001` from any link, refresh or shared message.

## Rules this project does not bend

* **Prices are exact numbers.** `numeric(12,2)` in Postgres, a string across the
  API, formatted only at the last moment. No floating-point money anywhere.
* **The signature price look is defined once.** Dark espresso text on the dusty
  blush `#D9A0A7`, in `.mh-price-tag` in `assets/css/tokens.css`. A page that
  restyles it is a bug, and `npm run check` fails the build if one does.
* **Published means complete.** The database refuses to publish a product with no
  name, price, category, description or image. The form tries first, the
  database decides.
* **Nothing is trusted from the browser.** Every read and write is authorised
  again by row-level security. Hiding a button is never treated as protection.
* **Unconfirmed stays unconfirmed.** Availability defaults to “to be confirmed”,
  placeholder images are labelled as placeholders, and delivery and referrals
  say *Coming soon* until someone builds them.
* **Promotions and referrals are not in this version.** No tables, no policies,
  no half-wired buttons — see [`docs/DEFERRED-FEATURES.md`](docs/DEFERRED-FEATURES.md).

## Verified / not verified

Checked here, in this repository, and true:

* 85 tests and 9 project checks pass (`npm run verify`).
* Every module parses; every cross-module import and every HTML reference resolves.
* The pages boot in a real DOM and render priced cards, a product page, an
  honest not-listed state, and the guarded dashboard.
* Preview mode works with no credentials and no network.

**Not** verified, because it needs your Supabase project and can only be proven
there — treat these as pending until you paste the output back:

* the SQL migrations running clean against your database;
* the row-level-security refusals (`0005` and `tools/access-check.html` exist to
  prove exactly this);
* the storage bucket accepting an owner upload and refusing a stranger's;
* GitHub Pages being enabled and the deployed URL answering.

`docs/SETUP.md` ends with what to copy back if you want the results confirmed.

## Licence and asset rights

Code: private, all rights reserved. Every image is either authored for this
repository or generated for it, and each one's origin is recorded in
[`docs/IMAGE-LICENCES.md`](docs/IMAGE-LICENCES.md) — including why the three
product images are labelled placeholders rather than photographs.
