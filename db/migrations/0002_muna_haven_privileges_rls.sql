-- ============================================================================
-- Muna's Haven — 0002: PRIVILEGES AND ROW LEVEL SECURITY
-- ============================================================================
-- Scope   : grants plus explicit policies for every mh_ table and view.
-- Principle: the storefront reads ONLY through the published-only views. anon
--           holds no privilege on any base table, so a guessed table name, a
--           raw REST call or a leaked publishable key yields permission denied
--           rather than a filtered result. Writes are authorised solely by
--           mh_is_owner(), which consults mh_app_role — never by a hidden
--           button, a hash route or a claim in the browser.
-- Safety  : policy names are mh_-prefixed and created after a scoped
--           drop-if-exists, so re-running converges without touching any
--           policy belonging to another application.
-- Apply   : Supabase dashboard -> SQL editor, paste whole file, Run.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.mh_is_owner() from public;
revoke all on function public.mh_next_reference(text) from public;
revoke all on function public.mh_slugify(text) from public;
revoke all on function public.mh_delete_unreferenced_image(text) from public;

grant execute on function public.mh_is_owner() to anon, authenticated, service_role;
grant execute on function public.mh_next_reference(text) to authenticated;
grant execute on function public.mh_slugify(text) to authenticated;
grant execute on function public.mh_delete_unreferenced_image(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Table privileges
-- ---------------------------------------------------------------------------
-- The storefront identity (anon) is granted nothing on any base table. Public
-- reads reach the catalogue only through the four published-only views in 0001.
revoke all on table public.mh_products            from anon;
revoke all on table public.mh_product_categories   from anon;
revoke all on table public.mh_product_variants     from anon;
revoke all on table public.mh_store_settings       from anon;
revoke all on table public.mh_owner_preferences    from anon;
revoke all on table public.mh_app_role             from anon;
revoke all on table public.mh_orders               from anon;
revoke all on table public.mh_order_items          from anon;

-- The owner's session role. RLS below decides which rows these apply to.
grant select, insert, update, delete on public.mh_products          to authenticated;
grant select, insert, update, delete on public.mh_product_categories to authenticated;
grant select, insert, update, delete on public.mh_product_variants   to authenticated;
grant select, update                 on public.mh_store_settings     to authenticated;
grant select, insert, update         on public.mh_owner_preferences  to authenticated;
grant select                         on public.mh_app_role           to authenticated;
grant select, insert, update         on public.mh_orders            to authenticated;
grant select, insert, update, delete on public.mh_order_items       to authenticated;

-- Public read surface: the three published-only views, and nothing else.
grant select on public.mh_public_products           to anon, authenticated;
grant select on public.mh_public_product_variants    to anon, authenticated;
grant select on public.mh_public_product_categories to anon, authenticated;
grant select on public.mh_public_store_settings      to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Enable RLS on every mh_ table (and why FORCE is not used)
-- ---------------------------------------------------------------------------
alter table public.mh_products            enable row level security;
alter table public.mh_product_categories  enable row level security;
alter table public.mh_product_variants    enable row level security;
alter table public.mh_store_settings      enable row level security;
alter table public.mh_owner_preferences   enable row level security;
alter table public.mh_app_role            enable row level security;
alter table public.mh_orders              enable row level security;
alter table public.mh_order_items         enable row level security;

-- Why FORCE is deliberately NOT used:
--   * RLS is evaluated per querying role. PostgREST connects as `anon` or
--     `authenticated`; neither owns these tables, so every policy above is
--     enforced in full on every browser request. That is the entire public
--     attack surface.
--   * The four public views read the base tables with the *view owner's*
--     privileges. FORCE would subject that owner path to policies that name
--     only anon/authenticated, which risks an empty storefront. The
--     published-only guarantee for public reads therefore rests on the
--     explicit `where status = 'published'` predicate in 0001 — and 0005
--     verifies exactly that by selecting from each view as anon.
--   * If the views are ever converted to `with (security_invoker = on)`,
--     revisit FORCE at the same time; the two choices are coupled.
--   * Roles that bypass RLS here (postgres in the SQL editor, service_role)
--     are never reachable from a browser, and no credential in this project
--     can use them.

-- ---------------------------------------------------------------------------
-- 4. Catalogue policies
-- ---------------------------------------------------------------------------
-- Drop-and-recreate keeps this file re-runnable. Only mh_-named policies can
-- be dropped by it, because each statement names the policy explicitly.
drop policy if exists mh_owner_read_products on public.mh_products;
create policy mh_owner_read_products
  on public.mh_products for select to authenticated
  using (public.mh_is_owner());

drop policy if exists mh_owner_insert_products on public.mh_products;
create policy mh_owner_insert_products
  on public.mh_products for insert to authenticated
  with check (public.mh_is_owner());

drop policy if exists mh_owner_update_products on public.mh_products;
create policy mh_owner_update_products
  on public.mh_products for update to authenticated
  using (public.mh_is_owner())
  with check (public.mh_is_owner());

drop policy if exists mh_owner_delete_products on public.mh_products;
create policy mh_owner_delete_products
  on public.mh_products for delete to authenticated
  using (public.mh_is_owner());

-- No policy grants anon anything on this table. There is deliberately no
-- "public can read published rows" policy here, because public reads go
-- through mh_public_products; adding one would widen exposure for no benefit.

drop policy if exists mh_owner_read_categories on public.mh_product_categories;
create policy mh_owner_read_categories
  on public.mh_product_categories for select to authenticated
  using (public.mh_is_owner());

drop policy if exists mh_owner_write_categories on public.mh_product_categories;
create policy mh_owner_write_categories
  on public.mh_product_categories for insert to authenticated
  with check (public.mh_is_owner());

drop policy if exists mh_owner_update_categories on public.mh_product_categories;
create policy mh_owner_update_categories
  on public.mh_product_categories for update to authenticated
  using (public.mh_is_owner())
  with check (public.mh_is_owner());

drop policy if exists mh_owner_read_variants on public.mh_product_variants;
create policy mh_owner_read_variants
  on public.mh_product_variants for select to authenticated
  using (public.mh_is_owner());

drop policy if exists mh_owner_write_variants on public.mh_product_variants;
create policy mh_owner_write_variants
  on public.mh_product_variants for insert to authenticated
  with check (public.mh_is_owner());

drop policy if exists mh_owner_update_variants on public.mh_product_variants;
create policy mh_owner_update_variants
  on public.mh_product_variants for update to authenticated
  using (public.mh_is_owner())
  with check (public.mh_is_owner());

drop policy if exists mh_owner_delete_variants on public.mh_product_variants;
create policy mh_owner_delete_variants
  on public.mh_product_variants for delete to authenticated
  using (public.mh_is_owner());

-- ---------------------------------------------------------------------------
-- 5. Settings policies
-- ---------------------------------------------------------------------------
-- Only the single seeded row may be touched, and only by the owner. No insert
-- and no delete: a second settings row would be an inconsistency, not a
-- feature.
drop policy if exists mh_owner_read_store_settings on public.mh_store_settings;
create policy mh_owner_read_store_settings
  on public.mh_store_settings for select to authenticated
  using (id = 1 and public.mh_is_owner());

drop policy if exists mh_owner_update_store_settings on public.mh_store_settings;
create policy mh_owner_update_store_settings
  on public.mh_store_settings for update to authenticated
  using (id = 1 and public.mh_is_owner())
  with check (id = 1 and public.mh_is_owner());

-- Each owner reads and writes only their own preferences row.
drop policy if exists mh_owner_read_own_preferences on public.mh_owner_preferences;
create policy mh_owner_read_own_preferences
  on public.mh_owner_preferences for select to authenticated
  using (user_id = (select auth.uid()) and public.mh_is_owner());

drop policy if exists mh_owner_upsert_own_preferences on public.mh_owner_preferences;
create policy mh_owner_upsert_own_preferences
  on public.mh_owner_preferences for insert to authenticated
  with check (user_id = (select auth.uid()) and public.mh_is_owner());

drop policy if exists mh_owner_update_own_preferences on public.mh_owner_preferences;
create policy mh_owner_update_own_preferences
  on public.mh_owner_preferences for update to authenticated
  using (user_id = (select auth.uid()) and public.mh_is_owner())
  with check (user_id = (select auth.uid()) and public.mh_is_owner());

-- ---------------------------------------------------------------------------
-- 6. Orders: private by construction
-- ---------------------------------------------------------------------------
-- Customer names, phone numbers and notes are never readable through a view.
-- Deleting an order is not permitted from the app: history stays auditable,
-- cancellation is a status change.
drop policy if exists mh_owner_read_orders on public.mh_orders;
create policy mh_owner_read_orders
  on public.mh_orders for select to authenticated
  using (public.mh_is_owner());

drop policy if exists mh_owner_insert_orders on public.mh_orders;
create policy mh_owner_insert_orders
  on public.mh_orders for insert to authenticated
  with check (public.mh_is_owner());

drop policy if exists mh_owner_update_orders on public.mh_orders;
create policy mh_owner_update_orders
  on public.mh_orders for update to authenticated
  using (public.mh_is_owner())
  with check (public.mh_is_owner());

drop policy if exists mh_owner_read_order_items on public.mh_order_items;
create policy mh_owner_read_order_items
  on public.mh_order_items for select to authenticated
  using (public.mh_is_owner());

drop policy if exists mh_owner_insert_order_items on public.mh_order_items;
create policy mh_owner_insert_order_items
  on public.mh_order_items for insert to authenticated
  with check (public.mh_is_owner());

drop policy if exists mh_owner_update_order_items on public.mh_order_items;
create policy mh_owner_update_order_items
  on public.mh_order_items for update to authenticated
  using (public.mh_is_owner())
  with check (public.mh_is_owner());

drop policy if exists mh_owner_delete_order_items on public.mh_order_items;
create policy mh_owner_delete_order_items
  on public.mh_order_items for delete to authenticated
  using (public.mh_is_owner());

-- ---------------------------------------------------------------------------
-- 7. The allow-list itself
-- ---------------------------------------------------------------------------
-- An owner may see that they are an owner. Nobody may add, change or remove a
-- membership row through the API — self-granting is impossible by omission.
-- Only a privileged dashboard session can edit mh_app_role.
drop policy if exists mh_read_own_role on public.mh_app_role;
create policy mh_read_own_role
  on public.mh_app_role for select to authenticated
  using (user_id = (select auth.uid()));

-- Deliberately NO insert / update / delete policy on mh_app_role.

commit;

-- ============================================================================
-- Summary of what a visitor can do with the publishable key:
--   select from mh_public_products            -> published rows, public columns
--   select from mh_public_product_categories  -> active categories
--   select from mh_public_product_variants    -> enabled variants of published items
--   select from mh_public_store_settings      -> the single public row
--   anything else                              -> permission denied or 0 rows
-- ============================================================================
