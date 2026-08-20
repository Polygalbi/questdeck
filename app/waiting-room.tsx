"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import "./waiting-room.css";

type Language = "en" | "ko";
type WaitingRequest = { id: number; email: string; displayName: string; requestedAt: string; expiresAt: string };
type OwnedWorkspace = { workspaceId: string; workspaceName: string; workspaceInitials: string };

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
  const [displayName, setDisplayName] = useState(() => String(session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split("@")[0] || ""));
  const [pending, setPending] = useState(pendingRequestCount > 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function joinWaitingList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      await send(session, "request_workspace_access", { displayName });
      setPending(true);
      setMessage(tr("You are now visible in the Owner waiting list.", "이제 소유자 대기 명단에 표시됩니다."));
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : tr("Could not join the waiting list", "대기 명단에 등록하지 못했습니다")); }
    finally { setBusy(false); }
  }

  return <main className="waiting-room-page">
    <header><div><span>Q</span><b>Questdeck</b></div><button onClick={onSignOut}>{tr("Sign out", "로그아웃")}</button></header>
    <section className="waiting-room-card">
      <span className="waiting-lock">⌾</span>
      <small>{tr("QUESTDECK WAITING ROOM", "QUESTDECK 대기실")}</small>
      <h1>{pending ? tr("Waiting for an Owner", "소유자 초대 대기 중") : tr("Join the member waiting list", "멤버 대기 명단 참여")}</h1>
      <p>{tr("No workspace names, projects, cards, documents, or member information are visible before an Owner assigns you.", "소유자가 배정하기 전에는 워크스페이스 이름, 프로젝트, 카드, 문서 또는 멤버 정보가 전혀 표시되지 않습니다.")}</p>
      <div className="waiting-identity"><span>{displayName.slice(0, 2).toUpperCase()}</span><div><b>{displayName || tr("New member", "새 멤버")}</b><small>{session.user.email}</small></div><i>✓ {tr("Signed in", "로그인됨")}</i></div>
      {pending ? <div className="waiting-pending"><span>◷</span><div><b>{tr("Any Questdeck Owner can now invite you", "이제 모든 Questdeck 소유자가 초대할 수 있습니다")}</b><p>{tr("Your waiting-list entry expires automatically three days after your latest request.", "대기 명단 등록은 마지막 요청 후 3일이 지나면 자동으로 만료됩니다.")}</p></div></div> : <form onSubmit={joinWaitingList}><label>{tr("Your display name", "표시 이름")}<input required maxLength={120} value={displayName} onChange={event => setDisplayName(event.target.value)} /></label><button className="create-button" type="submit" disabled={busy}>{busy ? tr("Joining…", "등록 중…") : tr("Join waiting list", "대기 명단 참여")}</button></form>}
      {pending && <button className="waiting-renew" onClick={() => setPending(false)}>↻ {tr("Renew my 3-day request", "3일 요청 갱신")}</button>}
      {message && <p className="waiting-message">{message}</p>}
      <footer><button onClick={() => window.location.reload()}>↻ {tr("Check access again", "접근 권한 다시 확인")}</button><small>{tr("Only Owner accounts can view and manage this waiting list.", "소유자 계정만 이 대기 명단을 보고 관리할 수 있습니다.")}</small></footer>
    </section>
  </main>;
}

export function OwnerWaitingList({ session, language, activeWorkspaceId, disciplines, onToast }: { session: Session; language: Language; activeWorkspaceId: string; disciplines: string[]; onToast: (message: string) => void }) {
  const tr = (english: string, korean: string) => language === "ko" ? korean : english;
  const [requests, setRequests] = useState<WaitingRequest[]>([]);
  const [workspaces, setWorkspaces] = useState<OwnedWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await send<{ requests: WaitingRequest[]; workspaces: OwnedWorkspace[] }>(session, "load_waiting_requests", { workspaceId: activeWorkspaceId });
      setRequests(data.requests); setWorkspaces(data.workspaces);
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
      await send(session, "approve_waiting_request", { workspaceId: activeWorkspaceId, requestId, targetWorkspaceId: String(values.get("targetWorkspaceId")), role: String(values.get("role")), discipline: String(values.get("discipline")) });
      setRequests(current => current.filter(request => request.id !== requestId));
      onToast(tr("Member invited and assigned", "멤버를 초대하고 배정했습니다"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Could not invite member", "멤버를 초대하지 못했습니다")); }
    finally { setBusyId(null); }
  }

  async function decline(request: WaitingRequest) {
    if (!window.confirm(tr(`Remove ${request.displayName} from the waiting list?`, `${request.displayName}님을 대기 명단에서 삭제할까요?`))) return;
    setBusyId(request.id); setError("");
    try {
      await send(session, "decline_waiting_request", { workspaceId: activeWorkspaceId, requestId: request.id });
      setRequests(current => current.filter(item => item.id !== request.id));
      onToast(tr("Person removed from waiting list", "사용자를 대기 명단에서 삭제했습니다"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Could not remove person", "사용자를 삭제하지 못했습니다")); }
    finally { setBusyId(null); }
  }

  async function clearWaitingList() {
    if (!requests.length || !window.confirm(tr(`Clear all ${requests.length} waiting people?`, `대기 중인 ${requests.length}명을 모두 삭제할까요?`))) return;
    setBusyId("clear"); setError("");
    try {
      const data = await send<{ cleared: number }>(session, "clear_waiting_requests", { workspaceId: activeWorkspaceId });
      setRequests([]);
      onToast(tr(`Cleared ${data.cleared} waiting people`, `대기 중인 ${data.cleared}명을 삭제했습니다`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Could not clear waiting list", "대기 명단을 비우지 못했습니다")); }
    finally { setBusyId(null); }
  }

  return <div className="content owner-waiting-page">
    <div className="page-title owner-waiting-title"><div><p>{tr("OWNER ONLY", "소유자 전용")}</p><h1>{tr("Questdeck waiting list", "Questdeck 대기 명단")}</h1><h2>{tr("Invite any waiting person into one of your own workspaces.", "대기 중인 사용자를 내 워크스페이스 중 하나로 초대하세요.")}</h2></div><div><button className="secondary-button" onClick={() => void load()} disabled={loading}>↻ {tr("Refresh", "새로고침")}</button><button className="danger-button" onClick={() => void clearWaitingList()} disabled={!requests.length || busyId === "clear"}>× {tr("Clear list", "명단 비우기")}</button></div></div>
    <section className="waiting-owner-note"><span>◷</span><div><b>{tr("Automatic 3-day cleanup", "3일 자동 정리")}</b><p>{tr("A request disappears three days after it was submitted. Every Owner can see this Questdeck-wide list, but waiting people still see no workspace information.", "요청은 등록 후 3일이 지나면 사라집니다. 모든 소유자가 Questdeck 전체 대기 명단을 볼 수 있지만, 대기 중인 사용자는 워크스페이스 정보를 전혀 볼 수 없습니다.")}</p></div></section>
    {error && <p className="waiting-owner-error">{error}</p>}
    <section className="waiting-owner-card waiting-request-list global-waiting-list"><header><div><small>{tr("WAITING MEMBERS", "대기 멤버")}</small><h3>{requests.length} {tr(requests.length === 1 ? "person waiting" : "people waiting", "명 대기 중")}</h3></div></header>
      {loading ? <p className="waiting-empty">{tr("Loading waiting list…", "대기 명단 불러오는 중…")}</p> : requests.map(request => <article key={request.id}>
        <span>{request.displayName.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><b>{request.displayName}</b><small>{request.email}</small><em>{tr("Expires", "만료")} {new Date(request.expiresAt).toLocaleString(language === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</em></div>
        <form onSubmit={approve}><input type="hidden" name="requestId" value={request.id} /><select name="targetWorkspaceId" required defaultValue={workspaces[0]?.workspaceId ?? ""} aria-label={tr("Assign workspace", "배정 워크스페이스")}>{workspaces.map(workspace => <option value={workspace.workspaceId} key={workspace.workspaceId}>{workspace.workspaceName}</option>)}</select><select name="role" defaultValue="Member" aria-label={tr("Workspace role", "워크스페이스 역할")}><option>Member</option><option>Team Leader</option><option>Admin</option><option>Guest</option></select><select name="discipline" defaultValue="General" aria-label={tr("Primary discipline", "주요 분야")}>{disciplines.map(discipline => <option key={discipline}>{discipline}</option>)}</select><button className="create-button" type="submit" disabled={busyId === request.id || !workspaces.length}>＋ {tr("Invite", "초대")}</button><button type="button" onClick={() => void decline(request)} disabled={busyId === request.id}>× {tr("Remove", "삭제")}</button></form>
      </article>)}{!loading && requests.length === 0 && <div className="waiting-empty"><span>✓</span><b>{tr("Nobody is waiting", "대기 중인 사용자가 없습니다")}</b><p>{tr("New signed-in people can add themselves to this list without seeing workspace data.", "새로 로그인한 사용자는 워크스페이스 데이터를 보지 않고 이 명단에 직접 등록할 수 있습니다.")}</p></div>}
    </section>
  </div>;
}
