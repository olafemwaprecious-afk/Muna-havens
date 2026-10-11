# Setting up the store

Aimed at being followed in one sitting, on a laptop, with your Supabase project
open in another tab. Nothing here needs the command line except two `npm run`
commands.

**Do not commit your credentials.** `.env` and the file generated from it
(`assets/js/config.js`) are gitignored for that reason. The publishable key is
public by design — it is what the browser uses — but a *secret* key in this
repository would let anyone read, change and delete everything. That is the one
mistake that cannot be fixed by deleting a commit, because the key stays in
history. If a secret key is ever pasted into a file here, rotate it in Supabase
immediately.

---

## 1. Supabase: create or reuse a project

You need the **Project URL** and the **publishable key** (Project Settings → API
→ *Project API keys*). Both start differently:

| Value | Looks like | Safe in a browser |
| --- | --- | --- |
| Project URL | `https://abcdefgh.supabase.co` | yes |
| Publishable key (anon) | `sb_publishable_…` | yes |
| **Secret key (service_role)** | `sb_secret_…` | **never** |

If your project already hosts another app, that is fine: everything here is
namespaced `mh_` and nothing drops or alters a table that is not `mh_`.

## 2. Look before you write: `0000_preflight_readonly.sql`

Supabase dashboard → **SQL Editor** → New query → paste the whole file → Run.

It contains only `SELECT`s. It answers: which tables already exist, whether any
of them are called `mh_*`, whether RLS is on, which views and functions exist,
which buckets exist, how many auth users you have, and whether PostgREST can see
the schema. Read it. If it surprises you, stop and deal with that first — it is
much easier to understand a project before anything is added to it.

## 3. Create the structure: `0001` → `0004`

Run each file on its own, whole, in this order. All four are written to be
re-runnable: `create … if not exists`, `create or replace`, drop-and-recreate of
`mh_`-named policies only, and `on conflict do nothing` on the starter data. If
one fails halfway, fix the reason and run it again.

```
0001_muna_haven_schema.sql           tables, checks, functions, triggers, views
0002_muna_haven_privileges_rls.sql   grants + row level security  ← the security
0003_muna_haven_storage.sql          the image bucket and its policies
0004_muna_haven_starter_products.sql store wording + the three starter listings
```

What `0001` guarantees, in case you ever wonder where a rule lives:

* `price numeric(12,2) not null` with `check (price >= 0)` — money is never
  text, never a float, never negative;
* `reference` unique and shaped `MH-HAIR-001` (`^MH-[A-Z0-9]{2,8}-[0-9]{3}$`), so
  a reference is a real identifier rather than a name that got renamed;
* `currency` pinned to `NGN`;
* `availability` includes `'unknown'`, which is the honest default and renders as
  “Availability to be confirmed” — the app will not invent a count;
* stock is either *untracked* or a *quantity*, and a quantity can only be
  required when you chose to track it;
* `status` is `draft`, `published` or `archived`, and a trigger refuses to publish
  anything missing a name, price, category, description or image;
* order lines store their own copy of the product name and unit price, so
  changing a price next month cannot rewrite what was agreed last month;
* the four `mh_public_*` views are what a shopper reads: published rows only,
  owner-only columns excluded (`image_licence_note`, `stock_quantity`,
  `published_at` and friends are simply not in the view).

### Why the views are not `security_invoker`

`0001` explains this at the top of the file, and it is the one design decision
here that looks unusual, so: public reads go through views that run with the
**table owner's** privileges, with an explicit `where status = 'published'`,
because anonymous users have no grant on the base tables at all. An
`security_invoker` view would be checked against `anon`'s own (empty) rights and
the catalogue would render as an empty page. The published-only guarantee
therefore comes from the `where` clause, and `0005` asserts both halves:
shoppers see published rows through the view, and are refused on the base table.

This is also why `force row level security` is deliberately **not** used: forcing
it would apply the policies to the owner path the views depend on. `0002` says so
in a comment where someone might otherwise "fix" it.

## 4. Create the owner account — and only then, make them an owner

1. Supabase dashboard → **Authentication** → **Users** → *Add user* →
   email and password, and tick *auto-confirm* so no email confirmation is needed.
   Use an address you can receive mail on, and a password you are willing to type
   on a phone.
2. Sign in is not enough. Access is membership of one table. In the SQL editor
   (this needs the dashboard, because it must be done by someone who already owns
   the data — that is why there is no button for it in the site). The table holds only
   `user_id`, `role`, `created_at` and `created_by` — no name, no email, nothing
   that would be worth stealing if the table were ever exposed:

```sql
insert into public.mh_app_role (user_id, role)
select u.id, 'owner'
from auth.users u
where u.email = '<the-address-you-just-created>'
on conflict (user_id) do update set role = 'owner';

-- Check it landed: exactly one row, and it is yours.
select u.email, r.role, r.created_at
from public.mh_app_role r
join auth.users u on u.id = r.user_id
order by r.created_at desc;
```

Replace the address, run it, and keep the SQL editor output for yourself. Two
things to know:

* **There is no screen that does this**, including in the dashboard. An owner who
  could write to `mh_app_role` could hand out ownership, so the table has a
  read-only policy for signed-in users and no write policy at all. `0005` proves
  a signed-in non-owner is refused.
* Removing an owner is the same table in reverse:
  `delete from public.mh_app_role where user_id = '<uuid>';`

If the account is ever created with *email confirmation* on, the first sign-in
must happen through the confirmation link; `mh_is_owner()` reads the session, so
an unconfirmed account that somehow holds a token still gets refused by the
policy.

## 5. Prove the database: `0005_muna_haven_verification.sql`

Paste the whole file, run it, read the output. It wraps itself in
`begin; … rollback;`, so every insert, update and delete it performs disappears
when it finishes — it can be run on a live store without disturbing a single
listing.

It reports `**PASS**` / `**FAIL**` lines covering: RLS on all eight tables;
anonymous shoppers can read the published views; anonymous reads and writes on
base tables are refused; a signed-in non-owner is refused; nobody can insert
into `mh_app_role`; a draft is invisible publicly; publishing an incomplete
product is refused; negative prices and quantities are refused; a duplicate
reference is refused; a price change on the product does not alter a recorded
order line; the price columns are `numeric` not `float`; the starter catalogue
and E.164 WhatsApp number are present; and the reference-suggesting function
refuses non-owners.

If anything reads `FAIL`, that line names the file to look at. Paste the whole
output back to whoever is helping you — it is the shortest path from "the site
isn't showing prices" to the actual cause.

## 6. Your own `.env`, then a local run

```bash
cp .env.example .env     # then edit it
npm run build            # prints which mode it generated for
npm start                # http://localhost:8080
npm run verify           # brand checks, secret scan, migration rules, tests
```

`npm run build` prints one of:

```
✓ assets/js/config.js → live Supabase project (abcdefgh.supabase.co)
✓ assets/js/config.js → no credentials found, the site will run in labelled demo mode
```

If it printed the second line while you expected the first, `.env` is empty,
mis-named, or the keys are spelled differently. The build also **refuses** to
write if a value looks like a secret key, a private key or a database URL — that
guard exists so a paste-into-the-wrong-box cannot quietly publish a credential.

Then, in the browser: open `http://localhost:8080/`, then
`http://localhost:8080/owner/`, sign in, and confirm the dashboard shows your
three starter products with prices, and that the *Preview the dashboard layout*
button is **gone** (it only exists on loopback with no configuration).

## 7. Publish it

Settings → Pages → Build and deployment → **Source: GitHub Actions**.

Settings → Secrets and variables → Actions → **New repository variable**:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | `https://abcdefgh.supabase.co` |
| `SUPABASE_ANON_KEY` | `sb_publishable_…` |
| `PUBLIC_SITE_URL` | `https://<owner>.github.io/Muna-havens/` (optional, for link previews) |
| `MUNA_REALTIME` | `1` only if you want the catalogue to try to update itself while the dashboard is open |

Push to `main` and the workflow (`.github/workflows/deploy-pages.yml`) checks,
tests, builds and publishes. It also greps the output for privileged material
and refuses to publish if it finds any.

*Why not “Deploy from a branch”?* Because the one generated file —
`assets/js/config.js` — is gitignored, so a branch deploy publishes a site with
no database reference: it renders, in preview mode, forever, and looks like a
store with three example products. If you insist on branch deploys, the honest
option is to commit a `config.js` containing the **publishable** key only, and
never the secret key. The workflow route is the one that cannot leak.

## 8. Confirm the live site

Open `https://<owner>.github.io/Muna-havens/tools/access-check.html` and press
**Run the checks** (fill the optional owner email/password box too — the
password is used for one request and never stored). Every line should be PASS;
`CHECK` means "this proves nothing yet", and `FAIL` means shoppers or your data
are not protected the way this repository assumes.

The report it produces contains only the project reference, HTTP status codes
and counts. It never contains your key, your password or a customer's details,
so it is safe to paste to someone helping you.

The checks it runs are deliberately blunt: they are plain `fetch` calls, so the
answer is a status code rather than a library's interpretation of one. A stranger
being able to `SELECT` from `mh_orders` is the failure this page exists to catch,
and it is the failure a dashboard full of hidden buttons would hide.

---

## Day-to-day, if something breaks

| Symptom | First thing to check |
| --- | --- |
| Storefront says “Preview data…” | `config.js` was not generated or is empty. Run `npm run build` locally / check the repository variables, then redeploy. |
| Storefront is empty but mode is live | The catalogue has no published products, or `0002`'s view grants are missing. `access-check.html` line 1 tells you which. |
| Sign-in says incorrect, but the password is right | The account exists but has no `mh_app_role` row. The message is deliberately vague so the screen cannot be used to discover which emails have accounts. |
| Saving a price fails with a check constraint | You typed something the database refuses — usually a negative price, or a publish with a field missing. The message names the constraint. |
| Upload fails with `42501` or “new row violates row-level security policy” | `0003` was not run, or you are signed in as an account that is not an owner. |
| Catalogue shows an image as a placeholder | The image URL is wrong or the object was deleted. The dashboard's image panel re-uploads; the storefront never breaks the grid over one missing file. |
| Everything was fine until a migration was re-run | All four are idempotent by design; `0005` rolls back. Re-run `0005` and read the PASS lines. |

## What to keep off this repository

`.env`, `assets/js/config.js`, `_site/`, `node_modules/`, any screenshot of the
Supabase dashboard, and any file containing a customer's phone number. The
gitignore covers the first four; the last one is a habit, not a setting.
