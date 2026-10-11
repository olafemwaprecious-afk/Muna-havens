# Image rights

Every image in this repository, where it came from, and what it may be used for.
This file exists because a shop that borrows other people's product photos has a
problem, and because "we could not verify it, so we did not use it" is an answer
that should be written down rather than remembered.

## The rule this project follows

A product image is one of three things, and which one it is must be visible in the
database record:

1. **A photograph the owner took or owns.** Normal case. `image_is_illustrative =
   false`. Record who took it and when in `image_licence_note`.
2. **A licensed image with permission on file.** Allowed only with the licence and
   the creator recorded, and it must still be labelled for the customer if it is
   not the actual item. `image_is_illustrative = true` plus a real
   `image_source_label`.
3. **A neutral placeholder that says it is a placeholder.** What the three starter
   listings use today. Never presented as the product.

Anything that cannot be placed in one of those three categories does not go in.

## What is in `assets/img/`

| File | Origin | Rights | Notes |
| --- | --- | --- | --- |
| `mark.svg` | Authored for this project | Owned by this project | The monogram mark, used as the favicon and in the dashboard header. |
| `hero-atelier.svg` | Authored for this project | Owned by this project | Decorative hero artwork; carries no product claim. |
| `placeholder-wig.svg` | Authored for this project | Owned by this project | Labelled “Illustrative image — not the actual product”. Attached to `MH-HAIR-001`. |
| `placeholder-jewellery-set.svg` | Authored for this project | Owned by this project | Same label. Attached to `MH-JEW-001`. |
| `placeholder-diamond-ball-set.svg` | Authored for this project | Owned by this project | Same label. Attached to `MH-JEW-002`. Note the filename predates the wording above; the *content* is a drawn shape, not a photograph. |
| `placeholder-product.svg` | Authored for this project | Owned by this project | The fallback a broken image URL resolves to. No product can be listed with this one. |
| `og-cover.jpg` | Generated for this project (AI image tool, single use, no source image) | No third-party rights claimed | 1200×630 (exact) social share cover, 36 KB JPEG: blush field, gold ring, espresso wordmark. It shows **no product**, which is the point — a share image must not depict a specific piece. |
| `../assets/vendor/supabase-LICENSE.txt` | The vendored Supabase client | MIT | Code, not imagery; kept beside the file it covers. |

The placeholder SVGs are deliberately not photographic: they are flat drawn
shapes on the brand's blush, so nobody can mistake them for stock photography of
a real item. `npm run check` verifies that every image the starter catalogue
references exists, and `tests/schema.test.mjs` asserts that each one still
carries its "Illustrative image — not the actual product" label, so the label
cannot be quietly dropped in a later edit.

## What was looked for, and why it is not here

Before falling back to placeholders, a search was made for genuinely licensed
photography of a human-hair bob closure and of gold-toned ladies' jewellery sets,
through open-licence channels (Wikimedia Commons and Openverse, checking each
result's licence, version and creator).

Nothing usable was found:

* the Wig and jewellery category results on Commons are historical and
  museum-context images, not clean e-commerce photography — using them would be
  odd for a customer and misleading for the product;
* Openverse results that looked right were either vendor product shots (whose
  licence belongs to the shop that made them, not to the aggregator), or
  carried no verifiable licence at all;
* a search could not be completed for the specific listing (a wig of a particular
  construction and length), because nobody publishes a licensed photo of a piece
  that has not been photographed yet.

So the honest state is: **no product photograph exists for these three listings,
and the shop says so** rather than illustrating the catalogue with someone else's
work. When real photos are taken, upload them in the dashboard, untick
"illustrative", and record the source.

## Adding your own images later

Through the dashboard: Products → pick a product → Image → choose a file. It goes
to your Supabase Storage bucket (`muna-haven-product-images`), and only owners can
write there. The storefront serves it from the public bucket path, which is why the
object itself is public — the *URL* is the access control for a shop window.

Two practical notes:

* Photograph the item yourself, on a plain background, filling the frame. No text
  written onto the image: it must stay readable when the card is a thumbnail, and a
  price burnt into a photo is a price you cannot change.
* If a customer or another business sends you a picture, that is not permission to
  publish it. Ask, and write the answer in `image_licence_note` — one sentence is
  enough, and it is worth having the day someone questions it.
