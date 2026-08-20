
const SYNC_SECRET = "a54c436609be43b277ba23fdb25cb92c98d8278f09a935f17fb9a7d023800f1d";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type PermissionKey = "view_projects" | "edit_cards" | "manage_members" | "workspace_settings" | "billing_security";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Database request failed (${response.status})`);
  return text ? JSON.parse(text) : null;
}

function identity(request: Request) {
  const userId = request.headers.get("x-questdeck-user-id")?.trim() ?? "";
  const email = request.headers.get("x-questdeck-user-email")?.trim().toLowerCase() ?? "";
  return userId && email ? { userId, email } : null;
}

async function platformAdmin(request: Request) {
  const user = identity(request);
  if (!user) return null;
  const rows = await rest(`questdeck_platform_admins?select=*&email=ilike.${encodeURIComponent(user.email)}&status=eq.Active&limit=1`);
  const admin = rows?.[0] ?? null;
  if (admin && !admin.auth_user_id) {
    await rest(`questdeck_platform_admins?id=eq.${admin.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ auth_user_id: user.userId, updated_at: new Date().toISOString() }),
    });
    admin.auth_user_id = user.userId;
  }
  return admin?.auth_user_id === user.userId ? admin : null;
}

async function caller(request: Request, requestedWorkspaceId: string, allowWorkspaceFallback = false) {
  const user = identity(request);
  if (!user) return null;
  const { userId, email } = user;
  const rows = await rest(`questdeck_members?select=*&email=ilike.${encodeURIComponent(email)}&limit=1`);
  const member = rows?.[0] ?? null;
  if (member && !member.auth_user_id) {
    await rest(`questdeck_members?id=eq.${member.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ auth_user_id: userId, status: "Active", updated_at: new Date().toISOString() }),
    });
    member.auth_user_id = userId;
    member.status = "Active";
  }
  if (!member || member.status !== "Active") return null;
  const ownerAccount = (await rest(`questdeck_owner_accounts?select=status&member_id=eq.${member.id}&limit=1`))?.[0] ?? null;
  const allMemberships = await rest(`questdeck_workspace_memberships?select=workspace_id,role,discipline&member_id=eq.${member.id}&order=created_at.asc`);
  const memberships = ownerAccount?.status === "Suspended"
    ? (allMemberships ?? []).filter((item: any) => item.role !== "Owner")
    : allMemberships;
  if (!memberships?.length) return null;
  const requestedMembership = memberships.find((item: any) => item.workspace_id === requestedWorkspaceId);
  if (requestedWorkspaceId && !requestedMembership && !allowWorkspaceFallback) return null;
  const membership = requestedMembership ?? memberships[0];
  const workspacePermissions = (await rest(`questdeck_workspace_role_permissions?select=*&workspace_id=eq.${encodeURIComponent(membership.workspace_id)}&role=eq.${encodeURIComponent(membership.role)}&limit=1`))?.[0] ?? null;
  const permissions = workspacePermissions ?? (await rest(`questdeck_role_permissions?select=*&role=eq.${encodeURIComponent(membership.role)}&limit=1`))?.[0] ?? null;
  return {
    member,
    memberships,
    workspaceId: String(membership.workspace_id),
    role: String(membership.role),
    isOwner: membership.role === "Owner",
    ownedWorkspaceIds: memberships.filter((item: any) => item.role === "Owner").map((item: any) => String(item.workspace_id)),
    permissions,
  };
}

function allowed(context: any, permission: PermissionKey) {
  return Boolean(context?.permissions?.[permission]);
}

function ownerOnly(context: any) {
  return Boolean(context?.isOwner);
}

function scoped(path: string, workspaceId: string) {
  return `${path}${path.includes("?") ? "&" : "?"}workspace_id=eq.${encodeURIComponent(workspaceId)}`;
}

async function seedWorkspacePermissions(workspaceId: string) {
  const defaults = await rest("questdeck_role_permissions?select=role,view_projects,edit_cards,manage_members,workspace_settings,billing_security");
  if (!defaults?.length) return;
  await rest("questdeck_workspace_role_permissions?on_conflict=workspace_id,role", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(defaults.map((permission: any) => ({
      workspace_id: workspaceId,
      role: permission.role,
      view_projects: permission.view_projects,
      edit_cards: permission.edit_cards,
      manage_members: permission.manage_members,
      workspace_settings: permission.workspace_settings,
      billing_security: permission.billing_security,
    }))),
  });
}

async function waitingRoomEligible(request: Request) {
  const user = identity(request);
  if (!user) return false;
  const member = (await rest(`questdeck_members?select=id,status&email=ilike.${encodeURIComponent(user.email)}&limit=1`))?.[0] ?? null;
  if (!member) return true;
  const membership = (await rest(`questdeck_workspace_memberships?select=id&member_id=eq.${member.id}&limit=1`))?.[0] ?? null;
  return !membership;
}

async function clearExpiredWaitingRequests() {
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  await rest(`questdeck_membership_requests?status=eq.Pending&requested_at=lt.${encodeURIComponent(cutoff)}`, { method: "DELETE" });
}

type ActivityEvent = {
  action: string;
  target: string;
  detail?: string;
  project?: string;
  eventType?: string;
  tone?: string;
  destination?: string;
};

async function recordActivity(context: any, event: ActivityEvent) {
  const actorName = String(context.member.name || context.member.email || "Questdeck").slice(0, 120);
  const actorEmail = String(context.member.email || "").toLowerCase().slice(0, 320);
  const actorInitials = String(context.member.initials || actorName.slice(0, 2)).toUpperCase().slice(0, 4);
  const destination = String(event.destination || "overview").slice(0, 40);
  const tone = String(event.tone || "violet").slice(0, 40);
  const detail = String(event.detail || "").slice(0, 500);
  await rest("questdeck_activity_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      workspace_id: context.workspaceId,
      actor_name: actorName,
      actor_email: actorEmail,
      actor_initials: actorInitials,
      action: String(event.action).slice(0, 120),
      target: String(event.target).slice(0, 300),
      detail,
      project: String(event.project || "Workspace").slice(0, 160),
      event_type: String(event.eventType || "Workspace").slice(0, 60),
      tone,
      destination,
    }),
  });
  const workspaceMemberships = await rest(`questdeck_workspace_memberships?select=member_id&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`);
  const memberIds = (workspaceMemberships ?? []).map((item: any) => Number(item.member_id)).filter(Number.isSafeInteger);
  const recipients = memberIds.length ? await rest(`questdeck_members?select=email&id=in.(${memberIds.join(",")})&status=eq.Active`) : [];
  if (recipients?.length) {
    await rest("questdeck_notifications", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(recipients.map((member: any) => ({
        workspace_id: context.workspaceId,
        recipient_email: String(member.email || "").toLowerCase(),
        title: `${actorName} ${event.action} ${event.target}`.slice(0, 300),
        detail,
        icon: actorInitials || "Q",
        tone,
        destination,
      }))),
    });
  }
}

async function projectIdFor(name: string, workspaceId: string) {
  const rows = await rest(`questdeck_projects?select=id&name=eq.${encodeURIComponent(name)}&workspace_id=eq.${encodeURIComponent(workspaceId)}&limit=1`);
  if (!rows?.[0]?.id) throw new Error("Unknown project");
  return rows[0].id;
}

function cleanProject(project: any, workspaceId: string) {
  const name = String(project.name ?? "").trim().slice(0, 160);
  const status = ["Active", "On hold", "Archived"].includes(String(project.status)) ? String(project.status) : "Active";
  const progress = Math.max(0, Math.min(100, Number(project.progress) || 0));
  return {
    workspace_id: workspaceId,
    id: String(project.id ?? "").trim().slice(0, 120),
    name,
    card_count: Math.max(0, Number(project.count) || 0),
    color: String(project.color ?? "purple").slice(0, 40),
    owner: String(project.owner ?? "").trim().slice(0, 120),
    status,
    progress,
    updated_label: "Just now",
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (request.headers.get("x-questdeck-sync-secret") !== SYNC_SECRET) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await request.json();
    const action = String(body.action ?? "");
    const admin = await platformAdmin(request);
    const context = await caller(request, String(body.workspaceId ?? "").trim(), action === "load_access");

    if (action === "load_access") {
      const isWaiting = !context && !admin && await waitingRoomEligible(request);
      const user = identity(request);
      if (isWaiting) await clearExpiredWaitingRequests();
      const pendingRequests = isWaiting && user
        ? await rest(`questdeck_membership_requests?select=id,status,requested_at&auth_user_id=eq.${encodeURIComponent(user.userId)}&status=eq.Pending&order=requested_at.desc`)
        : [];
      return json({
        ok: true,
        hasWorkspaceAccess: Boolean(context),
        isPlatformAdmin: Boolean(admin),
        isWaiting,
        pendingRequestCount: pendingRequests?.length ?? 0,
        activeWorkspaceId: context?.workspaceId ?? null,
      });
    }

    if (action === "request_workspace_access") {
      const user = identity(request);
      if (!user) return json({ error: "Sign in required" }, 401);
      if (context || admin) return json({ error: "This account already has access" }, 400);
      if (!await waitingRoomEligible(request)) return json({ error: "This account cannot request workspace access" }, 403);
      const displayName = String(body.displayName ?? "").trim().slice(0, 120) || user.email.split("@")[0];
      await clearExpiredWaitingRequests();
      await rest("questdeck_membership_requests?on_conflict=auth_user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          auth_user_id: user.userId,
          email: user.email,
          display_name: displayName,
          target_workspace_id: null,
          status: "Pending",
          requested_at: new Date().toISOString(),
          resolved_at: null,
        }),
      });
      return json({ ok: true, status: "Pending" });
    }

    if (action === "load_platform_owners") {
      if (!admin) return json({ error: "Platform administrator access required" }, 403);
      const ownerAccounts = await rest("questdeck_owner_accounts?select=member_id,status,created_at&order=created_at.asc");
      const memberIds = (ownerAccounts ?? []).map((item: any) => Number(item.member_id)).filter(Number.isSafeInteger);
      const ownerMembers = memberIds.length
        ? await rest(`questdeck_members?select=id,name,email&id=in.(${memberIds.join(",")})`)
        : [];
      const ownerMemberships = memberIds.length
        ? await rest(`questdeck_workspace_memberships?select=member_id,workspace_id&role=eq.Owner&member_id=in.(${memberIds.join(",")})`)
        : [];
      const owners = (ownerAccounts ?? []).map((account: any) => {
        const member = (ownerMembers ?? []).find((item: any) => Number(item.id) === Number(account.member_id));
        return {
          id: Number(account.member_id),
          name: String(member?.name || "Owner"),
          email: String(member?.email || ""),
          status: String(account.status),
          workspaceCount: (ownerMemberships ?? []).filter((item: any) => Number(item.member_id) === Number(account.member_id)).length,
          createdAt: String(account.created_at),
        };
      });
      return json({ ok: true, owners });
    }

    if (action === "provision_owner") {
      if (!admin) return json({ error: "Platform administrator access required" }, 403);
      const email = String(body.email ?? "").trim().toLowerCase().slice(0, 320);
      const name = String(body.name ?? "").trim().slice(0, 120);
      const workspaceName = String(body.workspaceName ?? "").trim().slice(0, 160);
      if (!email || !/^\S+@\S+\.\S+$/.test(email) || !name || !workspaceName) return json({ error: "Name, email, and workspace name are required" }, 400);
      const existingMember = (await rest(`questdeck_members?select=*&email=ilike.${encodeURIComponent(email)}&limit=1`))?.[0] ?? null;
      if (existingMember) {
        const existingOwner = (await rest(`questdeck_owner_accounts?select=member_id&member_id=eq.${existingMember.id}&limit=1`))?.[0];
        if (existingOwner) return json({ error: "This email already has an owner account" }, 409);
      }
      const initials = name.split(/\s+/).map(part => part[0]).join("").toUpperCase().slice(0, 4) || "OW";
      const generatedMemberId = Date.now() * 100 + Math.floor(Math.random() * 100);
      const memberRecord = existingMember ?? (await rest("questdeck_members", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ id: generatedMemberId, name, email, initials, role: "Owner", discipline: "General", status: "Invited", updated_at: new Date().toISOString() }),
      }))?.[0];
      if (!memberRecord?.id) return json({ error: "Owner account could not be created" }, 500);
      await rest("questdeck_owner_accounts?on_conflict=member_id", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ member_id: memberRecord.id, status: "Active", updated_at: new Date().toISOString() }),
      });
      const workspaceId = `owner-${crypto.randomUUID()}`;
      const workspaceRecord = {
        id: workspaceId,
        name: workspaceName,
        initials: workspaceName.split(/\s+/).map(part => part[0]).join("").toUpperCase().slice(0, 4) || "W",
        member_count: 1,
        status: "Active",
        updated_at: new Date().toISOString(),
      };
      await rest("questdeck_workspaces", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(workspaceRecord) });
      await rest("questdeck_workspace_memberships", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ workspace_id: workspaceId, member_id: memberRecord.id, role: "Owner", discipline: "General", updated_at: new Date().toISOString() }),
      });
      await seedWorkspacePermissions(workspaceId);
      await rest("questdeck_projects", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify(cleanProject({ id: `project-${workspaceId}`, name: "General", count: 0, color: "purple", owner: name, status: "Active", progress: 0 }, workspaceId)),
      });
      await rest("questdeck_disciplines", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ workspace_id: workspaceId, name: "General", color: "blue-card", updated_at: new Date().toISOString() }),
      });
      return json({ ok: true, owner: { id: Number(memberRecord.id), name, email, status: "Active", workspaceCount: 1 } });
    }

    if (action === "set_owner_status") {
      if (!admin) return json({ error: "Platform administrator access required" }, 403);
      const memberId = Number(body.memberId);
      const status = body.status === "Suspended" ? "Suspended" : "Active";
      if (!Number.isSafeInteger(memberId)) return json({ error: "Invalid owner" }, 400);
      const owner = (await rest(`questdeck_members?select=id,email,name,auth_user_id&id=eq.${memberId}&limit=1`))?.[0];
      if (!owner) return json({ error: "Owner not found" }, 404);
      if (String(owner.email).toLowerCase() === String(admin.email).toLowerCase() && status === "Suspended") return json({ error: "You cannot suspend your own owner account" }, 400);
      if (status === "Suspended") {
        const result = await rest("rpc/suspend_questdeck_owner", {
          method: "POST",
          body: JSON.stringify({ target_member_id: memberId }),
        });
        return json({ ok: true, memberId, status, ...result });
      }
      await rest(`questdeck_owner_accounts?member_id=eq.${memberId}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      });
      return json({ ok: true, memberId, status, waitingListAdded: false, deletedWorkspaceCount: 0 });
    }

    if (!context) return json({ error: "Workspace access required" }, 403);

    if (action === "load_waiting_requests") {
      if (!ownerOnly(context)) return json({ error: "Only owners can manage the waiting list" }, 403);
      await clearExpiredWaitingRequests();
      const ownedIds = context.ownedWorkspaceIds;
      const workspaceFilter = ownedIds.map((id: string) => `"${id.replaceAll('"', '')}"`).join(",");
      const [workspaceRows, requestRows] = await Promise.all([
        rest(`questdeck_workspaces?select=id,name,initials,status&id=in.(${workspaceFilter})&order=created_at.asc`),
        rest("questdeck_membership_requests?select=id,auth_user_id,email,display_name,status,requested_at&status=eq.Pending&order=requested_at.asc"),
      ]);
      const workspaces = (workspaceRows ?? []).filter((workspace: any) => workspace.status === "Active").map((workspace: any) => ({
        workspaceId: String(workspace.id),
        workspaceName: String(workspace.name),
        workspaceInitials: String(workspace.initials),
      }));
      const requests = (requestRows ?? []).map((item: any) => ({
        id: Number(item.id),
        email: String(item.email),
        displayName: String(item.display_name || item.email.split("@")[0]),
        requestedAt: String(item.requested_at),
        expiresAt: new Date(new Date(item.requested_at).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      }));
      return json({ ok: true, workspaces, requests });
    }

    if (action === "approve_waiting_request") {
      if (!ownerOnly(context)) return json({ error: "Only owners can approve waiting members" }, 403);
      const requestId = Number(body.requestId);
      const targetWorkspaceId = String(body.targetWorkspaceId ?? "").trim();
      const role = ["Admin", "Team Leader", "Member", "Guest"].includes(String(body.role)) ? String(body.role) : "Member";
      const discipline = String(body.discipline ?? "General").trim().slice(0, 120) || "General";
      if (!Number.isSafeInteger(requestId)) return json({ error: "Invalid waiting request" }, 400);
      if (!context.ownedWorkspaceIds.includes(targetWorkspaceId)) return json({ error: "Choose one of your own workspaces" }, 403);
      await clearExpiredWaitingRequests();
      const pending = (await rest(`questdeck_membership_requests?select=*&id=eq.${requestId}&status=eq.Pending&limit=1`))?.[0] ?? null;
      if (!pending) return json({ error: "Waiting request not found or expired" }, 404);
      let member = (await rest(`questdeck_members?select=*&auth_user_id=eq.${encodeURIComponent(pending.auth_user_id)}&limit=1`))?.[0] ?? null;
      member ??= (await rest(`questdeck_members?select=*&email=ilike.${encodeURIComponent(pending.email)}&limit=1`))?.[0] ?? null;
      const displayName = String(pending.display_name || pending.email.split("@")[0]).trim().slice(0, 120);
      const initials = displayName.split(/\s+/).map((part: string) => part[0]).join("").toUpperCase().slice(0, 4) || "M";
      if (!member) {
        const memberId = Date.now() * 100 + Math.floor(Math.random() * 100);
        member = (await rest("questdeck_members", {
          method: "POST", headers: { Prefer: "return=representation" },
          body: JSON.stringify({ id: memberId, auth_user_id: pending.auth_user_id, name: displayName, email: String(pending.email).toLowerCase(), initials, role: role === "Team Leader" ? "Member" : role, discipline, status: "Active", updated_at: new Date().toISOString() }),
        }))?.[0] ?? null;
      } else {
        await rest(`questdeck_members?id=eq.${member.id}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ auth_user_id: member.auth_user_id || pending.auth_user_id, status: "Active", updated_at: new Date().toISOString() }),
        });
      }
      if (!member?.id) return json({ error: "Member could not be created" }, 500);
      await rest("questdeck_workspace_memberships?on_conflict=workspace_id,member_id", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ workspace_id: targetWorkspaceId, member_id: member.id, role, discipline, updated_at: new Date().toISOString() }),
      });
      await rest(`questdeck_membership_requests?id=eq.${requestId}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "Approved", resolved_at: new Date().toISOString() }),
      });
      await recordActivity({ ...context, workspaceId: targetWorkspaceId }, { action: "approved member", target: displayName, detail: `${role} · ${discipline}`, eventType: "Team", tone: "mint", destination: "management" });
      return json({ ok: true, requestId, memberId: Number(member.id) });
    }

    if (action === "decline_waiting_request") {
      if (!ownerOnly(context)) return json({ error: "Only owners can manage the waiting list" }, 403);
      const requestId = Number(body.requestId);
      if (!Number.isSafeInteger(requestId)) return json({ error: "Invalid waiting request" }, 400);
      const pending = (await rest(`questdeck_membership_requests?select=id&status=eq.Pending&id=eq.${requestId}&limit=1`))?.[0] ?? null;
      if (!pending) return json({ error: "Waiting request not found" }, 404);
      await rest(`questdeck_membership_requests?id=eq.${requestId}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "Declined", resolved_at: new Date().toISOString() }),
      });
      return json({ ok: true, requestId });
    }

    if (action === "clear_waiting_requests") {
      if (!ownerOnly(context)) return json({ error: "Only owners can clear the waiting list" }, 403);
      const pending = await rest("questdeck_membership_requests?select=id&status=eq.Pending");
      await rest("questdeck_membership_requests?status=eq.Pending", { method: "DELETE" });
      return json({ ok: true, cleared: pending?.length ?? 0 });
    }

    if (action === "update_ui_font") {
      const fontId = String(body.fontId ?? "");
      const supportedFonts = ["classic", "pretendard", "chosun", "bookk-gothic", "freesentation", "nexon", "school-safety", "bookk-myungjo"];
      if (!supportedFonts.includes(fontId)) return json({ error: "Unsupported screen font" }, 400);
      await rest(`questdeck_members?id=eq.${context.member.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ ui_font: fontId, updated_at: new Date().toISOString() }),
      });
      return json({ ok: true, fontId });
    }

    if (action === "load_admin") {
      if (!allowed(context, "view_projects")) return json({ error: "Permission denied" }, 403);
      const workspaceIds = context.memberships.map((item: any) => String(item.workspace_id));
      const projects = await rest(`questdeck_projects?select=id,name,card_count,color,owner,status,progress,updated_label&workspace_id=eq.${encodeURIComponent(context.workspaceId)}&order=created_at.asc`);
      const workspaces = await rest(`questdeck_workspaces?select=id,name,initials,member_count,status&id=in.(${workspaceIds.map((id: string) => `"${id.replaceAll('"', '')}"`).join(",")})&order=created_at.asc`);
      const roles = await rest(`questdeck_workspace_role_permissions?select=role,view_projects,edit_cards,manage_members,workspace_settings,billing_security&workspace_id=eq.${encodeURIComponent(context.workspaceId)}&order=role.asc`);
      const visibleMemberships = ownerOnly(context)
        ? await rest(`questdeck_workspace_memberships?select=workspace_id,member_id,role,discipline&workspace_id=in.(${context.ownedWorkspaceIds.map((id: string) => `"${id.replaceAll('"', '')}"`).join(",")})&order=created_at.asc`)
        : await rest(`questdeck_workspace_memberships?select=workspace_id,member_id,role,discipline&workspace_id=eq.${encodeURIComponent(context.workspaceId)}&order=created_at.asc`);
      const visibleMemberIds = Array.from(new Set((visibleMemberships ?? []).map((item: any) => Number(item.member_id)).filter(Number.isSafeInteger)));
      const rawMembers = visibleMemberIds.length
        ? await rest(`questdeck_members?select=id,name,email,initials,discipline,status&id=in.(${visibleMemberIds.join(",")})&order=created_at.asc`)
        : [];
      const members = (rawMembers ?? []).map((member: any) => {
        const assigned = (visibleMemberships ?? []).filter((item: any) => Number(item.member_id) === Number(member.id));
        const current = assigned.find((item: any) => item.workspace_id === context.workspaceId);
        return { ...member, role: current?.role ?? assigned[0]?.role ?? "Member", discipline: current?.discipline ?? assigned[0]?.discipline ?? member.discipline ?? "General", workspaceIds: assigned.map((item: any) => String(item.workspace_id)) };
      });
      return json({ ok: true, projects, workspaces, roles, members, activeWorkspaceId: context.workspaceId, currentRole: context.role, isOwner: context.isOwner, isPlatformAdmin: Boolean(admin), currentMember: context.member, permissions: context.permissions });
    }

    if (action === "load_feed") {
      if (!allowed(context, "view_projects")) return json({ error: "Permission denied" }, 403);
      const email = encodeURIComponent(String(context.member.email || "").toLowerCase());
      const activity = await rest(`questdeck_activity_events?select=id,actor_name,actor_email,actor_initials,action,target,detail,project,event_type,tone,destination,created_at&workspace_id=eq.${encodeURIComponent(context.workspaceId)}&order=created_at.desc&limit=120`);
      const notifications = await rest(`questdeck_notifications?select=id,title,detail,icon,tone,destination,is_read,created_at&recipient_email=eq.${email}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}&order=created_at.desc&limit=80`);
      return json({ ok: true, activity, notifications });
    }

    if (action === "mark_notification_read") {
      const notificationId = Number(body.notificationId);
      if (!Number.isSafeInteger(notificationId)) return json({ error: "Invalid notification" }, 400);
      const email = encodeURIComponent(String(context.member.email || "").toLowerCase());
      await rest(`questdeck_notifications?id=eq.${notificationId}&recipient_email=eq.${email}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_read: true }),
      });
      return json({ ok: true, notificationId });
    }

    if (action === "mark_all_notifications_read") {
      const email = encodeURIComponent(String(context.member.email || "").toLowerCase());
      await rest(`questdeck_notifications?recipient_email=eq.${email}&is_read=eq.false&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_read: true }),
      });
      return json({ ok: true });
    }

    if (action === "create_workspace") {
      if (!ownerOnly(context)) return json({ error: "Only owners can create workspaces" }, 403);
      const workspace = body.workspace ?? {};
      const record = {
        id: String(workspace.id ?? "").trim().slice(0, 120),
        name: String(workspace.name ?? "").trim().slice(0, 160),
        initials: String(workspace.initials ?? "").trim().toUpperCase().slice(0, 4),
        member_count: Math.max(1, Number(workspace.members) || 1),
        status: "Active",
        updated_at: new Date().toISOString(),
      };
      if (!record.id || !record.name || !record.initials) return json({ error: "Invalid workspace" }, 400);
      await rest("questdeck_workspaces?on_conflict=id", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(record),
      });
      await rest("questdeck_workspace_memberships?on_conflict=workspace_id,member_id", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ workspace_id: record.id, member_id: context.member.id, role: "Owner", discipline: context.member.discipline || "General", updated_at: new Date().toISOString() }),
      });
      await rest("questdeck_owner_accounts?on_conflict=member_id", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ member_id: context.member.id, status: "Active", updated_at: new Date().toISOString() }),
      });
      await seedWorkspacePermissions(record.id);
      context.workspaceId = record.id;
      const starterProject = cleanProject({
        id: `project-${record.id}`,
        name: "General",
        count: 0,
        color: "purple",
        owner: context.member.name || context.member.email,
        status: "Active",
        progress: 0,
      }, record.id);
      await rest("questdeck_projects?on_conflict=id", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(starterProject),
      });
      await rest("questdeck_disciplines", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ workspace_id: record.id, name: "General", color: "blue-card", updated_at: new Date().toISOString() }),
      });
      await recordActivity(context, { action: "created workspace", target: record.name, detail: "Workspace ready", eventType: "Workspace", tone: "violet", destination: "management" });
      return json({ ok: true, workspace: record });
    }

    if (action === "set_workspace_status") {
      if (!ownerOnly(context)) return json({ error: "Only owners can manage workspaces" }, 403);
      const workspaceId = String(body.workspaceId ?? "").trim();
      if (!context.ownedWorkspaceIds.includes(workspaceId)) return json({ error: "You do not own this workspace" }, 403);
      const status = body.status === "Archived" ? "Archived" : "Active";
      const existing = (await rest(`questdeck_workspaces?select=id,status&id=eq.${encodeURIComponent(workspaceId)}&limit=1`))?.[0];
      if (!existing) return json({ error: "Workspace not found" }, 404);
      if (status === "Archived") {
        const active = await rest(`questdeck_workspaces?select=id&status=eq.Active&id=in.(${context.ownedWorkspaceIds.map((id: string) => `"${id.replaceAll('"', '')}"`).join(",")})`);
        if ((active?.length ?? 0) <= 1 && existing.status === "Active") return json({ error: "Keep at least one active workspace" }, 400);
      }
      await rest(`questdeck_workspaces?id=eq.${encodeURIComponent(workspaceId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      });
      await recordActivity(context, { action: status === "Archived" ? "archived workspace" : "restored workspace", target: workspaceId, detail: status, eventType: "Workspace", tone: status === "Archived" ? "amber" : "mint", destination: "management" });
      return json({ ok: true, workspaceId, status });
    }

    if (action === "delete_workspace") {
      if (!ownerOnly(context)) return json({ error: "Owner access required" }, 403);
      const workspaceId = String(body.workspaceId ?? "").trim();
      if (!context.ownedWorkspaceIds.includes(workspaceId)) return json({ error: "You do not own this workspace" }, 403);
      const all = await rest(`questdeck_workspaces?select=id&id=in.(${context.ownedWorkspaceIds.map((id: string) => `"${id.replaceAll('"', '')}"`).join(",")})`);
      if ((all?.length ?? 0) <= 1) return json({ error: "The final workspace cannot be deleted" }, 400);
      const existing = (all ?? []).find((item: any) => item.id === workspaceId);
      if (!existing) return json({ error: "Workspace not found" }, 404);
      await rest(`questdeck_workspaces?id=eq.${encodeURIComponent(workspaceId)}`, { method: "DELETE" });
      await recordActivity(context, { action: "deleted workspace", target: workspaceId, detail: "Workspace permanently deleted", eventType: "Workspace", tone: "coral", destination: "management" });
      return json({ ok: true, workspaceId });
    }

    if (action === "create_card" || action === "update_card") {
      if (!allowed(context, "edit_cards")) return json({ error: "Permission denied" }, 403);
      const card = body.card ?? {};
      const project_id = await projectIdFor(String(card.project), context.workspaceId);
      const record = {
        workspace_id: context.workspaceId,
        id: Number(card.id),
        title: String(card.title).slice(0, 300),
        description: String(card.description ?? "").slice(0, 4000),
        tag: String(card.tag).slice(0, 80),
        owner_initials: String(card.owner ?? "JK").slice(0, 8),
        points: Math.max(1, Math.min(10, Number(card.points) || 1)),
        priority: Math.max(1, Math.min(10, Number(card.priority) || 5)),
        color: String(card.color).slice(0, 80),
        status: String(card.status),
        project_id,
        due_label: String(card.due ?? "No date").slice(0, 100),
        due_date: card.dueDate ? String(card.dueDate).slice(0, 10) : null,
        start_date: card.startDate ? String(card.startDate).slice(0, 10) : null,
        archived: Boolean(card.archived),
      };
      if (!Number.isSafeInteger(record.id) || !record.title) return json({ error: "Invalid card" }, 400);
      if (action === "create_card") {
        const result = await rest("questdeck_cards?on_conflict=id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(record),
        });
        await recordActivity(context, { action: "created", target: record.title, detail: `${record.tag} · ${record.status}`, project: String(card.project), eventType: "Cards", tone: record.color, destination: "quests" });
        return json({ ok: true, card: result?.[0] ?? record });
      }
      await rest(`questdeck_cards?id=eq.${record.id}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(record),
      });
      await recordActivity(context, { action: "updated", target: record.title, detail: `${record.status} · Priority ${record.priority}`, project: String(card.project), eventType: "Cards", tone: record.color, destination: "quests" });
      return json({ ok: true });
    }

    if (action === "delete_card") {
      if (!allowed(context, "edit_cards")) return json({ error: "Permission denied" }, 403);
      const cardId = Number(body.cardId);
      if (!Number.isSafeInteger(cardId)) return json({ error: "Invalid card" }, 400);
      const existing = (await rest(`questdeck_cards?select=id,title,questdeck_projects(name)&id=eq.${cardId}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}&limit=1`))?.[0];
      if (!existing) return json({ error: "Card not found" }, 404);
      await rest(`questdeck_subtasks?card_id=eq.${cardId}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, { method: "DELETE" });
      await rest(`questdeck_cards?id=eq.${cardId}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, { method: "DELETE" });
      await recordActivity(context, { action: "deleted", target: existing.title || "card", detail: "Card permanently deleted", project: existing.questdeck_projects?.name || "Workspace", eventType: "Cards", tone: "coral", destination: "quests" });
      return json({ ok: true, cardId });
    }

    if (action === "add_discipline") {
      if (!allowed(context, "edit_cards")) return json({ error: "Permission denied" }, 403);
      const name = String(body.name ?? "").trim().slice(0, 80);
      const color = String(body.color ?? "violet").slice(0, 40);
      if (!name) return json({ error: "Discipline name required" }, 400);
      const result = await rest("questdeck_disciplines", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ workspace_id: context.workspaceId, name, color, updated_at: new Date().toISOString() }),
      });
      return json({ ok: true, discipline: result?.[0] });
    }

    if (action === "rename_discipline") {
      if (!allowed(context, "edit_cards")) return json({ error: "Permission denied" }, 403);
      const id = Number(body.id);
      const name = String(body.name ?? "").trim().slice(0, 80);
      const existing = (await rest(`questdeck_disciplines?select=id,name&id=eq.${id}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}&limit=1`))?.[0];
      if (!existing || existing.name === "General" || !name) return json({ error: "Invalid discipline" }, 400);
      await rest(`questdeck_cards?tag=eq.${encodeURIComponent(existing.name)}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ tag: name }),
      });
      await rest(`questdeck_disciplines?id=eq.${id}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ name, updated_at: new Date().toISOString() }),
      });
      return json({ ok: true, id, name });
    }

    if (action === "delete_discipline") {
      if (!allowed(context, "edit_cards")) return json({ error: "Permission denied" }, 403);
      const id = Number(body.id);
      const existing = (await rest(`questdeck_disciplines?select=id,name&id=eq.${id}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}&limit=1`))?.[0];
      if (!existing || existing.name === "General") return json({ error: "This discipline cannot be deleted" }, 400);
      await rest(`questdeck_cards?tag=eq.${encodeURIComponent(existing.name)}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ tag: "General", color: "blue-card" }),
      });
      await rest(`questdeck_disciplines?id=eq.${id}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, { method: "DELETE" });
      return json({ ok: true, id });
    }

    if (action === "load_documents") {
      if (!allowed(context, "view_projects")) return json({ error: "Permission denied" }, 403);
      const documents = await rest(`questdeck_documents?select=id,title,content,created_by_email,owner_name,is_published,share_slug,created_at,updated_at&workspace_id=eq.${encodeURIComponent(context.workspaceId)}&order=updated_at.desc`);
      return json({ ok: true, documents });
    }

    if (action === "create_document" || action === "update_document") {
      if (!allowed(context, "edit_cards")) return json({ error: "Permission denied" }, 403);
      const document = body.document ?? {};
      const title = String(document.title ?? "").trim().slice(0, 200);
      const content = String(document.content ?? "").slice(0, 100000);
      if (!title) return json({ error: "Document title required" }, 400);
      const record = {
        workspace_id: context.workspaceId,
        title,
        content,
        created_by_email: String(document.createdByEmail ?? context.member.email).trim().toLowerCase().slice(0, 320),
        owner_name: String(document.ownerName ?? context.member.name ?? "").trim().slice(0, 120),
        is_published: Boolean(document.isPublished),
        updated_at: new Date().toISOString(),
      };
      if (action === "create_document") {
        const result = await rest("questdeck_documents", {
          method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(record),
        });
        await recordActivity(context, { action: "created document", target: record.title, detail: record.is_published ? "Shared document" : "Private document", eventType: "Documents", tone: "blue", destination: "documents" });
        return json({ ok: true, document: result?.[0] });
      }
      const documentId = Number(document.id);
      if (!Number.isSafeInteger(documentId)) return json({ error: "Invalid document" }, 400);
      const result = await rest(`questdeck_documents?id=eq.${documentId}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, {
        method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(record),
      });
      if (!result?.[0]) return json({ error: "Document not found" }, 404);
      return json({ ok: true, document: result[0] });
    }

    if (action === "delete_document") {
      if (!allowed(context, "edit_cards")) return json({ error: "Permission denied" }, 403);
      const documentId = Number(body.documentId);
      if (!Number.isSafeInteger(documentId)) return json({ error: "Invalid document" }, 400);
      const existing = (await rest(`questdeck_documents?select=id,title&id=eq.${documentId}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}&limit=1`))?.[0];
      await rest(`questdeck_documents?id=eq.${documentId}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, { method: "DELETE" });
      await recordActivity(context, { action: "deleted document", target: existing?.title || "document", detail: "Document permanently deleted", eventType: "Documents", tone: "coral", destination: "documents" });
      return json({ ok: true, documentId });
    }

    if (action === "replace_subtasks") {
      if (!allowed(context, "edit_cards")) return json({ error: "Permission denied" }, 403);
      const cardId = Number(body.cardId);
      const items = Array.isArray(body.items) ? body.items : [];
      if (!Number.isSafeInteger(cardId)) return json({ error: "Invalid card" }, 400);
      const ownedCard = (await rest(`questdeck_cards?select=id&id=eq.${cardId}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}&limit=1`))?.[0];
      if (!ownedCard) return json({ error: "Card not found" }, 404);
      await rest(`questdeck_subtasks?card_id=eq.${cardId}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, { method: "DELETE" });
      if (items.length) {
        const rows = items.slice(0, 100).map((item: any, index: number) => ({
          id: Number(item.id), workspace_id: context.workspaceId, card_id: cardId, text: String(item.text ?? "").trim().slice(0, 500),
          done: Boolean(item.done), sort_order: index,
        })).filter((item: any) => Number.isSafeInteger(item.id) && item.text);
        if (rows.length) await rest("questdeck_subtasks", {
          method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows),
        });
      }
      return json({ ok: true });
    }

    if (action === "create_project" || action === "update_project") {
      if (!allowed(context, "workspace_settings")) return json({ error: "Permission denied" }, 403);
      const record = cleanProject(body.project ?? {}, context.workspaceId);
      if (!record.id || !record.name || !record.owner) return json({ error: "Invalid project" }, 400);
      if (action === "create_project") {
        await rest("questdeck_projects?on_conflict=id", {
          method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(record),
        });
      } else {
        await rest(`questdeck_projects?id=eq.${encodeURIComponent(record.id)}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(record),
        });
      }
      await recordActivity(context, { action: action === "create_project" ? "created project" : "updated project", target: record.name, detail: `${record.status} · ${record.progress}%`, project: record.name, eventType: "Projects", tone: record.color, destination: "projects-management" });
      return json({ ok: true, project: record });
    }

    if (action === "delete_project") {
      if (!allowed(context, "workspace_settings")) return json({ error: "Permission denied" }, 403);
      const projectId = String(body.projectId ?? "").trim();
      if (!projectId) return json({ error: "Invalid project" }, 400);
      const existing = (await rest(`questdeck_projects?select=id,name,status&id=eq.${encodeURIComponent(projectId)}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}&limit=1`))?.[0];
      if (!existing) return json({ error: "Project not found" }, 404);
      if (existing.status !== "Archived") return json({ error: "Archive the project before deleting it" }, 400);
      const projectCards = await rest(`questdeck_cards?select=id&project_id=eq.${encodeURIComponent(projectId)}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`);
      const cardIds = (projectCards ?? []).map((card: any) => Number(card.id)).filter(Number.isSafeInteger);
      if (cardIds.length) {
        await rest(`questdeck_subtasks?card_id=in.(${cardIds.join(",")})&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, { method: "DELETE" });
      }
      await rest(`questdeck_cards?project_id=eq.${encodeURIComponent(projectId)}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, { method: "DELETE" });
      await rest(`questdeck_projects?id=eq.${encodeURIComponent(projectId)}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, { method: "DELETE" });
      await recordActivity(context, { action: "deleted project", target: existing.name, detail: `${cardIds.length} cards removed`, project: "Workspace", eventType: "Projects", tone: "coral", destination: "projects-management" });
      return json({ ok: true, projectId, deletedCards: cardIds.length });
    }

    if (action === "create_milestone" || action === "update_milestone") {
      if (!allowed(context, "edit_cards")) return json({ error: "Permission denied" }, 403);
      const milestone = body.milestone ?? {};
      const title = String(milestone.title ?? "").trim().slice(0, 200);
      const milestoneDate = String(milestone.milestoneDate ?? "").slice(0, 10);
      const totalCards = Math.max(0, Number(milestone.totalCards) || 0);
      const completedCards = Math.max(0, Math.min(totalCards, Number(milestone.completedCards) || 0));
      const color = ["violet", "mint", "coral", "blue", "amber", "rose"].includes(String(milestone.color)) ? String(milestone.color) : "violet";
      const record = {
        workspace_id: context.workspaceId,
        title,
        milestone_date: milestoneDate,
        progress: Math.max(0, Math.min(100, Number(milestone.progress) || 0)),
        completed_cards: completedCards,
        total_cards: totalCards,
        note: String(milestone.note ?? "").trim().slice(0, 1000),
        color,
        stage: String(milestone.stage ?? "UP NEXT").trim().slice(0, 80),
      };
      if (!record.title || !/^\d{4}-\d{2}-\d{2}$/.test(record.milestone_date)) return json({ error: "Milestone title and date are required" }, 400);
      if (action === "create_milestone") {
        const result = await rest("questdeck_milestones", {
          method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(record),
        });
        await recordActivity(context, { action: "created milestone", target: record.title, detail: `${record.stage} · ${record.milestone_date}`, eventType: "Milestones", tone: record.color, destination: "milestones" });
        return json({ ok: true, milestone: result?.[0] });
      }
      const milestoneId = Number(milestone.id);
      if (!Number.isSafeInteger(milestoneId)) return json({ error: "Invalid milestone" }, 400);
      const result = await rest(`questdeck_milestones?id=eq.${milestoneId}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, {
        method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(record),
      });
      if (!result?.[0]) return json({ error: "Milestone not found" }, 404);
      await recordActivity(context, { action: "updated milestone", target: record.title, detail: `${record.stage} · ${record.progress}%`, eventType: "Milestones", tone: record.color, destination: "milestones" });
      return json({ ok: true, milestone: result[0] });
    }

    if (action === "delete_milestone") {
      if (!allowed(context, "edit_cards")) return json({ error: "Permission denied" }, 403);
      const milestoneId = Number(body.milestoneId);
      if (!Number.isSafeInteger(milestoneId)) return json({ error: "Invalid milestone" }, 400);
      const existing = (await rest(`questdeck_milestones?select=id,title&id=eq.${milestoneId}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}&limit=1`))?.[0];
      if (!existing) return json({ error: "Milestone not found" }, 404);
      await rest(`questdeck_milestones?id=eq.${milestoneId}&workspace_id=eq.${encodeURIComponent(context.workspaceId)}`, { method: "DELETE" });
      await recordActivity(context, { action: "deleted milestone", target: existing.title || "milestone", detail: "Milestone permanently deleted", eventType: "Milestones", tone: "coral", destination: "milestones" });
      return json({ ok: true, milestoneId });
    }

    if (action === "add_member" || action === "update_member") {
      if (!ownerOnly(context)) return json({ error: "Only owners can assign workspace access" }, 403);
      const member = body.member ?? {};
      const email = String(member.email ?? "").trim().toLowerCase().slice(0, 320);
      const name = String(member.name ?? "").trim().slice(0, 120);
      const role = ["Admin", "Team Leader", "Member", "Guest"].includes(String(member.role)) ? String(member.role) : "Member";
      const status = ["Active", "Invited"].includes(String(member.status)) ? String(member.status) : "Invited";
      const requestedWorkspaceIds = Array.from(new Set((Array.isArray(member.workspaceIds) ? member.workspaceIds : [context.workspaceId]).map((id: unknown) => String(id).trim()).filter(Boolean)));
      const validWorkspaceIds = requestedWorkspaceIds.filter(id => context.ownedWorkspaceIds.includes(id));
      if (!validWorkspaceIds.length) return json({ error: "Choose at least one workspace" }, 400);
      const memberByEmail = (await rest(`questdeck_members?select=id&email=ilike.${encodeURIComponent(email)}&limit=1`))?.[0] ?? null;
      const resolvedMemberId = action === "add_member" && memberByEmail ? Number(memberByEmail.id) : Number(member.id);
      const ownerAccount = memberByEmail ? (await rest(`questdeck_owner_accounts?select=member_id&member_id=eq.${memberByEmail.id}&limit=1`))?.[0] : null;
      if (ownerAccount) return json({ error: "Owner accounts cannot be assigned through workspace member management" }, 400);
      const record = {
        id: resolvedMemberId, name, email,
        initials: String(member.initials ?? "").trim().slice(0, 4),
        role: role === "Team Leader" ? "Member" : role,
        discipline: String(member.discipline ?? "General").trim().slice(0, 120), status,
        updated_at: new Date().toISOString(),
      };
      if (!Number.isSafeInteger(record.id) || !record.name || !record.email || !record.initials) return json({ error: "Invalid member" }, 400);
      if (action === "add_member") {
        if (!memberByEmail) {
          await rest("questdeck_members", {
            method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(record),
          });
        }
      } else {
        const existing = (await rest(`questdeck_members?select=id,role,email&id=eq.${record.id}&limit=1`))?.[0];
        if (!existing) return json({ error: "Member not found" }, 404);
        const existingMemberships = await rest(`questdeck_workspace_memberships?select=workspace_id,role&member_id=eq.${record.id}`);
        if ((existingMemberships ?? []).some((membership: any) => membership.role === "Owner")) return json({ error: "Owner accounts are managed in Owner administration" }, 400);
        if (!(existingMemberships ?? []).some((membership: any) => context.ownedWorkspaceIds.includes(String(membership.workspace_id)))) return json({ error: "Member is outside your workspaces" }, 403);
        await rest(`questdeck_members?id=eq.${record.id}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
            id: record.id, name: record.name, email: record.email, initials: record.initials,
            role: record.role, status: record.status, updated_at: record.updated_at,
          }),
        });
      }
      if (context.ownedWorkspaceIds.length) {
        await rest(`questdeck_workspace_memberships?member_id=eq.${record.id}&workspace_id=in.(${context.ownedWorkspaceIds.map((id: string) => `"${id.replaceAll('"', '')}"`).join(",")})`, { method: "DELETE" });
      }
      await rest("questdeck_workspace_memberships", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify(validWorkspaceIds.map(workspaceId => ({
          workspace_id: workspaceId,
          member_id: record.id,
          role,
          discipline: record.discipline,
          updated_at: new Date().toISOString(),
        }))),
      });
      await recordActivity(context, { action: action === "add_member" ? "added member" : "updated member", target: record.name, detail: `${record.role} · ${record.discipline}`, eventType: "Team", tone: "mint", destination: "roles" });
      return json({ ok: true, member: { ...record, role, workspaceIds: validWorkspaceIds } });
    }

    if (action === "remove_member") {
      if (!ownerOnly(context)) return json({ error: "Only owners can remove workspace access" }, 403);
      const memberId = Number(body.memberId);
      const existing = (await rest(`questdeck_members?select=id,auth_user_id&id=eq.${memberId}&limit=1`))?.[0];
      if (!existing) return json({ error: "Member not found" }, 404);
      const existingMemberships = await rest(`questdeck_workspace_memberships?select=workspace_id,role&member_id=eq.${memberId}`);
      if (existing.auth_user_id === context.member.auth_user_id) return json({ error: "Your own membership cannot be removed" }, 400);
      const shared = (existingMemberships ?? []).filter((membership: any) => context.ownedWorkspaceIds.includes(String(membership.workspace_id)));
      if (!shared.length) return json({ error: "Member is outside your workspaces" }, 403);
      const removable = shared.filter((membership: any) => membership.role !== "Owner");
      if (!removable.length) return json({ error: "An owner cannot be removed from a workspace they own" }, 400);
      await rest(`questdeck_workspace_memberships?member_id=eq.${memberId}&workspace_id=in.(${removable.map((item: any) => `"${String(item.workspace_id).replaceAll('"', '')}"`).join(",")})`, { method: "DELETE" });
      const remaining = await rest(`questdeck_workspace_memberships?select=id&member_id=eq.${memberId}&limit=1`);
      if (!(remaining?.length)) await rest(`questdeck_members?id=eq.${memberId}`, { method: "DELETE" });
      await recordActivity(context, { action: "removed member", target: `Member #${memberId}`, detail: `Removed from ${removable.length} workspace${removable.length === 1 ? "" : "s"}`, eventType: "Team", tone: "coral", destination: "roles" });
      return json({ ok: true, removedWorkspaceIds: removable.map((item: any) => String(item.workspace_id)) });
    }

    if (action === "update_role_permissions") {
      if (!allowed(context, "billing_security")) return json({ error: "Owner access required" }, 403);
      const role = String(body.role ?? "");
      const permissions = body.permissions ?? {};
      if (!["Admin", "Team Leader", "Member", "Guest"].includes(role)) return json({ error: "Owner permissions are fixed" }, 400);
      const record = {
        view_projects: Boolean(permissions.view_projects),
        edit_cards: Boolean(permissions.edit_cards),
        manage_members: false,
        workspace_settings: Boolean(permissions.workspace_settings),
        billing_security: false,
        updated_at: new Date().toISOString(),
      };
      await rest("questdeck_workspace_role_permissions?on_conflict=workspace_id,role", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ workspace_id: context.workspaceId, role, ...record }),
      });
      return json({ ok: true, role, permissions: record });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: "Sync failed" }, 500);
  }
});
