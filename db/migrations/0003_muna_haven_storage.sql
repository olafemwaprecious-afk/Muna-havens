-- ============================================================================
-- Muna's Haven — 0003: STORAGE BUCKET AND OBJECT POLICIES
-- ============================================================================
-- Scope   : one bucket for product images, plus owner-only write policies.
-- Isolation: the bucket id and every policy name are namespaced to this app.
--           Nothing here touches an existing bucket or its policies.
-- Apply   : Supabase dashboard -> SQL editor, paste whole file, Run.
--
-- Design notes
--   * The bucket is public because a product photograph is public information,
--     and a public bucket gives every product a stable URL with no per-request
--     signing in a static frontend.
--   * Upload limits are declared on the bucket so Storage, not JavaScript,
--     rejects an oversized or non-image file. The browser also checks, because
--     a client check gives a fast message — not because it is trusted.
--   * Deletion is deliberately NOT exposed as a free-for-all policy: the
--     dashboard calls mh_delete_unreferenced_image() so a file another product
--     still points at cannot be removed.
-- ============================================================================

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  avif_autodetection
)
values (
  'muna-haven-product-images',
  'muna-haven-product-images',
  true,
  5242880,                                  -- 5 MiB
  array['image/jpeg', 'image/png', 'image/webp'],
  false
)
on conflict (id) do update
   set file_size_limit     = excluded.file_size_limit,
       allowed_mime_types  = excluded.allowed_mime_types;
-- Note: `public` is intentionally not updated, so this file never flips a
-- bucket that someone else may have made private. Confirm it in the dashboard.

-- Policies -------------------------------------------------------------------
-- Each one is scoped to this bucket by name, so no policy here can affect
-- another application's storage.

drop policy if exists mh_owner_insert_product_image on storage.objects;
create policy mh_owner_insert_product_image
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'muna-haven-product-images'
    and public.mh_is_owner()
    -- Second layer only. Storage enforces the bucket's allowed_mime_types and
    -- file_size_limit before this row is written; these clauses exist so a
    -- direct insert into storage.objects cannot bypass that. They are written
    -- to reject a *known-bad* value rather than to reject a row whose metadata
    -- key is named differently by some future Storage version — a policy that
    -- false-rejects would silently break owner uploads.
    and (
      metadata is null
      or not (metadata ? 'mimetype')
      or (metadata ->> 'mimetype') in ('image/jpeg', 'image/png', 'image/webp')
    )
    and (
      metadata is null
      or not (metadata ? 'size')
      or (
        (metadata ->> 'size') ~ '^[0-9]+$'
        and (metadata ->> 'size')::bigint between 1 and 5242880
      )
    )
  );

drop policy if exists mh_owner_update_product_image on storage.objects;
create policy mh_owner_update_product_image
  on storage.objects for update to authenticated
  using (
    bucket_id = 'muna-haven-product-images'
    and public.mh_is_owner()
  )
  with check (
    bucket_id = 'muna-haven-product-images'
    and public.mh_is_owner()
  );

-- Owner-only removal, and only through the guarded function in practice: the
-- dashboard never issues a raw delete.
drop policy if exists mh_owner_delete_product_image on storage.objects;
create policy mh_owner_delete_product_image
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'muna-haven-product-images'
    and public.mh_is_owner()
  );

-- Read for the storefront. A public bucket already serves /object/public/...
-- without a policy; this explicit one exists so the authenticated Storage API
-- behaves identically instead of returning an empty list to a signed-in owner.
drop policy if exists mh_public_read_product_image on storage.objects;
create policy mh_public_read_product_image
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'muna-haven-product-images');
-- No anon insert/update/delete policy exists, so a visitor cannot upload to,
-- overwrite or remove any object regardless of what the frontend does.

commit;

-- ============================================================================
-- After running, confirm in the dashboard:
--   Storage -> Buckets -> muna-haven-product-images
--     Public bucket: ON
--     File size limit: 5 MB
--     Allowed MIME types: image/jpeg, image/png, image/webp
-- ============================================================================
