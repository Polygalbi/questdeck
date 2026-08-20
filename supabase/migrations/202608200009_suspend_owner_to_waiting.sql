-- A workspace is not allowed to exist without an Owner. Suspending an Owner
-- removes their memberships in the Edge function; this trigger makes orphan
-- cleanup a database invariant for every membership removal path.

create or replace function public.delete_questdeck_ownerless_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_workspace_id text;
begin
  if tg_op = 'DELETE' and old.role = 'Owner' then
    candidate_workspace_id := old.workspace_id;
  elsif tg_op = 'UPDATE'
    and old.role = 'Owner'
    and (new.role <> 'Owner' or new.workspace_id <> old.workspace_id) then
    candidate_workspace_id := old.workspace_id;
  end if;

  if candidate_workspace_id is not null
    and exists (
      select 1 from public.questdeck_workspaces workspace
      where workspace.id = candidate_workspace_id
    )
    and not exists (
      select 1 from public.questdeck_workspace_memberships membership
      where membership.workspace_id = candidate_workspace_id
        and membership.role = 'Owner'
    ) then
    delete from public.questdeck_workspaces
    where id = candidate_workspace_id;
  end if;

  return coalesce(new, old);
end
$$;

drop trigger if exists questdeck_delete_ownerless_workspace_trigger
  on public.questdeck_workspace_memberships;
create trigger questdeck_delete_ownerless_workspace_trigger
after update or delete on public.questdeck_workspace_memberships
for each row execute function public.delete_questdeck_ownerless_workspace();

revoke all on function public.delete_questdeck_ownerless_workspace() from public;

create or replace function public.suspend_questdeck_owner(target_member_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_record record;
  owned_workspace_ids text[] := array[]::text[];
  deleted_workspace_count integer := 0;
  waiting_list_added boolean := false;
begin
  select member.id, member.auth_user_id, member.email, member.name
  into owner_record
  from public.questdeck_members member
  join public.questdeck_owner_accounts owner_account on owner_account.member_id = member.id
  where member.id = target_member_id
  for update;

  if not found then
    raise exception 'Owner not found';
  end if;

  select coalesce(array_agg(distinct membership.workspace_id), array[]::text[])
  into owned_workspace_ids
  from public.questdeck_workspace_memberships membership
  where membership.member_id = target_member_id
    and membership.role = 'Owner';

  update public.questdeck_owner_accounts
  set status = 'Suspended', updated_at = now()
  where member_id = target_member_id;

  delete from public.questdeck_workspace_memberships
  where member_id = target_member_id;

  select count(*)
  into deleted_workspace_count
  from unnest(owned_workspace_ids) owned_workspace_id
  where not exists (
    select 1 from public.questdeck_workspaces workspace
    where workspace.id = owned_workspace_id
  );

  if owner_record.auth_user_id is not null then
    insert into public.questdeck_membership_requests (
      auth_user_id, email, display_name, target_workspace_id,
      status, requested_at, resolved_at
    ) values (
      owner_record.auth_user_id, lower(owner_record.email),
      left(coalesce(nullif(owner_record.name, ''), split_part(owner_record.email, '@', 1)), 120),
      null, 'Pending', now(), null
    )
    on conflict (auth_user_id) do update set
      email = excluded.email,
      display_name = excluded.display_name,
      target_workspace_id = null,
      status = 'Pending',
      requested_at = now(),
      resolved_at = null;
    waiting_list_added := true;
  end if;

  return jsonb_build_object(
    'waitingListAdded', waiting_list_added,
    'deletedWorkspaceCount', deleted_workspace_count
  );
end
$$;

revoke all on function public.suspend_questdeck_owner(bigint) from public;
grant execute on function public.suspend_questdeck_owner(bigint) to service_role;
