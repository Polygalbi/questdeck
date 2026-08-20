-- Workspace membership is owner-managed. Admin and Team Leader retain
-- production-management capabilities without being able to change access.
update public.questdeck_role_permissions
set manage_members = false,
    updated_at = now()
where role in ('Admin', 'Team Leader');
