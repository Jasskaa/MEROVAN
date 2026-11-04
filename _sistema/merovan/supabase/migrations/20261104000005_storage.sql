-- Product photos and videos. Public read (shown in the store), team write.
-- Supabase-only (storage schema): skipped by the PGlite tests.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-media', 'product-media', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;

create policy media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'product-media' and private.current_role_is('owner', 'producto', 'marketing'));
create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'product-media' and private.current_role_is('owner', 'producto', 'marketing'));
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-media' and private.current_role_is('owner', 'producto', 'marketing'));
