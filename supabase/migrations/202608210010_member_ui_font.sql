-- Account-level typography preference shared across all of a member's devices
-- and workspaces. The Edge function restricts writes to the signed-in member.

alter table public.questdeck_members
  add column if not exists ui_font text not null default 'pretendard';

alter table public.questdeck_members
  drop constraint if exists questdeck_members_ui_font_check;
alter table public.questdeck_members
  add constraint questdeck_members_ui_font_check check (
    ui_font in (
      'classic', 'pretendard', 'chosun', 'bookk-gothic',
      'freesentation', 'nexon', 'school-safety', 'bookk-myungjo'
    )
  );
