-- Questdeck is a private workspace. Only active members may read its data.
create or replace function public.is_questdeck_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.questdeck_members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and status::text = 'Active'
  );
$$;

revoke all on function public.is_questdeck_member() from public;
grant execute on function public.is_questdeck_member() to authenticated;

do $$
declare
  target record;
  existing_policy record;
  policy_name text;
begin
  for target in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename like 'questdeck\_%' escape '\'
  loop
    execute format('alter table public.%I enable row level security', target.tablename);
    execute format('revoke all privileges on table public.%I from anon', target.tablename);
    execute format('grant select on table public.%I to authenticated', target.tablename);

    -- PostgreSQL combines permissive SELECT policies with OR, so remove old
    -- public/authenticated read rules before installing the membership rule.
    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target.tablename
        and cmd = 'SELECT'
    loop
      execute format('drop policy %I on public.%I', existing_policy.policyname, target.tablename);
    end loop;

    policy_name := target.tablename || '_active_members_read';
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_questdeck_member())',
      policy_name,
      target.tablename
    );
  end loop;
end
$$;

-- Comments remain writable by their author, but only while they are an active member.
drop policy if exists "Workspace members can add document comments" on public.questdeck_document_comments;
drop policy if exists "Authors can delete their document comments" on public.questdeck_document_comments;

create policy "Active members can add document comments"
on public.questdeck_document_comments
for insert
to authenticated
with check (public.is_questdeck_member() and user_id = auth.uid());

create policy "Active members can delete their document comments"
on public.questdeck_document_comments
for delete
to authenticated
using (public.is_questdeck_member() and user_id = auth.uid());

grant insert, delete on public.questdeck_document_comments to authenticated;
grant usage, select on sequence public.questdeck_document_comments_id_seq to authenticated;

-- Document images are private too. Signed-in members can view them; only the
-- user-owned folder can be changed by that user.
update storage.buckets set public = false where id = 'questdeck-document-images';

drop policy if exists "Questdeck published document images can be viewed" on storage.objects;
drop policy if exists "Questdeck members can view document images" on storage.objects;
drop policy if exists "Questdeck users can upload document images" on storage.objects;
drop policy if exists "Questdeck users can update document images" on storage.objects;
drop policy if exists "Questdeck users can delete document images" on storage.objects;

create policy "Active members can view document images"
on storage.objects
for select
to authenticated
using (bucket_id = 'questdeck-document-images' and public.is_questdeck_member());

create policy "Active members can upload document images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'questdeck-document-images'
  and public.is_questdeck_member()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Active members can update document images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'questdeck-document-images'
  and public.is_questdeck_member()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'questdeck-document-images'
  and public.is_questdeck_member()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Active members can delete document images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'questdeck-document-images'
  and public.is_questdeck_member()
  and (storage.foldername(name))[1] = auth.uid()::text
);
