update storage.buckets
set public = false
where id = 'questdeck-document-images';

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Questdeck members can view document images') then
    create policy "Questdeck members can view document images"
      on storage.objects for select to authenticated
      using (
        bucket_id = 'questdeck-document-images'
        and exists (
          select 1 from public.questdeck_documents
          where id::text = (storage.foldername(name))[2]
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Questdeck published document images can be viewed') then
    create policy "Questdeck published document images can be viewed"
      on storage.objects for select to anon
      using (
        bucket_id = 'questdeck-document-images'
        and exists (
          select 1 from public.questdeck_documents
          where id::text = (storage.foldername(name))[2]
            and is_published = true
        )
      );
  end if;
end $$;
