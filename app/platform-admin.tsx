"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import "./platform-admin.css";

type OwnerSummary = {
  id: number;
  name: string;
  email: string;
  status: "Active" | "Suspended";
  workspaceCount: number;
  createdAt?: string;
};

type Props = {
  session: Session;
  embedded?: boolean;
  language: "en" | "ko";
  onToast: (message: string) => void;
  onSignOut?: () => void;
};

export default function PlatformAdmin({ session, embedded = true, language, onToast, onSignOut }: Props) {
  const [owners, setOwners] = useState<OwnerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tr = (english: string, korean: string) => language === "ko" ? korean : english;

  const request = useCallback(async <T,>(action: string, payload: Record<string, unknown> = {}) => {
    const response = await fetch("/api/questdeck-sync", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Owner administration failed");
    return data as T;
  }, [session.access_token]);

  const loadOwners = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await request<{ owners: OwnerSummary[] }>("load_platform_owners");
      setOwners(data.owners);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Could not load owners", "소유자를 불러오지 못했습니다"));
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void loadOwners(); }, [loadOwners]);

  async function createOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await request("provision_owner", {
        name: String(values.get("name") || ""),
        email: String(values.get("email") || ""),
        workspaceName: String(values.get("workspaceName") || ""),
      });
      form.reset();
      await loadOwners();
      onToast(tr("Owner and private workspace created", "소유자와 비공개 워크스페이스를 만들었습니다"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Could not create owner", "소유자를 만들지 못했습니다"));
    } finally {
      setBusy(false);
    }
  }

  async function suspendOwner(owner: OwnerSummary) {
    if (owner.status === "Suspended") return;
    if (!window.confirm(tr(`Suspend ${owner.name}? They will move to the waiting list and lose all workspace access. Any workspace without another Owner will be permanently deleted.`, `${owner.name} 계정을 중지할까요? 이 사용자는 대기 명단으로 이동하고 모든 워크스페이스 접근 권한을 잃습니다. 다른 소유자가 없는 워크스페이스는 영구 삭제됩니다.`))) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<{ waitingListAdded: boolean; deletedWorkspaceCount: number }>("set_owner_status", { memberId: owner.id, status: "Suspended" });
      setOwners(current => current.map(item => item.id === owner.id ? { ...item, status: "Suspended", workspaceCount: 0 } : item));
      const waitingMessage = result.waitingListAdded ? tr("moved to the waiting list", "대기 명단으로 이동") : tr("will enter the waiting room after signing in", "로그인 후 대기실로 이동");
      const deletedMessage = result.deletedWorkspaceCount ? tr(`; ${result.deletedWorkspaceCount} ownerless workspace deleted`, `; 소유자 없는 워크스페이스 ${result.deletedWorkspaceCount}개 삭제`) : "";
      onToast(`${owner.name}: ${waitingMessage}${deletedMessage}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Could not update owner", "소유자를 업데이트하지 못했습니다"));
    } finally {
      setBusy(false);
    }
  }

  const content = <div className="platform-admin-content">
    <div className="platform-admin-title">
      <div><p>{tr("PLATFORM CONTROL", "플랫폼 관리")}</p><h1>{tr("Owner administration", "소유자 관리")}</h1><h2>{tr("Create independent owners without opening their production data.", "프로덕션 데이터를 노출하지 않고 독립 소유자를 만드세요.")}</h2></div>
      <span className="content-blind-badge">◉ {tr("Content-blind", "콘텐츠 비공개")}</span>
    </div>

    <section className="platform-privacy-banner">
      <span>⌾</span><div><b>{tr("Separate control plane", "분리된 관리 영역")}</b><p>{tr("This page shows only owner identity, account status, and workspace count. It cannot open workspace names, projects, cards, documents, or member content.", "이 페이지에는 소유자 신원, 계정 상태, 워크스페이스 수만 표시됩니다. 워크스페이스 이름, 프로젝트, 카드, 문서 또는 멤버 콘텐츠는 열 수 없습니다.")}</p></div>
    </section>

    {error && <p className="platform-admin-error">{error}</p>}
    <div className="platform-admin-grid">
      <section className="platform-admin-card owner-directory">
        <header><div><small>{tr("OWNER ACCOUNTS", "소유자 계정")}</small><h3>{owners.length} {tr(owners.length === 1 ? "owner" : "owners", "명")}</h3></div><button onClick={() => void loadOwners()} disabled={loading || busy}>↻ {tr("Refresh", "새로고침")}</button></header>
        {loading ? <div className="owner-loading">{tr("Loading owners…", "소유자 불러오는 중…")}</div> : <div className="owner-list">{owners.map(owner => <article key={owner.id} className={owner.status === "Suspended" ? "suspended" : ""}>
          <span>{owner.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase()}</span>
          <div><b>{owner.name}</b><small>{owner.email}</small><em>{owner.workspaceCount} {tr(owner.workspaceCount === 1 ? "private workspace" : "private workspaces", "개 비공개 워크스페이스")}</em></div>
          <i>{tr(owner.status, owner.status === "Active" ? "활성" : "일시 중지")}</i>
          <button disabled={busy || owner.status === "Suspended"} onClick={() => void suspendOwner(owner)}>{owner.status === "Active" ? tr("Suspend", "중지") : tr("In waiting list", "대기 명단")}</button>
        </article>)}{owners.length === 0 && <p className="owner-loading">{tr("No owner accounts yet.", "아직 소유자 계정이 없습니다.")}</p>}</div>}
      </section>

      <section className="platform-admin-card create-owner-card">
        <small>{tr("NEW OWNER", "새 소유자")}</small><h3>{tr("Create an isolated account", "분리된 계정 만들기")}</h3><p>{tr("The owner gets one private starter workspace. They sign in normally with this email—there is no shared admin password.", "소유자에게 비공개 시작 워크스페이스 하나가 제공됩니다. 공유 관리자 비밀번호 없이 이 이메일로 정상 로그인합니다.")}</p>
        <form onSubmit={createOwner}>
          <label>{tr("Owner name", "소유자 이름")}<input name="name" required maxLength={120} placeholder={tr("e.g. Mina Park", "예: 박민아")} /></label>
          <label>{tr("Sign-in email", "로그인 이메일")}<input name="email" type="email" required maxLength={320} placeholder="owner@example.com" /></label>
          <label>{tr("First workspace", "첫 워크스페이스")}<input name="workspaceName" required maxLength={160} placeholder={tr("e.g. Moonlight Studio", "예: 문라이트 스튜디오")} /></label>
          <button className="create-button" type="submit" disabled={busy}>＋ {busy ? tr("Creating…", "만드는 중…") : tr("Create owner", "소유자 만들기")}</button>
        </form>
      </section>
    </div>
  </div>;

  if (embedded) return <div className="content platform-admin-page">{content}</div>;
  return <main className="platform-admin-standalone"><header><div><span>Q</span><b>Questdeck</b></div><button onClick={onSignOut}>{tr("Sign out", "로그아웃")}</button></header>{content}</main>;
}
