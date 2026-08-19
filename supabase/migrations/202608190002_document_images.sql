insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'questdeck-document-images',
  'questdeck-document-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Questdeck users can upload document images') then
    create policy "Questdeck users can upload document images"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'questdeck-document-images' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Questdeck users can update document images') then
    create policy "Questdeck users can update document images"
      on storage.objects for update to authenticated
      using (bucket_id = 'questdeck-document-images' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'questdeck-document-images' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Questdeck users can delete document images') then
    create policy "Questdeck users can delete document images"
      on storage.objects for delete to authenticated
      using (bucket_id = 'questdeck-document-images' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
