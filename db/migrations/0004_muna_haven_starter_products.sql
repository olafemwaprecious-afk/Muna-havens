-- ============================================================================
-- Muna's Haven — 0004: STARTER CATALOGUE (SEED)
-- ============================================================================
-- Scope   : the approved Version 1 records — 2 categories, 3 products, and the
--           public storefront settings row.
-- Safety  : idempotent and non-destructive. ON CONFLICT DO NOTHING means
--           re-running this file can never overwrite an edit Muna already made
--           in the dashboard.
--
-- What is deliberately NOT here, because it was never confirmed:
--   * hair length, density, lace type, origin or cap construction
--   * metal type, plating, stone authenticity or durability for either set
--   * any stock quantity or variant availability
--   * delivery fees, zones or timelines
-- Those columns exist and are editable by the owner; they are simply left at
-- "not confirmed", which is what the public page then says.
--
-- Prices are the approved listing figures: 28000.00, 3500.00, 5500.00 naira.
-- They are stored as numeric, not as formatted text.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Storefront settings (single row, id = 1)
-- ---------------------------------------------------------------------------
insert into public.mh_store_settings (
  id,
  business_name,
  whatsapp_number,
  public_description,
  delivery_notice,
  referral_notice
)
values (
  1,
  'Muna’s Haven',
  '+2347018733485',
  'A small, considered edit of hair and jewellery — pieces chosen for everyday elegance and for occasions that deserve a little more shine.',
  'Delivery: Coming soon.',
  'Referral programme: Coming soon.'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
insert into public.mh_product_categories (slug, name, description, display_order)
values
  ('hair', 'Hair', 'Wigs, closures and hair pieces.', 10),
  ('jewellery', 'Jewellery', 'Statement sets and finishing pieces.', 20)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
-- image_url points at a project-authored placeholder, so the starter
-- catalogue has no third-party licence obligation. Each row is marked
-- image_is_illustrative = true and carries a source label the storefront
-- displays next to the image, so no visitor can mistake it for stock
-- photography. Replace it from the dashboard: Products -> Edit -> Image.
insert into public.mh_products (
  reference,
  name,
  slug,
  description,
  price,
  currency,
  category_id,
  status,
  availability,
  stock_mode,
  image_url,
  image_alt,
  image_is_illustrative,
  image_source_label,
  image_licence_note,
  is_featured,
  is_new_arrival,
  first_seen_at,
  published_at
)
select
  v.reference,
  v.name,
  v.slug,
  v.description,
  v.price::numeric(12,2),
  'NGN',
  (select id from public.mh_product_categories c where c.slug = v.category_slug),
  'published',
  'unknown',
  'untracked',
  v.image_url,
  v.image_alt,
  true,
  'Illustrative placeholder — not a photograph of this item',
  'Project-authored artwork. No third-party licence or attribution applies.',
  v.is_featured,
  true,
  now(),
  now()
from (values
  (
    'MH-HAIR-001',
    'Pure Human Hair — Full Bob Closure',
    'pure-human-hair-full-bob-closure',
    'A full bob closure, listed here while the authentic product photographs and confirmed specifications are prepared. Length, density, cap construction and lace details are published only once Muna has confirmed them — ask on WhatsApp for the current information on this piece.',
    '28000.00',
    'hair',
    'assets/img/placeholder-wig.svg',
    'Illustrative line drawing of a full bob wig on a stand, in the Muna’s Haven palette',
    true
  ),
  (
    'MH-JEW-001',
    'Ladies Set with Ring',
    'ladies-set-with-ring',
    'A ladies’ set that includes a matching ring. Metal, finish and stone details are not published here because they have not been confirmed; ask Muna on WhatsApp and she will answer for the exact piece in stock.',
    '3500.00',
    'jewellery',
    'assets/img/placeholder-jewellery-set.svg',
    'Illustrative line drawing of a necklace and ring set in the Muna’s Haven palette',
    false
  ),
  (
    'MH-JEW-002',
    'Diamond Ball Set',
    'diamond-ball-set',
    'Perfect for Owambe, wedding guests, dinner, church, and that rich-aunty look.',
    '5500.00',
    'jewellery',
    'assets/img/placeholder-diamond-ball-set.svg',
    'Illustrative line drawing of a sparkling ball-stone jewellery set in the Muna’s Haven palette',
    true
  )
) as v(
  reference, name, slug, description, price, category_slug, image_url, image_alt, is_featured
)
on conflict (reference) do nothing;

commit;

-- ============================================================================
-- Expected result after running (verify, do not assume):
--   categories 2 · published products 3 · settings rows 1
--
--   select (select count(*) from public.mh_product_categories) as categories,
--          (select count(*) from public.mh_products where status = 'published') as published,
--          (select count(*) from public.mh_store_settings) as settings;
--
-- A price change made later in the dashboard updates this same row, so the
-- catalogue card, the product page, the featured rail and the WhatsApp message
-- all move together — there is no second copy of the price anywhere.
-- ============================================================================
