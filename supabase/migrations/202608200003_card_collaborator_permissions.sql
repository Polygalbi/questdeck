create or replace function public.can_edit_questdeck_cards()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.questdeck_members member
    join public.questdeck_role_permissions permissions on permissions.role = member.role
    where lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and member.status::text = 'Active'
      and permissions.edit_cards
  );
$$;

revoke all on function public.can_edit_questdeck_cards() from public;
grant execute on function public.can_edit_questdeck_cards() to authenticated;

drop policy if exists "Active members can update card collaborators" on public.questdeck_cards;
create policy "Card editors can update card collaborators"
on public.questdeck_cards
for update
to authenticated
using (public.can_edit_questdeck_cards())
with check (public.can_edit_questdeck_cards());
