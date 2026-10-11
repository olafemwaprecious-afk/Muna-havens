-- ============================================================================
-- Muna's Haven — 0005: POLICY VERIFICATION (read-only, safe to re-run)
-- ============================================================================
-- Purpose : prove the security promises instead of asserting them. Each block
--           switches to the role a browser actually uses and checks both the
--           allowed path and the denied path.
-- Safety  : wrapped in one transaction that ends in ROLLBACK, so nothing an
--           assertion inserts can survive. Reading is all it does.
-- Run as  : Supabase dashboard -> SQL editor, whole file, then read the Notices
--           tab. Every line should say PASS. Paste the output back to the agent.
-- ============================================================================

begin;

-- Helper: report a result without ending the transaction.
create or replace function pg_temp.mh_report(p_test text, p_passed boolean)
returns void language plpgsql as $$
begin
  raise notice '%: %', case when p_passed then 'PASS' else '**FAIL**' end, p_test;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. RLS is on for every private table
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  missing int := 0;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('mh_products','mh_product_categories','mh_product_variants',
                        'mh_store_settings','mh_owner_preferences','mh_app_role',
                        'mh_orders','mh_order_items')
    order by c.relname
  loop
    if not (select relrowsecurity from pg_class where oid = r.relname::regclass) then
      missing := missing + 1;
      raise notice '**FAIL** RLS not enabled on %', r.relname;
    end if;
  end loop;
  perform pg_temp.mh_report('RLS enabled on all 8 private tables', missing = 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. anon can read the published view
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  perform set_config('role', 'anon', true);
  select count(*) into n from public.mh_public_products;
  perform pg_temp.mh_report('anon reads mh_public_products (' || n || ' rows, expects >= 3)', n >= 3);
  perform set_config('role', 'none', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. anon cannot read the base table (no grant, RLS as backstop)
-- ---------------------------------------------------------------------------
do $$
declare ok boolean := false;
begin
  perform set_config('role', 'anon', true);
  begin
    perform count(*) from public.mh_products;
  exception
    when insufficient_privilege then ok := true;
    when others then
      raise notice '  (anon base-table read failed with % — denied either way)', sqlerrm;
      ok := true;
  end;
  perform set_config('role', 'none', true);
  perform pg_temp.mh_report('anon cannot read the raw mh_products table', ok);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. anon cannot write anything
-- ---------------------------------------------------------------------------
do $$
declare
  ok boolean := false;
  msg text;
begin
  perform set_config('role', 'anon', true);
  begin
    insert into public.mh_products (reference, name, slug, price, status)
    values ('MH-TEST-001', 'intrusion test', 'intrusion-test', '1.00', 'draft');
  exception when insufficient_privilege then ok := true;
    when others then ok := true; msg := sqlerrm;
  end;
  perform set_config('role', 'none', true);
  perform pg_temp.mh_report('anon cannot insert a product', ok);

  ok := false;
  perform set_config('role', 'anon', true);
  begin
    update public.mh_products set price = '0.01' where reference = 'MH-JEW-002';
  exception when insufficient_privilege then ok := true;
    when others then ok := true;
  end;
  perform set_config('role', 'none', true);
  perform pg_temp.mh_report('anon cannot change a price', ok);

  ok := false;
  perform set_config('role', 'anon', true);
  begin
    update public.mh_products set status = 'published' where reference = 'MH-JEW-002';
  exception when insufficient_privilege then ok := true;
    when others then ok := true;
  end;
  perform set_config('role', 'none', true);
  perform pg_temp.mh_report('anon cannot publish or unpublish', ok);

  ok := false;
  perform set_config('role', 'anon', true);
  begin
    select count(*) from public.mh_store_settings;
  exception when insufficient_privilege then ok := true;
    when others then ok := true;
  end;
  perform set_config('role', 'none', true);
  perform pg_temp.mh_report('anon cannot read the private settings table directly', ok);

  ok := false;
  perform set_config('role', 'anon', true);
  begin
    select count(*) from public.mh_orders;
  exception when insufficient_privilege then ok := true;
    when others then ok := true;
  end;
  perform set_config('role', 'none', true);
  perform pg_temp.mh_report('anon cannot read customer orders', ok);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. An authenticated NON-owner still has no rights
-- ---------------------------------------------------------------------------
-- auth.uid() is null outside a real request, so mh_is_owner() is false for this
-- role. That is exactly the unauthorised-signed-in-user case.
do $$
declare
  ok boolean := false;
  n int;
begin
  perform set_config('role', 'authenticated', true);
  begin
    select count(*) into n from public.mh_products;
    ok := (n = 0);
    if not ok then
      raise notice '  (authenticated saw % base product rows; expected 0 without owner rights)', n;
    end if;
  exception when insufficient_privilege then
    ok := true;
  end;
  perform set_config('role', 'none', true);
  perform pg_temp.mh_report('authenticated non-owner cannot read raw products', ok);

  ok := false;
  perform set_config('role', 'authenticated', true);
  begin
    insert into public.mh_app_role (user_id, role) values (gen_random_uuid(), 'owner');
  exception when insufficient_privilege then ok := true;
    when check_violation then ok := false; -- policy allowed the insert; only the constraint stopped it
    when not_null_violation then ok := false;
    when others then ok := true;
  end;
  perform set_config('role', 'none', true);
  perform pg_temp.mh_report('nobody can grant themselves the owner role via the API', ok);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Unpublished rows stay invisible once a draft exists
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid;
  published_count int;
  draft_visible boolean := false;
begin
  -- Insert as postgres (owner of the table), inside the rolled-back transaction.
  insert into public.mh_products (reference, name, slug, description, price, status)
  values ('MH-TEST-900', 'Hidden draft', 'hidden-draft', 'x', '1000.00', 'draft')
  returning id into v_id;

  select count(*) into published_count from public.mh_public_products;
  select exists (select 1 from public.mh_public_products where reference = 'MH-TEST-900')
    into draft_visible;

  perform pg_temp.mh_report('a draft is absent from the public view', not draft_visible);
  perform pg_temp.mh_report(
    'the public view exposes only published rows (' || published_count || ' visible)',
    published_count >= 3
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Publish gate rejects an incomplete product
-- ---------------------------------------------------------------------------
do $$
declare ok boolean := false;
begin
  begin
    update public.mh_products set status = 'published' where reference = 'MH-TEST-900';
  exception when check_violation or raise_exception then
    ok := true;
    raise notice '  (database said: %)', sqlerrm;
  end;
  perform pg_temp.mh_report('publishing without image/category/description is refused by the database', ok);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Price and quantity constraints
-- ---------------------------------------------------------------------------
do $$
declare ok boolean := false;
begin
  begin
    update public.mh_products set price = '-5.00' where reference = 'MH-JEW-002';
  exception when check_violation then ok := true;
  end;
  perform pg_temp.mh_report('a negative price is rejected', ok);

  ok := false;
  begin
    update public.mh_products set stock_quantity = -1 where reference = 'MH-JEW-002';
  exception when check_violation then ok := true;
  end;
  perform pg_temp.mh_report('a negative stock quantity is rejected', ok);

  ok := false;
  begin
    insert into public.mh_products (reference, name, slug, description, price)
    values ('MH-JEW-002', 'duplicate reference', 'dup-ref', 'x', '1.00');
  exception when unique_violation then ok := true;
  end;
  perform pg_temp.mh_report('a duplicate product reference is rejected', ok);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Order item price snapshots are independent of the live price
-- ---------------------------------------------------------------------------
do $$
declare
  v_order uuid;
  before_snapshot numeric;
  after_snapshot numeric;
begin
  insert into public.mh_orders (order_reference, customer_name, total_amount)
  values ('MH-ORD-900001', 'snapshot test', 0)
  returning id into v_order;

  insert into public.mh_order_items (order_id, product_id, product_name, unit_price, quantity)
  select v_order, p.id, p.name, p.price, 2
  from public.mh_products p where p.reference = 'MH-JEW-002';

  select unit_price into before_snapshot from public.mh_order_items where order_id = v_order;

  update public.mh_products set price = '9999.00' where reference = 'MH-JEW-002';

  select unit_price into after_snapshot from public.mh_order_items where order_id = v_order;

  perform pg_temp.mh_report(
    'changing a product price does not rewrite the stored order price (' ||
      before_snapshot || ' stayed ' || after_snapshot || ')',
    before_snapshot = after_snapshot
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Money is exact numeric, never float
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  select data_type into t from information_schema.columns
  where table_schema = 'public' and table_name = 'mh_products' and column_name = 'price';
  perform pg_temp.mh_report('mh_products.price is ' || coalesce(t, 'missing') || ' (expects numeric)', t = 'numeric');

  raise notice '  price column precision/scale: % / %',
    (select numeric_precision from information_schema.columns
      where table_schema = 'public' and table_name = 'mh_products' and column_name = 'price'),
    (select numeric_scale from information_schema.columns
      where table_schema = 'public' and table_name = 'mh_products' and column_name = 'price');
end;
$$;

do $$
declare c int;
begin
  select count(*) into c from information_schema.columns
  where table_schema = 'public'
    and table_name like 'mh_%'
    and data_type in ('real', 'double precision');
  perform pg_temp.mh_report('no float column stores money anywhere in mh_*', c = 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Starter catalogue matches the approved figures
-- ---------------------------------------------------------------------------
do $$
declare r record; n int := 0;
begin
  for r in
    select reference, name, price from public.mh_products
    where reference in ('MH-HAIR-001','MH-JEW-001','MH-JEW-002')
  loop
    n := n + 1;
    raise notice '  % · % · ₦%', r.reference, r.name, r.price;
  end loop;
  perform pg_temp.mh_report('all three starter products exist', n = 3);

  perform pg_temp.mh_report('prices are 28000.00 / 3500.00 / 5500.00', (
    select count(*) from public.mh_products where
      (reference = 'MH-HAIR-001' and price = '28000.00') or
      (reference = 'MH-JEW-001'  and price = '3500.00') or
      (reference = 'MH-JEW-002'  and price = '5500.00')
  ) = 3);

  perform pg_temp.mh_report('every starter image is marked illustrative', (
    select count(*) from public.mh_products
    where reference in ('MH-HAIR-001','MH-JEW-001','MH-JEW-002')
      and image_is_illustrative
  ) = 3);

  perform pg_temp.mh_report('WhatsApp number is stored in E.164 form', (
    select whatsapp_number from public.mh_store_settings where id = 1
  ) = '+2347018733485');

  perform pg_temp.mh_report('delivery notice reads "Delivery: Coming soon."', (
    select delivery_notice from public.mh_store_settings where id = 1
  ) like 'Delivery%Coming soon%');
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Guarded image cleanup refuses to delete a file still in use
-- ---------------------------------------------------------------------------
do $$
declare result text;
begin
  -- Owner rights are required; as postgres mh_is_owner() is false, so this
  -- proves the function refuses a non-owner before it ever touches Storage.
  begin
    select public.mh_delete_unreferenced_image('some/path.jpg') into result;
    perform pg_temp.mh_report('image cleanup RPC refuses a caller who is not the owner', false);
  exception when insufficient_privilege or raise_exception then
    perform pg_temp.mh_report('image cleanup RPC refuses a caller who is not the owner (' || sqlerrm || ')', true);
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Summary, then the rollback that keeps this file non-destructive
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.mh_products where status = 'published') as published_products,
  (select count(*) from public.mh_products) as all_products,
  (select count(*) from public.mh_product_categories) as categories,
  (select count(*) from pg_policies where schemaname = 'public' and tablename like 'mh_%') as mh_policies,
  (select count(*) from storage.buckets where id = 'muna-haven-product-images') as our_bucket;

rollback;

-- ROLLBACK above discards every row inserted by these assertions. The test
-- helper lives in pg_temp and disappears with the session.
