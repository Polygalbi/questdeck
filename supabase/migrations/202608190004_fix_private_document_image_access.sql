drop policy if exists "Questdeck members can view document images" on storage.objects;

create policy "Questdeck members can view document images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'questdeck-document-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.questdeck_documents
        where id::text = (storage.foldername(name))[2]
          and is_published = true
      )
    )
  );
