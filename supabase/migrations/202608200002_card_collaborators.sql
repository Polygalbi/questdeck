alter table public.questdeck_cards
  add column if not exists collaborator_initials text[] not null default '{}';

grant update (collaborator_initials) on public.questdeck_cards to authenticated;

drop policy if exists "Active members can update card collaborators" on public.questdeck_cards;
create policy "Active members can update card collaborators"
on public.questdeck_cards
for update
to authenticated
using (public.is_questdeck_member())
with check (public.is_questdeck_member());

comment on column public.questdeck_cards.collaborator_initials is
  'Initials of active workspace members collaborating with the primary card owner.';
