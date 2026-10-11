# Owner handbook

How to run the shop day to day. Everything here is the dashboard at
`/owner/` on your deployed site — which is what to bookmark on your phone.

## Signing in

Your owner email and the password you set in Supabase. There is no sign-up form
and no "create account" button anywhere; that is deliberate. If you ever forget
the password, *Forgot password?* on the sign-in screen sends a reset link to that
address.

If sign-in refuses a password you are sure is right, the account exists but is
not registered as an owner — see step 4 of `docs/SETUP.md`. The message is
deliberately vague on purpose; it should not tell a stranger which emails have
accounts.

## The Overview page

Counts of what is published, in draft, out of stock, and how many orders you have
recorded. Under **Needs your attention** you will find the things only you can
fix: a published product with no photograph, a product still using a labelled
placeholder image, a draft nobody can see yet, an item marked out of stock while
still published.

Nothing on this page is invented. If the database has not been told a stock
count, the shop says "Availability to be confirmed" rather than guessing.

## Adding a product

Products → **Add a product**. Fill in the six things that matter:

1. **Reference** — the short code customers quote to you, e.g. `MH-HAIR-001`.
   The dashboard suggests the next free one. It must be unique, and it is what
   appears in the WhatsApp message, so keep it stable: if you rename a product
   next month, the reference stays.
2. **Name** — what you would call it out loud.
3. **Price** — `28000` or `28,000` both work. It is stored as an exact amount
   and displayed as ₦28,000, on the card, on the product page and in the enquiry
   message, from the one number you typed. Never edit a price by writing it in
   the description.
4. **Category** — required. If the category you need is not in the list, add it in
   Store settings first.
5. **Description** — only what you have confirmed. Length, density, cap
   construction, metal type, stone authenticity: customers read this as fact, and
   a claim you cannot honour costs more than an empty line. It is fine to write
   "ask on WhatsApp for the current details on this piece".
6. **Image** — choose a photo from your phone. JPEG, PNG or WebP, up to 5 MB.

Then **Create product**.

### Saving as a draft

Visibility defaults to *Draft — hidden from customers*. A draft is completely
invisible: not in the catalogue, not in search, not in a shared link. Set it to
**Published** when it is ready. If something is missing — no image, no
description — the database refuses the publish and tells you what is missing.
That is not the form being fussy; it is the guarantee that a customer never sees
a half-finished listing.

### Photos

A picture you took yourself is the goal. Until then, the starter products use
labelled placeholders and tick *This image is illustrative, not a photograph of
this item* — the shop then shows a clear note beside the image, so nobody orders
expecting the exact item in the picture. Untick it when you upload a real photo
of your own stock; do not untick it for a borrowed picture.

The two fields under it are for you: *image source note* is what customers see
with the image; *licence or permission record* is a private note about where the
image came from and whose permission you have. Store the truth there even when
it is only "photographed by me, 12 Oct".

Replacing an image is safe: your new photo is saved with the product first, and
only then is the old file offered for deletion — and the database refuses to
delete it if another product still points at it. Two listings sharing one photo is
normal, and nothing will silently break the other one.

## Prices, availability and stock

* **Availability shown to customers** is a short phrase with six possible values,
  from “Available to order” to “No longer stocked”. This is what a customer acts
  on, so change it when the situation changes.
* **Stock tracking** is optional. *Do not track a quantity* is the right answer
  when you keep pieces at home and count them when someone asks. Switch to *Track
  a quantity* only when you have an actual number — and then the shop will warn
  you on the Overview page once it drops to your threshold.
* Changing a price is one field. It updates the card, the product page and every
  future WhatsApp message together. It does **not** change any order you have
  already recorded (see below), which is exactly what you want.

## Options like size and colour

The Options panel adds rows such as `Size` → `14 inches`. They appear as choices
on the product page, and the customer's pick is included in their message to you.
Add only what you actually stock: an option you cannot fulfil is worse than no
option. Untick a row to keep it recorded but stop offering it.

## Archiving, deleting

* **Archive** keeps the record and hides the listing. Do this for a piece you no
  longer carry. Old links to it will show a plain "not listed at the moment" page,
  which is a better answer than an error.
* **Publish again** later if it returns.
* **Delete permanently** removes the product record. Recorded orders keep their
  own copy of the name and price, so your history stays readable — but the
  product page stops working for anyone holding the link. If you are not sure,
  archive.

## Recording an order

This is the part of "order management" that exists in this version, and it is a
record you keep, not a checkout. The sequence:

1. A customer presses *Order on WhatsApp*, and their message arrives with the
   product name, reference, the listed price, availability, their chosen option
   and the link.
2. You agree the details — quantity, agreed price, delivery or pick-up, payment.
3. Orders → **Record an order**: the reference (`MH-ORD-000001`; the dashboard
   suggests the next one), the customer's name and number if you have them, one
   line per item, and the date agreed.
4. Save. Each line keeps the name and unit price **as you recorded them**. Edit
   the catalogue price next month and this order still reads correctly, because
   history is a snapshot, not a live join.
5. Update the three status rows on the order card as things move:
   * **Order status** — Recorded → Confirmed → Completed / Cancelled.
   * **Payment status** — Payment not received → Part paid → Paid. Set this only
     when the money is actually in your account. An enquiry, a promise, or a
     screenshot someone sent you is not payment.
   * **Fulfilment status** — Not started → Packed → On its way → Delivered, or
     Collected in person.

The three move independently on purpose: a delivered order can still be unpaid,
and a paid order can still be packed. Any single "status" dropdown would force
you to lie about one of them.

There is no total field. The total is the lines added together, always, so it
cannot disagree with them.

Nothing on this screen is visible to a customer, and saving an order sends no
message to anyone. The *Reopen the conversation* link only opens WhatsApp on your
device with the number filled in.

## Store settings

The wording customers read, in one place:

* **Business name** and **shop description** — header, footer, page titles.
* **Delivery notice** — shown on every product page where a customer would
  otherwise assume a promise. Keep it as `Delivery: Coming soon.` until there is
  something accurate to say; a vague line is better than an invented one.
* **Referral programme notice** — the same idea for referrals. Leave it alone
  until the programme is actually built (see `docs/DEFERRED-FEATURES.md`).
* **WhatsApp number for enquiries** — the number every enquiry goes to. Type it
  as `0701…`, `2347…` or `+2347…`; it is stored in international form and the
  screen shows you exactly what shoppers will dial before you save.
* **Contact email / Instagram handle** — optional; blank means not shown.

**Categories** live on this page too. A product must belong to one before it can
be published, so add the category first, then the product. The *address part* is
the slug used in the catalogue filter and must be unique. A category that still
has products cannot be deleted — move them out first, which protects you from
orphaning listings by accident.

## If the dashboard says something odd

* “You are not signed in with the owner account…” — your session ended, or you
  are signed in with an address that has no owner row.
* “The database tables are not set up yet…” — a migration has not been run in
  this project.
* “That product reference is already used…” — true, and it is protecting you: two
  products with one reference means two customers quoting the same code for
  different items.
* A red bar naming a check constraint — the database refused a value; the field
  that needs fixing is highlighted on screen.
* Preview data warning across the top — the site is not connected to your
  project. Nothing you type can save. See step 6 of `docs/SETUP.md`.

## Two habits worth keeping

1. Record an order while the conversation is fresh. A week later you will not
   remember whether ₦3,200 was agreed for one set or two.
2. When you change a price, look at the shop yourself before you post the
   catalogue on WhatsApp or Instagram. The link you paste is the page a customer
   opens first, and the price in your message and on that page must be the same
   number.
