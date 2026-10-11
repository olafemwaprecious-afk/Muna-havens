# Deferred from version 1

Documented, not half-built. There are no promotion tables, no referral columns, no
inactive policies, and no disabled buttons wired to nothing. What exists is: two
inert flags on the settings row, one honest line of copy in the storefront, and a
read-only panel in the dashboard that tells the owner what is coming and what has
to be decided first.

```
mh_store_settings.features = {"promotions": false, "referrals": false, "payments": false}
```

Nothing in the app reads those flags to enable an interface. They are the shape of
the future switch, and `0001` says so in the column comment, so nobody mistakes
them for a feature that can be turned on by editing data. `tests/schema.test.mjs`
fails if a table named for a promotion, discount, coupon, referral or campaign is
ever created, which keeps this file honest as the code grows.

What the customer sees instead:

* the referral line, where a referral programme would be, reading exactly
  `Referral programme: Coming soon.` (from `mh_store_settings.referral_notice`, so
  the wording can be changed without a deploy);
* the same treatment for delivery, which is a real business question, not a
  feature.

---

## 1. Promotions and discount campaigns

**What it will be.** A dated campaign over a defined set of products, and the
discounted price shown in the same places as the price today: card, product page,
enquiry message.

**Why it is not in version 1.** A discount is a money claim. Every decision below
has to be made by the owner, not coded around:

| Decision | Why the code cannot decide it |
| --- | --- |
| Percentage off, or a fixed amount off? | A percentage on ₦3,500 and on ₦28,000 behave very differently. |
| Does any price floor exist (nothing below cost)? | Without one, a stacked or mistyped campaign can advertise a loss. |
| Is the old price shown struck through? | "Was ₦3,500, now ₦3,200" is a comparative-advertising claim. |
| Does the WhatsApp message quote the campaign price or the list price? | If the message says one and the page says the other, the argument is yours. |
| Who may create a campaign, and does it need a second pair of eyes? | A single-owner shop is fine; two staff is a different design. |
| What happens to an order recorded mid-campaign when the campaign is edited? | Snapshots again: the order must not move. |

**The shape it will take.** `mh_promotions` (name, `percent_off numeric(5,2)`
*or* `amount_off numeric(12,2)` — a check constraint forcing exactly one, both
`>= 0`, starts/ends `timestamptz`, status, `applies_to` as a category or product
list) plus a `mh_promotion_target` join table rather than a jsonb blob, so the
database can enforce that a target exists. A computed "effective price" belongs in
a view next to `mh_public_products`, not in JavaScript, so the storefront, the
dashboard and any future export cannot disagree about what the price is.

**Audit log.** `mh_promotion_audit` from the start, not added later: who created
it, when it went live, what it changed, and the row's before/after. A discount
without a record of who set it is the fastest way to an unanswerable argument.

**Order interaction.** Order lines already snapshot `unit_price`. A campaign must
reuse that mechanism: the agreed figure at the moment of recording, plus which
campaign (if any) produced it. No recompute-on-read, ever.

## 2. Referral rewards

**What it will be.** A customer shares something; a new customer mentions it; both
get something once a real order completes.

**Why it is not in version 1.** There is no way to satisfy a promise you have not
defined, and a referral programme is mostly a business decision:

* **What is the reward?** A naira amount off, a gift, or priority? An amount off
  depends on promotions existing first.
* **When is it earned?** On enquiry, on payment, or on delivery? On enquiry is
  farmable; on delivery is honest and needs the fulfilment status to be reliable.
* **Attribution.** With ordering by WhatsApp, the only honest attribution is "the
  new customer told us". That has to be a field on the order, not an inferred
  cookie.
* **Abuse.** One reward per new customer, none for yourself, and a cap per
  referrer. Any programme without these gets farmed, and the loss is real money.
* **Identity.** Referrals need customer identity the store does not have today:
  there is no customer table, and no orders are visible to customers.

**The shape it will take.** `mh_referral_codes` (code, owner user id or a nullable
customer reference, created_at, status), `mh_referral_invitations` (code, new
customer contact, first_seen_at), and `mh_referral_rewards` (invitation, order_id,
reward amount snapshot, granted_at, and the rule version that granted it). The
code is derived from a product-style reference so it is readable over the phone.
Rewards are granted by a `security definer` function on order completion, never
from the browser.

**What must exist first, in this order:** promotions (a reward is usually an
amount off), a completed-order signal you trust, and a decision about storing
customer contact details — which is its own privacy conversation, since today only
the owner can read `mh_orders.customer_contact`, and a referral table would widen
that.

## 3. Payment on the website

**Out of scope for version 1, and possibly for the shop.** Taking money means a
gateway, refund handling, failed-payment states, and obligations that have nothing
to do with a catalogue. The current design — the site quotes a price and a
reference, and the human agrees the rest — is a legitimate business model, not a
missing feature.

What is already in place for it: orders carry a `payment_status` that moves
independently of fulfilment, an order's total is derived rather than typed, and no
price anywhere in the schema is `float`, so a payment amount could be reconciled
against a stored figure exactly. If payments ever arrive, they arrive as a new
table of attempts and settlements, not as a `paid boolean` on `mh_orders`.

## 4. Smaller things deliberately left out

* **Search across archived/draft content.** A shopper must never learn that a
  retired piece exists.
* **A "sold" count or scarcity counter.** Nothing in the data supports it, and
  inventing one is a claim.
* **Customer reviews.** They need moderation and an identity model; a shop with
  three listings does not need them yet.
* **Multi-currency.** `currency char(3)` with a check constraint pinned to `NGN`
  is already in every money column, so a second currency is a data change rather
  than a rewrite of every price path — and no half-finished currency switcher ships.
* **A public order-status page.** It would need customer authentication, which this
  version does not have.

## How to pick any of this up

1. Read the decision table for the feature and write the answers down first.
2. Add a migration `0006_…` that is additive and namespaced `mh_`, plus its grants
   and `mh_`-prefixed policies in the same style as `0002`.
3. Add the refusal tests to `0005_muna_haven_verification.sql` **before** the
   feature works, then make them pass.
4. Extend `tools/access-check.html` with the new refusal you expect a stranger to
   hit.
5. Remove the "coming soon" copy in the same change — `referral_notice` exists so
   the storefront and the launch happen together, not six weeks apart.
6. Flip the matching `features` flag last, once the code reads it.
