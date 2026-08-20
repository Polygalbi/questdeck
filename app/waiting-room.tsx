"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import "./waiting-room.css";

type Language = "en" | "ko";
type WaitingRequest = { id: number; email: string; displayName: string; targetWorkspaceId: string; targetWorkspaceName: string; requestedAt: string };
type Invitation = { workspaceId: string; workspaceName: string; workspaceInitials: string; status: string; joinCode: string };

async function send<T>(session: Session, action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch("/api/questdeck-sync", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data as T;
}

export function WaitingRoom({ session, language, pendingRequestCount, onSignOut }: { session: Session; language: Language; pendingRequestCount: number; onSignOut: () => void }) {
  const tr = (english: string, korean: string) => language === "ko" ? korean : english;
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState(() => String(session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split("@")[0] || ""));
  const [pending, setPending] = useState(pendingRequestCount > 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("join");
    if (code) setJoinCode(code);
  }, []);

  async function requestAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await send(session, "request_workspace_access", { joinCode, displayName });
      setPending(true);
      setJoinCode("");
      setMessage(tr("Request sent privately to the workspace owner.", "워크스페이스 소유자에게 비공개로 요청을 보냈습니다."));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : tr("Could not send request", "요청을 보내지 못했습니다"));
    } finally {
      setBusy(false);
    }
  }

  return <main className="waiting-room-page">
    <header><div><span>Q</span><b>Questdeck</b></div><button onClick={onSignOut}>{tr("Sign out", "로그아웃")}</button></header>
    <section className="waiting-room-card">
      <span className="waiting-lock">⌾</span>
      <small>{tr("PRIVATE WAITING ROOM", "비공개 대기실")}</small>
      <h1>{pending ? tr("Waiting for owner approval", "소유자 승인 대기 중") : tr("Request workspace access", "워크스페이스 접근 요청")}</h1>
      <p>{tr("No workspace names, projects, cards, documents, or member information are visible until an owner assigns you.", "소유자가 배정하기 전에는 워크스페이스 이름, 프로젝트, 카드, 문서 또는 멤버 정보가 전혀 표시되지 않습니다.")}</p>
      <div className="waiting-identity"><span>{displayName.slice(0, 2).toUpperCase()}</span><div><b>{displayName || tr("New member", "새 멤버")}</b><small>{session.user.email}</small></div><i>✓ {tr("Signed in", "로그인됨")}</i></div>
      {pending && <div className="waiting-pending"><span>◷</span><div><b>{tr("Your request is in the owner’s waiting list", "요청이 소유자의 대기 명단에 있습니다")}</b><p>{tr("You can check again after the owner approves it. You may also use another invitation code below.", "소유자가 승인한 후 다시 확인할 수 있습니다. 아래에서 다른 초대 코드를 사용할 수도 있습니다.")}</p></div></div>}
      <form onSubmit={requestAccess}>
        <label>{tr("Your display name", "표시 이름")}<input required maxLength={120} value={displayName} onChange={event => setDisplayName(event.target.value)} /></label>
        <label>{tr("Owner invitation code", "소유자 초대 코드")}<input required value={joinCode} onChange={event => setJoinCode(event.target.value.trim())} placeholder="00000000-0000-0000-0000-000000000000" /></label>
        <button className="create-button" type="submit" disabled={busy}>{busy ? tr("Sending…", "보내는 중…") : tr("Send access request", "접근 요청 보내기")}</button>
      </form>
      {message && <p className="waiting-message">{message}</p>}
      <footer><button onClick={() => window.location.reload()}>↻ {tr("Check access again", "접근 권한 다시 확인")}</button><small>{tr("Ask your workspace owner for their private invitation link or code.", "워크스페이스 소유자에게 비공개 초대 링크 또는 코드를 요청하세요.")}</small></footer>
    </section>
  </main>;
}

export function OwnerWaitingList({ session, language, activeWorkspaceId, disciplines, onToast }: { session: Session; language: Language; activeWorkspaceId: string; disciplines: string[]; onToast: (message: string) => void }) {
  const tr = (english: string, korean: string) => language === "ko" ? korean : english;
  const [requests, setRequests] = useState<WaitingRequest[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | string | null>(null);
  const [error, setError] = useState("");
  const pendingByWorkspace = useMemo(() => new Map(invitations.map(invitation => [invitation.workspaceId, requests.filter(request => request.targetWorkspaceId === invitation.workspaceId).length])), [invitations, requests]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await send<{ requests: WaitingRequest[]; invitations: Invitation[] }>(session, "load_waiting_requests", { workspaceId: activeWorkspaceId });
      setRequests(data.requests); setInvitations(data.invitations);
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Could not load waiting list", "대기 명단을 불러오지 못했습니다")); }
    finally { setLoading(false); }
  }, [session, activeWorkspaceId]);

  useEffect(() => { void load(); }, [load]);

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const requestId = Number(values.get("requestId"));
    setBusyId(requestId); setError("");
    try {
      await send(session, "approve_waiting_request", { workspaceId: activeWorkspaceId, requestId, role: String(values.get("role")), discipline: String(values.get("discipline")) });
      setRequests(current => current.filter(request => request.id !== requestId));
      onToast(tr("Member approved and assigned", "멤버를 승인하고 배정했습니다"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Could not approve member", "멤버를 승인하지 못했습니다")); }
    finally { setBusyId(null); }
  }

  async function decline(request: WaitingRequest) {
    if (!window.confirm(tr(`Decline ${request.displayName}'s request?`, `${request.displayName}님의 요청을 거절할까요?`))) return;
    setBusyId(request.id); setError("");
    try {
      await send(session, "decline_waiting_request", { workspaceId: activeWorkspaceId, requestId: request.id });
      setRequests(current => current.filter(item => item.id !== request.id));
      onToast(tr("Request declined", "요청을 거절했습니다"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Could not decline request", "요청을 거절하지 못했습니다")); }
    finally { setBusyId(null); }
  }

  async function copyInvitation(invitation: Invitation) {
    const url = new URL(window.location.origin);
    url.searchParams.set("join", invitation.joinCode);
    await navigator.clipboard.writeText(url.toString());
    onToast(tr("Private invitation link copied", "비공개 초대 링크를 복사했습니다"));
  }

  async function rotateInvitation(invitation: Invitation) {
    if (!window.confirm(tr("Replace this invitation code? The old link will stop working.", "이 초대 코드를 교체할까요? 이전 링크는 더 이상 작동하지 않습니다."))) return;
    setBusyId(invitation.workspaceId); setError("");
    try {
      const data = await send<{ joinCode: string }>(session, "rotate_join_code", { workspaceId: activeWorkspaceId, targetWorkspaceId: invitation.workspaceId });
      setInvitations(current => current.map(item => item.workspaceId === invitation.workspaceId ? { ...item, joinCode: data.joinCode } : item));
      onToast(tr("Invitation code replaced", "초대 코드를 교체했습니다"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Could not replace code", "코드를 교체하지 못했습니다")); }
    finally { setBusyId(null); }
  }

  return <div className="content owner-waiting-page">
    <div className="page-title owner-waiting-title"><div><p>{tr("OWNER ONLY", "소유자 전용")}</p><h1>{tr("Member waiting list", "멤버 대기 명단")}</h1><h2>{tr("Approve signed-in people only after they request one of your private workspaces.", "로그인한 사용자가 내 비공개 워크스페이스 중 하나를 요청한 후에만 승인하세요.")}</h2></div><button className="secondary-button" onClick={() => void load()} disabled={loading}>↻ {tr("Refresh", "새로고침")}</button></div>
    <section className="waiting-owner-note"><span>⌾</span><div><b>{tr("Tenant-safe waiting room", "테넌트 안전 대기실")}</b><p>{tr("Other owners cannot see these requests. Waiting users cannot see any workspace information until approval.", "다른 소유자는 이 요청을 볼 수 없습니다. 대기 중인 사용자는 승인 전까지 어떤 워크스페이스 정보도 볼 수 없습니다.")}</p></div></section>
    {error && <p className="waiting-owner-error">{error}</p>}
    <div className="waiting-owner-grid">
      <section className="waiting-owner-card waiting-request-list"><header><div><small>{tr("PENDING REQUESTS", "대기 중인 요청")}</small><h3>{requests.length} {tr(requests.length === 1 ? "person waiting" : "people waiting", "명 대기 중")}</h3></div></header>
        {loading ? <p className="waiting-empty">{tr("Loading waiting list…", "대기 명단 불러오는 중…")}</p> : requests.map(request => <article key={request.id}>
          <span>{request.displayName.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><b>{request.displayName}</b><small>{request.email}</small><em>{request.targetWorkspaceName} · {new Date(request.requestedAt).toLocaleDateString(language === "ko" ? "ko-KR" : "en-US")}</em></div>
          <form onSubmit={approve}><input type="hidden" name="requestId" value={request.id} /><select name="role" defaultValue="Member" aria-label={tr("Workspace role", "워크스페이스 역할")}><option>Member</option><option>Team Leader</option><option>Admin</option><option>Guest</option></select><select name="discipline" defaultValue="General" aria-label={tr("Primary discipline", "주요 분야")}>{disciplines.map(discipline => <option key={discipline}>{discipline}</option>)}</select><button className="create-button" type="submit" disabled={busyId === request.id}>✓ {tr("Approve", "승인")}</button><button type="button" onClick={() => void decline(request)} disabled={busyId === request.id}>× {tr("Decline", "거절")}</button></form>
        </article>)}{!loading && requests.length === 0 && <div className="waiting-empty"><span>✓</span><b>{tr("Nobody is waiting", "대기 중인 사용자가 없습니다")}</b><p>{tr("New requests will appear here after someone uses one of your invitation links.", "누군가 초대 링크를 사용하면 새 요청이 여기에 표시됩니다.")}</p></div>}
      </section>
      <aside className="waiting-owner-card invitation-list"><header><small>{tr("PRIVATE INVITATIONS", "비공개 초대")}</small><h3>{tr("Workspace join links", "워크스페이스 참여 링크")}</h3><p>{tr("Share the correct link with a person. It reveals nothing until you approve them.", "사용자에게 알맞은 링크를 공유하세요. 승인 전까지는 어떤 정보도 공개되지 않습니다.")}</p></header>{invitations.map(invitation => <article key={invitation.workspaceId}><span>{invitation.workspaceInitials}</span><div><b>{invitation.workspaceName}</b><small>{pendingByWorkspace.get(invitation.workspaceId) ?? 0} {tr("waiting", "명 대기")}</small></div><code>{invitation.joinCode}</code><button onClick={() => void copyInvitation(invitation)}>▣ {tr("Copy link", "링크 복사")}</button><button onClick={() => void rotateInvitation(invitation)} disabled={busyId === invitation.workspaceId}>↻ {tr("Replace", "교체")}</button></article>)}</aside>
    </div>
  </div>;
}
