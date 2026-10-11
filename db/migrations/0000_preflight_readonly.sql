-- ============================================================================
-- Muna's Haven — 0000: PRE-FLIGHT INSPECTION (READ ONLY)
-- ============================================================================
-- Purpose : report what already exists in this Supabase project so the Muna's
--           Haven migration can be applied without disturbing anything else.
-- Safety  : SELECT only. Creates nothing, changes nothing, deletes nothing.
-- Run as  : Supabase dashboard -> SQL editor. Paste the whole file, Run once.
-- Then    : paste the result back to the coding agent before running 0001.
-- ============================================================================

-- 1. Tables in the schema exposed to the API. Look for any name already using
--    the mh_ prefix (there must be none) or anything that looks like a shop.
select
  c.table_schema,
  c.table_name,
  c.table_type
from information_schema.tables c
where c.table_schema in ('public')
order by c.table_schema, c.table_name;

-- 2. Existing RLS state. Anything with relrowsecurity = false on a table that
--    holds business data is worth knowing about before we add our own policies.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  (
    select json_agg(p.polname order by p.polname)
    from pg_policy p
    where p.polrelid = c.oid
  ) as policy_names
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'v', 'p')
order by c.relname;

-- 3. Existing views and functions, so we do not collide with mh_public_products
--    or mh_is_owner().
select table_name, 'view' as kind
from information_schema.views
where table_schema = 'public'
union all
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', 'function'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by 2 desc, 1;

-- 4. Sequences, enums, extensions.
select sequence_schema, sequence_name from information_schema.sequences
where sequence_schema = 'public' order by 1;

select t.typname as enum_name, json_agg(e.enumlabel order by e.enumsortorder) as labels
from pg_type t join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
group by 1 order by 1;

select e.extname, n.nspname as installed_in
from pg_extension e join pg_namespace n on n.oid = e.extnamespace
order by 1;

-- 5. Storage buckets that already exist. Our bucket must not already be taken
--    by another application.
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
order by created_at;

-- 6. Existing auth configuration that affects this project.
select
  (select setting from pg_settings where name = 'server_version') as postgres_version;

-- Config values are readable in the dashboard under Authentication -> Provider
-- -> Email (Confirm email, Rate limits) and Authentication -> URL Configuration
-- (Site URL, Redirect URLs). They are not readable from SQL, so check those
-- three panels and report what they say.

-- 7. How many auth users exist. Names are not selected on purpose: this result
--    is safe to paste into a chat log.
select
  count(*) as total_auth_users,
  count(*) filter (where email_confirmed_at is not null) as email_confirmed
from auth.users;

-- 8. Does the Realtime publication already contain tables? Adding ours later
--    must not silently change what another application streams.
select
  p.pubname,
  (
    select json_agg(schemaname || '.' || tablename order by tablename)
    from pg_publication_tables pt
    where pt.pubname = p.pubname
  ) as tables_in_publication
from pg_publication p
order by pubname;
