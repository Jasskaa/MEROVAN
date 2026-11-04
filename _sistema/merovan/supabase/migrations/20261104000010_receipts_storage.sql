-- Private bucket for expense receipts (finance only). Supabase-only: skipped by the PGlite tests.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and private.current_role_is('owner', 'finanzas'));
create policy receipts_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and private.current_role_is('owner', 'finanzas'));
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and private.current_role_is('owner', 'finanzas'));
