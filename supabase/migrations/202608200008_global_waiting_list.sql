-- Simplify membership requests into one Questdeck-wide waiting list. Any
-- workspace Owner may claim a pending person into one of that Owner's own
-- workspaces. Requests remain content-free and expire after three days.

with ranked_requests as (
  select id, row_number() over (
    partition by auth_user_id
    order by (status = 'Pending') desc, requested_at desc, id desc
  ) as request_rank
  from public.questdeck_membership_requests
)
delete from public.questdeck_membership_requests request
using ranked_requests ranked
where request.id = ranked.id and ranked.request_rank > 1;

alter table public.questdeck_membership_requests
  drop constraint if exists questdeck_membership_requests_auth_user_id_target_workspace_id_key;

alter table public.questdeck_membership_requests
  alter column target_workspace_id drop not null;

update public.questdeck_membership_requests
set target_workspace_id = null
where status = 'Pending';

alter table public.questdeck_membership_requests
  drop constraint if exists questdeck_membership_requests_auth_user_id_key;
alter table public.questdeck_membership_requests
  add constraint questdeck_membership_requests_auth_user_id_key unique (auth_user_id);

drop index if exists public.questdeck_membership_requests_workspace_status_idx;
create index if not exists questdeck_membership_requests_status_age_idx
  on public.questdeck_membership_requests (status, requested_at);

drop trigger if exists questdeck_workspace_join_code_trigger on public.questdeck_workspaces;
drop function if exists public.create_questdeck_workspace_join_code();
drop table if exists public.questdeck_workspace_join_codes;
