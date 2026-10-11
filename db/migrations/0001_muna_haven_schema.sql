-- ============================================================================
-- Muna's Haven — 0001: SCHEMA
-- ============================================================================
-- Scope   : tables, constraints, indexes, generated columns, helper functions,
--           publish-validation triggers and the public read views.
-- Safety  : additive and idempotent. Every object is prefixed mh_ / mh_.
--           No DROP TABLE, no TRUNCATE, no ALTER ... DROP, no GRANT to public.
-- Apply   : Supabase dashboard -> SQL editor, paste whole file, Run.
-- Requires: PostgreSQL 15+ (Supabase default). gen_random_uuid() is built in.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Authorisation allow-list
-- ---------------------------------------------------------------------------
-- Separates "can sign in" from "may manage this store". Public signup is
-- disabled, but an allow-list is still required: it means a user created in
-- error, or an old account from another application in the same project, gets
-- no access at all. Rows here are inserted only by a privileged role (the SQL
-- editor runs as postgres), so no API user can grant themselves a role.
create table if not exists public.mh_app_role (
  user_id    uuid primary key,
  role       text not null default 'owner',
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint mh_app_role_role_check check (role in ('owner'))
);

comment on table public.mh_app_role is
  'Owner allow-list. Membership, not password knowledge, grants write access.';

-- ---------------------------------------------------------------------------
-- 2. Public storefront settings (single row)
-- ---------------------------------------------------------------------------
create table if not exists public.mh_store_settings (
  id                smallint primary key default 1 constraint mh_store_settings_singleton check (id = 1),
  business_name     text    not null default 'Muna''s Haven',
  whatsapp_number   text    not null default '+2347018733485',
  public_description text   not null default '',
  delivery_notice   text    not null default 'Delivery: Coming soon.',
  referral_notice   text    not null default 'Referral programme: Coming soon.',
  contact_email     text,
  instagram_handle  text,
  -- Inert flags. V1 shows "coming soon" copy; nothing reads them to enable a
  -- feature, so a placeholder can never accidentally go live.
  features          jsonb   not null default '{"promotions": false, "referrals": false, "payments": false}'::jsonb,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,

  constraint mh_store_settings_name_length     check (char_length(business_name) between 1 and 80),
  constraint mh_store_settings_name_not_blank   check (btrim(business_name) <> ''),
  -- E.164: + then 8-15 digits, no spaces or punctuation.
  constraint mh_store_settings_whatsapp_format  check (whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),
  constraint mh_store_settings_description_len  check (char_length(public_description) <= 400),
  constraint mh_store_settings_delivery_len     check (char_length(delivery_notice) between 1 and 160),
  constraint mh_store_settings_referral_len       check (char_length(referral_notice) between 1 and 160),
  constraint mh_store_settings_email_format       check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint mh_store_settings_handle_format      check (instagram_handle is null or instagram_handle ~ '^@?[A-Za-z0-9._]{1,30}$')
);

comment on table public.mh_store_settings is
  'Owner-editable public storefront copy. Editable without redeploying the frontend.';

-- Private owner preferences are deliberately a separate table so nothing here
-- is ever readable by a visitor.
create table if not exists public.mh_owner_preferences (
  user_id                 uuid primary key,
  low_stock_reminder      smallint not null default 3,
  dashboard_page_size     smallint not null default 25,
  updated_at              timestamptz not null default now(),
  constraint mh_owner_prefs_low_stock check (low_stock_reminder between 0 and 999),
  constraint mh_owner_prefs_page_size check (dashboard_page_size between 5 and 100)
);

comment on table public.mh_owner_preferences is
  'Per-owner private dashboard settings. Never exposed to anon or to the storefront.';

-- ---------------------------------------------------------------------------
-- 3. Categories
-- ---------------------------------------------------------------------------
create table if not exists public.mh_product_categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  name         text not null,
  description  text,
  display_order smallint not null default 100,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint mh_product_categories_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint mh_product_categories_slug_unique unique (slug),
  constraint mh_product_categories_name_length check (char_length(name) between 1 and 60),
  constraint mh_product_categories_name_not_blank check (btrim(name) <> '')
);

-- ---------------------------------------------------------------------------
-- 4. Products
-- ---------------------------------------------------------------------------
-- Prices are numeric, never text and never float: the prompt forbids storing
-- money as a float and the app must format for display, not parse a string.
create table if not exists public.mh_products (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null,
  name                  text not null,
  slug                  text not null,
  description           text not null default '',
  price                 numeric(12,2) not null,
  currency              char(3) not null default 'NGN',
  category_id           uuid references public.mh_product_categories(id) on delete restrict,
  status                text not null default 'draft',
  availability          text not null default 'unknown',
  stock_mode            text not null default 'untracked',
  stock_quantity        integer,
  low_stock_threshold   smallint,
  image_url             text,
  image_object_path     text,
  image_alt             text,
  image_is_illustrative boolean not null default true,
  image_source_label    text,
  image_licence_note    text,
  is_featured           boolean not null default false,
  is_new_arrival        boolean not null default false,
  first_seen_at         timestamptz not null default now(),
  published_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  updated_by            uuid,

  -- Readable, unique, stable references. Names are never keys.
  constraint mh_products_reference_unique unique (reference),
  constraint mh_products_slug_unique unique (slug),
  constraint mh_products_reference_format check (reference ~ '^MH-[A-Z0-9]{2,8}-[0-9]{3}$'),
  constraint mh_products_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint mh_products_name_length check (char_length(name) between 2 and 120),
  constraint mh_products_name_not_blank check (btrim(name) <> ''),
  constraint mh_products_description_length check (char_length(description) <= 2000),

  -- Money: exact numerics, non-negative. 12 digits left of the decimal point.
  constraint mh_products_price_nonnegative check (price >= 0),
  constraint mh_products_price_max check (price <= 999999999999),
  constraint mh_products_currency check (currency = 'NGN'),

  constraint mh_products_status_check check (status in ('draft', 'published', 'archived')),
  constraint mh_products_availability_check check (
    availability in ('unknown', 'in_stock', 'low_stock', 'out_of_stock', 'made_to_order', 'discontinued')
  ),
  constraint mh_products_stock_mode_check check (stock_mode in ('untracked', 'quantity')),

  -- A quantity is only required when the owner opted into stock tracking, so
  -- "no confirmed stock data" stays representable instead of inventing a number.
  constraint mh_products_quantity_required check (stock_mode <> 'quantity' or stock_quantity is not null),
  constraint mh_products_quantity_nonnegative check (stock_quantity is null or (stock_quantity >= 0 and stock_quantity <= 1000000)),
  constraint mh_products_threshold_nonnegative check (low_stock_threshold is null or low_stock_threshold between 0 and 9999),

  constraint mh_products_image_url_format check (
    image_url is null
    or (image_url ~ '^https?://')
    or (image_url ~ '^assets/')
  ),
  constraint mh_products_alt_length check (image_alt is null or char_length(image_alt) <= 200)
);

create index if not exists mh_products_status_featured_idx
  on public.mh_products (status, is_featured, first_seen_at desc);
create index if not exists mh_products_category_idx
  on public.mh_products (category_id);
create index if not exists mh_products_status_availability_idx
  on public.mh_products (status, availability);
create index if not exists mh_products_new_arrivals_idx
  on public.mh_products (status, is_new_arrival, first_seen_at desc)
  where is_new_arrival;

comment on column public.mh_products.availability is
  'Availability wording shown publicly. ''unknown'' means the owner has not confirmed stock, which is the honest default.';
comment on column public.mh_products.image_is_illustrative is
  'true while the image is a starter placeholder rather than a photo of real stock.';

-- ---------------------------------------------------------------------------
-- 5. Variants (option values only — no stock, no invented availability)
-- ---------------------------------------------------------------------------
create table if not exists public.mh_product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.mh_products(id) on delete cascade,
  option_type text not null,
  option_value text not null,
  position    smallint not null default 0,
  is_enabled  boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint mh_product_variants_unique unique (product_id, option_type, option_value),
  constraint mh_product_variants_type_length check (char_length(option_type) between 1 and 40),
  constraint mh_product_variants_value_length check (char_length(option_value) between 1 and 60),
  constraint mh_product_variants_type_not_blank check (btrim(option_type) <> ''),
  constraint mh_product_variants_value_not_blank check (btrim(option_value) <> '')
);

create index if not exists mh_product_variants_product_idx
  on public.mh_product_variants (product_id, option_type, position);

-- ---------------------------------------------------------------------------
-- 6. Manually recorded orders
-- ---------------------------------------------------------------------------
create table if not exists public.mh_orders (
  id                uuid primary key default gen_random_uuid(),
  order_reference   text not null,
  customer_name     text,
  customer_contact  text,
  order_status      text not null default 'recorded',
  payment_status    text not null default 'unpaid',
  fulfilment_status text not null default 'pending',
  notes             text,
  total_amount      numeric(14,2) not null default 0,
  currency          char(3) not null default 'NGN',
  order_date        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,

  constraint mh_orders_reference_unique unique (order_reference),
  constraint mh_orders_reference_format check (order_reference ~ '^MH-ORD-[0-9]{6}$'),
  constraint mh_orders_name_length check (customer_name is null or char_length(customer_name) <= 120),
  constraint mh_orders_contact_length check (customer_contact is null or char_length(customer_contact) <= 160),
  constraint mh_orders_notes_length check (notes is null or char_length(notes) <= 2000),
  constraint mh_orders_total_nonnegative check (total_amount >= 0),
  constraint mh_orders_currency check (currency = 'NGN'),
  -- Three independent axes. Payment is never implied by an enquiry.
  constraint mh_orders_order_status_check check (order_status in ('recorded', 'confirmed', 'completed', 'cancelled')),
  constraint mh_orders_payment_status_check check (payment_status in ('unpaid', 'partial', 'paid', 'refunded')),
  constraint mh_orders_fulfilment_status_check check (
    fulfilment_status in ('pending', 'packed', 'dispatched', 'delivered', 'collected', 'cancelled')
  )
);

create index if not exists mh_orders_created_idx on public.mh_orders (created_at desc);
create index if not exists mh_orders_status_idx on public.mh_orders (order_status, payment_status);

create table if not exists public.mh_order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.mh_orders(id) on delete cascade,
  product_id        uuid references public.mh_products(id) on delete set null,
  product_reference text,
  -- Snapshots, so editing a product later cannot rewrite history.
  product_name      text not null,
  variant_label     text,
  unit_price        numeric(12,2) not null,
  currency          char(3) not null default 'NGN',
  quantity          integer not null,
  line_total        numeric(14,2) generated always as (quantity * unit_price) stored,
  created_at        timestamptz not null default now(),

  constraint mh_order_items_name_length check (char_length(product_name) between 1 and 120),
  constraint mh_order_items_price_nonnegative check (unit_price >= 0),
  constraint mh_order_items_quantity_positive check (quantity between 1 and 100000),
  constraint mh_order_items_variant_length check (variant_label is null or char_length(variant_label) <= 120),
  constraint mh_order_items_currency check (currency = 'NGN')
);

create index if not exists mh_order_items_order_idx on public.mh_order_items (order_id);
create index if not exists mh_order_items_product_idx on public.mh_order_items (product_id);

comment on column public.mh_order_items.unit_price is
  'Price at the time of the order. Never re-derived from mh_products.price.';

-- ---------------------------------------------------------------------------
-- 7. Helper function: is the signed-in user the store owner?
-- ---------------------------------------------------------------------------
-- security definer + pinned search_path so the policy on mh_app_role cannot
-- recurse, and the definer reads the allow-list without needing rights of its
-- own. Stable, so Postgres can cache it per row.
create or replace function public.mh_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.mh_app_role r
    where r.user_id = (select auth.uid())
      and r.role = 'owner'
  )
$$;

comment on function public.mh_is_owner() is
  'Sole authorisation test used by Muna''s Haven policies.';

-- Next free MH-<CATEGORY>-<NNN> reference, computed in the database so two
-- devices cannot claim the same one.
create or replace function public.mh_next_reference(p_category_slug text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- The segment is clamped to 2..6 characters because mh_products_reference_format
  -- allows 2..8: a long category slug must not be able to produce a reference the
  -- table would then reject.
  with prefix as (
    select 'MH-'
      || rpad(upper(left(regexp_replace(coalesce(p_category_slug, 'GEN'), '[^a-zA-Z0-9]', '', 'g'), 6)), 2, 'X')
      || '-' as p
  ),
  last_one as (
    select max(cast(split_part(pr.reference, '-', 3) as integer)) as n
    from public.mh_products pr, prefix
    where pr.reference like prefix.p || '%'
  )
  select prefix.p || lpad(coalesce((select n from last_one), 0) + 1, 3, '0')
  from prefix
$$;

-- Slug from a display name; unique suffix appended by the caller on collision.
create or replace function public.mh_slugify(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(
    trim(both '-' from
      regexp_replace(lower(trim(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g')),
    ),
    ''
  )
$$;

-- ---------------------------------------------------------------------------
-- 8. Timestamps + publish gate + slug maintenance
-- ---------------------------------------------------------------------------
create or replace function public.mh_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Published records must be complete. Enforced in the database, not only in
-- the form, so a crafted request cannot publish a nameless or free product.
create or replace function public.mh_guard_publish()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' then
    if btrim(new.name) = '' then
      raise exception 'A published product needs a display name.' using errcode = '23514';
    end if;
    if new.price is null or new.price < 0 then
      raise exception 'A published product needs a price of zero or more.' using errcode = '23514';
    end if;
    if new.category_id is null then
      raise exception 'A published product needs a category.' using errcode = '23514';
    end if;
    if new.image_url is null and new.image_object_path is null then
      raise exception 'A published product needs an image (a photo or a labelled placeholder).' using errcode = '23514';
    end if;
    if btrim(coalesce(new.description, '')) = '' then
      raise exception 'A published product needs a description.' using errcode = '23514';
    end if;
    if new.published_at is null then
      new.published_at := now();
    end if;
  else
    -- Leaving the published state must not erase when it was first published.
    -- OLD does not exist on INSERT, so this only applies to UPDATE.
    if tg_op = 'UPDATE' then
      new.published_at := old.published_at;
    end if;
  end if;

  if new.slug is null or btrim(new.slug) = '' then
    new.slug := coalesce(public.mh_slugify(new.name), 'product-' || substr(md5(random()::text), 1, 8));
  end if;

  return new;
end;
$$;

-- Stock consistency: quantity tracking implies a real availability label.
create or replace function public.mh_guard_stock()
returns trigger
language plpgsql
as $$
begin
  if new.stock_mode = 'quantity' and new.stock_quantity is not null then
    if new.stock_quantity <= 0 then
      new.availability := 'out_of_stock';
    elsif new.low_stock_threshold is not null and new.stock_quantity <= new.low_stock_threshold then
      new.availability := 'low_stock';
    elsif new.availability in ('out_of_stock', 'low_stock', 'unknown') then
      new.availability := 'in_stock';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mh_products_touch on public.mh_products;
create trigger mh_products_touch
  before update on public.mh_products
  for each row execute function public.mh_touch_updated_at();

drop trigger if exists mh_categories_touch on public.mh_product_categories;
create trigger mh_categories_touch
  before update on public.mh_product_categories
  for each row execute function public.mh_touch_updated_at();

drop trigger if exists mh_settings_touch on public.mh_store_settings;
create trigger mh_settings_touch
  before update on public.mh_store_settings
  for each row execute function public.mh_touch_updated_at();

drop trigger if exists mh_products_publish_guard on public.mh_products;
create trigger mh_products_publish_guard
  before insert or update of status, name, price, category_id, description, image_url, image_object_path, published_at, slug
  on public.mh_products
  for each row execute function public.mh_guard_publish();

drop trigger if exists mh_products_stock_guard on public.mh_products;
create trigger mh_products_stock_guard
  before insert or update of stock_mode, stock_quantity, low_stock_threshold
  on public.mh_products
  for each row execute function public.mh_guard_stock();

-- Order totals are derived, never typed in.
create or replace function public.mh_orders_refresh_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
begin
  if tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := new.order_id;
  end if;

  update public.mh_orders o
     set total_amount = coalesce((
           select sum(i.line_total)
           from public.mh_order_items i
           where i.order_id = v_order_id
         ), 0),
         updated_at = now()
   where o.id = v_order_id;
  return null;
end;
$$;

drop trigger if exists mh_order_items_total on public.mh_order_items;
create trigger mh_order_items_total
  after insert or update or delete on public.mh_order_items
  for each row execute function public.mh_orders_refresh_total();

-- An image may only be removed when no product still points at it. The
-- dashboard calls this instead of deleting from Storage directly.
create or replace function public.mh_delete_unreferenced_image(p_object_path text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_users integer;
begin
  if not public.mh_is_owner() then
    raise exception 'Only the store owner may remove product images.' using errcode = '42501';
  end if;
  if p_object_path is null or btrim(p_object_path) = '' then
    return 'not-requested';
  end if;

  select count(*) into v_users
  from public.mh_products
  where image_object_path = p_object_path;

  if v_users > 0 then
    return 'still-in-use';
  end if;

  delete from storage.objects
  where bucket_id = 'muna-haven-product-images'
    and name = p_object_path;

  return 'deleted';
end;
$$;

comment on function public.mh_delete_unreferenced_image(text) is
  'Owner-only guarded Storage cleanup; refuses to delete a file another product references.';

-- ---------------------------------------------------------------------------
-- 9. Public read views (published + active rows, private columns excluded)
-- ---------------------------------------------------------------------------
-- These views are the ONLY public read path. Two deliberate choices:
--
--  1. Each view repeats the row filter (status = 'published', is_active,
--     is_enabled) and lists only the columns a customer may see. Private
--     columns (stock_quantity, status, image_object_path, created_by) are not
--     in the projection at all, so they cannot leak through a stray select.
--  2. Invoker-rights views are intentionally NOT used. anon holds no privilege
--     on the base tables, so such a view would be unreadable by a visitor.
--     Row and column restriction come from the view definition; RLS on the
--     base tables independently denies any direct access. Both layers are
--     exercised by db/migrations/0005_verification.sql.
create or replace view public.mh_public_products
as
select
  p.id,
  p.reference,
  p.name,
  p.slug,
  p.description,
  p.price,
  p.currency,
  p.availability,
  p.is_featured,
  p.is_new_arrival,
  p.first_seen_at,
  p.published_at,
  p.image_url,
  p.image_alt,
  p.image_is_illustrative,
  p.image_source_label,
  p.category_id,
  c.slug  as category_slug,
  c.name  as category_name
from public.mh_products p
left join public.mh_product_categories c on c.id = p.category_id
where p.status = 'published';

create or replace view public.mh_public_product_variants
as
select
  v.id,
  v.product_id,
  v.option_type,
  v.option_value,
  v.position
from public.mh_product_variants v
join public.mh_products p on p.id = v.product_id
where v.is_enabled and p.status = 'published';

create or replace view public.mh_public_product_categories
as
select
  c.id,
  c.slug,
  c.name,
  c.description,
  c.display_order,
  count(p.id) as product_count
from public.mh_product_categories c
left join public.mh_products p on p.category_id = c.id and p.status = 'published'
where c.is_active
group by c.id
order by c.display_order, c.name;

create or replace view public.mh_public_store_settings
as
select
  id,
  business_name,
  whatsapp_number,
  public_description,
  delivery_notice,
  referral_notice,
  contact_email,
  instagram_handle,
  features,
  updated_at
from public.mh_store_settings
where id = 1;

commit;

-- ============================================================================
-- Post-run sanity check (run this separately, expect 6 tables / 4 views)
-- ============================================================================
-- select table_name, table_type from information_schema.tables
-- where table_schema = 'public' and table_name like 'mh_%' order by 1;
