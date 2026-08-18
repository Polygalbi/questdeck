"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

type Status = "Ready" | "In progress" | "Review" | "Done";
type View = "overview" | "quests" | "timeline" | "milestones" | "activity" | "management" | "projects-management" | "roles" | "account";
type Card = { id: number; title: string; description: string; tag: string; owner: string; points: number; color: string; status: Status; project: string; due: string };
type Account = { displayName: string; email: string; fullName: string | null };
type RoleName = "Owner" | "Admin" | "Member" | "Guest";
type PermissionKey = "view_projects" | "edit_cards" | "manage_members" | "workspace_settings" | "billing_security";
type RolePermissions = Record<PermissionKey, boolean>;
type RoleDefinition = { name: RoleName; description: string; color: string; permissions: RolePermissions };
type Member = { id: number; name: string; email: string; initials: string; role: RoleName; discipline: string; status: "Active" | "Invited" };
type Workspace = { id: string; name: string; initials: string; members: number; status: "Active" | "Archived" };
type Notification = { id: number; title: string; detail: string; time: string; icon: string; tone: string; read: boolean; destination: View };
type Project = { id: string; name: string; count: number; color: string; owner: string; status: "Active" | "On hold" | "Archived"; progress: number; updated: string };
type SubTodo = { id: number; text: string; done: boolean };

const SUPABASE_URL = "https://duddukvihvuoqawsoqus.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_TcigjkGnxplktO6uSngk8w_UETJmWR6";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

type SupabaseCard = {
  id: number;
  title: string;
  description: string;
  tag: string;
  owner_initials: string;
  points: number;
  color: string;
  status: Status;
  due_label: string;
  questdeck_projects: { name: string };
};

type SupabaseSubTodo = { id: number; card_id: number; text: string; done: boolean; sort_order: number };

async function syncQuestdeck<T = { ok: boolean }>(action: string, payload: Record<string, unknown>, accessToken: string): Promise<T> {
  const response = await fetch("/api/questdeck-sync", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Supabase sync failed");
  return data as T;
}

const initialCards: Card[] = [
  { id: 1, title: "Tune player movement", description: "Make traversal feel crisp and responsive before the next playtest.", tag: "GAMEPLAY", owner: "MK", points: 3, color: "violet", status: "In progress", project: "Project Nightfall", due: "Today" },
  { id: 2, title: "Forest ambience pass", description: "Layer environmental loops for the northern forest biome.", tag: "AUDIO", owner: "JL", points: 2, color: "mint", status: "Ready", project: "Project Nightfall", due: "Today" },
  { id: 3, title: "Boss arena concept", description: "Explore three silhouettes and arena lighting directions.", tag: "ART", owner: "AS", points: 5, color: "coral", status: "Review", project: "Project Nightfall", due: "Tomorrow" },
  { id: 4, title: "Controller remapping", description: "Allow players to fully remap gamepad controls.", tag: "ENGINEERING", owner: "NK", points: 5, color: "blue-card", status: "Ready", project: "Project Nightfall", due: "Aug 22" },
  { id: 5, title: "Steam page refresh", description: "Update key art, capsule copy, and screenshots for the showcase.", tag: "MARKETING", owner: "JR", points: 3, color: "amber-card", status: "In progress", project: "Marketing", due: "Aug 21" },
  { id: 6, title: "Chapter two dialogue", description: "Final narrative edit and implementation notes.", tag: "NARRATIVE", owner: "JK", points: 2, color: "rose-card", status: "Review", project: "Project Nightfall", due: "Aug 23" },
  { id: 7, title: "Playtest build 0.8", description: "Lock the candidate build and verify critical paths.", tag: "RELEASE", owner: "MK", points: 8, color: "violet", status: "Done", project: "Project Nightfall", due: "Aug 16" },
  { id: 8, title: "New starter checklist", description: "Document local setup and first-week studio rituals.", tag: "STUDIO", owner: "AS", points: 1, color: "mint", status: "Done", project: "Studio Ops", due: "Aug 15" },
];

const initialProjects: Project[] = [
  { id: "nightfall", name: "Project Nightfall", count: 24, color: "purple", owner: "Mina Kwon", status: "Active", progress: 68, updated: "12 minutes ago" },
  { id: "marketing", name: "Marketing", count: 8, color: "yellow", owner: "Jamie Kim", status: "Active", progress: 44, updated: "2 hours ago" },
  { id: "studio-ops", name: "Studio Ops", count: 4, color: "blue", owner: "Alex Santos", status: "On hold", progress: 25, updated: "Yesterday" },
];

const productionStages: Status[] = ["Ready", "In progress", "Review", "Done"];

const initialMembers: Member[] = [
  { id: 1000, name: "Polygalbi", email: "polygalbi@gmail.com", initials: "PO", role: "Owner", discipline: "Production", status: "Active" },
  { id: 1, name: "Jamie Kim", email: "jamie@starfall.studio", initials: "JK", role: "Admin", discipline: "Production", status: "Active" },
  { id: 2, name: "Mina Kwon", email: "mina@starfall.studio", initials: "MK", role: "Admin", discipline: "Game Design", status: "Active" },
  { id: 3, name: "Alex Santos", email: "alex@starfall.studio", initials: "AS", role: "Member", discipline: "Art", status: "Active" },
  { id: 4, name: "Jules Lee", email: "jules@starfall.studio", initials: "JL", role: "Member", discipline: "Audio", status: "Active" },
  { id: 5, name: "Noah Kim", email: "noah@starfall.studio", initials: "NK", role: "Member", discipline: "Engineering", status: "Active" },
];

const initialWorkspaces: Workspace[] = [
  { id: "starfall", name: "Starfall Studio", initials: "SF", members: 5, status: "Active" },
  { id: "nightfall", name: "Nightfall Strike Team", initials: "NS", members: 3, status: "Active" },
];

const initialNotifications: Notification[] = [
  { id: 1, title: "Boss arena is ready for review", detail: "Alex moved the concept card to Review.", time: "18m", icon: "AS", tone: "coral", read: false, destination: "quests" },
  { id: 2, title: "Festival demo is 12 days away", detail: "16 cards remain before the milestone.", time: "1h", icon: "◆", tone: "violet", read: false, destination: "milestones" },
  { id: 3, title: "New comment on movement tuning", detail: "Mina mentioned you in a playtest note.", time: "2h", icon: "MK", tone: "mint", read: false, destination: "quests" },
  { id: 4, title: "Cave reverb zones completed", detail: "Jules finished an Audio card.", time: "Yesterday", icon: "JL", tone: "blue-card", read: true, destination: "overview" },
];

const initialRoleDefinitions: RoleDefinition[] = [
  { name: "Owner", description: "Full workspace control, billing, and security.", color: "violet", permissions: { view_projects: true, edit_cards: true, manage_members: true, workspace_settings: true, billing_security: true } },
  { name: "Admin", description: "Manage members, projects, and production settings.", color: "coral", permissions: { view_projects: true, edit_cards: true, manage_members: true, workspace_settings: true, billing_security: false } },
  { name: "Member", description: "Create and update cards across assigned projects.", color: "mint", permissions: { view_projects: true, edit_cards: true, manage_members: false, workspace_settings: false, billing_security: false } },
  { name: "Guest", description: "Review and comment on specifically shared work.", color: "blue-card", permissions: { view_projects: true, edit_cards: false, manage_members: false, workspace_settings: false, billing_security: false } },
];

const permissionRows: { key: PermissionKey; english: string; korean: string }[] = [
  { key: "view_projects", english: "View projects", korean: "프로젝트 보기" },
  { key: "edit_cards", english: "Create & edit cards", korean: "카드 만들기 및 편집" },
  { key: "manage_members", english: "Manage members", korean: "멤버 관리" },
  { key: "workspace_settings", english: "Workspace settings", korean: "워크스페이스 설정" },
  { key: "billing_security", english: "Billing & security", korean: "결제 및 보안" },
];

const activityEvents = [
  { id: 1, person: "Alex Santos", initials: "AS", action: "moved", target: "Boss arena concept", detail: "In progress → Review", project: "Project Nightfall", type: "Cards", time: "18 minutes ago", tone: "coral" },
  { id: 2, person: "Jules Lee", initials: "JL", action: "completed", target: "Cave reverb zones", detail: "Card completed", project: "Project Nightfall", type: "Cards", time: "42 minutes ago", tone: "mint" },
  { id: 3, person: "Mina Kwon", initials: "MK", action: "commented on", target: "Tune player movement", detail: "“The latest build feels much sharper.”", project: "Project Nightfall", type: "Comments", time: "1 hour ago", tone: "violet" },
  { id: 4, person: "Jamie Kim", initials: "JK", action: "updated milestone", target: "Festival demo", detail: "Progress increased from 62% to 68%", project: "Project Nightfall", type: "Milestones", time: "3 hours ago", tone: "amber-card" },
  { id: 5, person: "Noah Kim", initials: "NK", action: "created", target: "Controller remapping", detail: "Assigned to Engineering · 5 points", project: "Project Nightfall", type: "Cards", time: "Yesterday", tone: "blue-card" },
  { id: 6, person: "Jamie Kim", initials: "JK", action: "invited", target: "Robin Park", detail: "Member access · Marketing", project: "Marketing", type: "Team", time: "Yesterday", tone: "violet" },
];

const initialSubTodos: Record<number, SubTodo[]> = {
  1: [{ id: 101, text: "Verify keyboard controls", done: true }, { id: 102, text: "Test with controller", done: true }, { id: 103, text: "Capture playtest notes", done: false }],
  3: [{ id: 301, text: "Choose final silhouette", done: true }, { id: 302, text: "Review arena lighting", done: false }],
};

const timelineDays = ["Mon 17", "Tue 18", "Wed 19", "Thu 20", "Fri 21", "Sat 22", "Sun 23", "Mon 24", "Tue 25", "Wed 26", "Thu 27", "Fri 28", "Sat 29", "Sun 30"];
const timelineLanes = [
  { team: "DESIGN", owner: "MK", tone: "violet", bars: [{ title: "Movement tuning", start: 1, span: 3, progress: 74 }, { title: "Boss encounter", start: 5, span: 4, progress: 38 }, { title: "Difficulty pass", start: 10, span: 3, progress: 0 }] },
  { team: "ART", owner: "AS", tone: "coral", bars: [{ title: "Forest props", start: 0, span: 4, progress: 100 }, { title: "Arena concepts", start: 4, span: 5, progress: 62 }, { title: "Demo polish", start: 10, span: 4, progress: 0 }] },
  { team: "CODE", owner: "NK", tone: "blue-card", bars: [{ title: "Input remapping", start: 2, span: 4, progress: 55 }, { title: "Save system QA", start: 7, span: 3, progress: 15 }, { title: "Build candidate", start: 11, span: 3, progress: 0 }] },
  { team: "AUDIO", owner: "JL", tone: "mint", bars: [{ title: "Forest ambience", start: 1, span: 5, progress: 81 }, { title: "Boss mix", start: 8, span: 4, progress: 20 }] },
];

function QuestCard({ card, onOpen, compact = false, todoSummary }: { card: Card; onOpen: (card: Card) => void; compact?: boolean; todoSummary?: { completed: number; total: number } }) {
  return <button className={`quest-card ${compact ? "compact" : ""}`} onClick={() => onOpen(card)} aria-label={`Open ${card.title}`}>
    <div className={`card-accent ${card.color}`}><span>{card.tag}</span><b>{card.points}</b></div>
    <div className="card-body"><small>{card.project.toUpperCase()}</small><h4>{card.title}</h4>{!compact && <p>{card.description}</p>}{todoSummary && todoSummary.total > 0 && <div className="card-subtask-progress" aria-label={`${todoSummary.completed} of ${todoSummary.total} sub-tasks complete`}><span><i style={{width:`${(todoSummary.completed / todoSummary.total) * 100}%`}} /></span><b>☑ {todoSummary.completed}/{todoSummary.total}</b></div>}<div className="card-footer"><span className="avatar">{card.owner}</span><span>◷ {card.due}</span><span>◌ {card.id % 4}</span></div></div>
  </button>;
}

export default function Home() {
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [dataSource, setDataSource] = useState<"connecting" | "supabase" | "local">("connecting");
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("All projects");
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<Status>("Ready");
  const [activeColumnMenu, setActiveColumnMenu] = useState<Status | null>(null);
  const [editColumn, setEditColumn] = useState<Status | null>(null);
  const [columnNames, setColumnNames] = useState<Partial<Record<Status, string>>>({});
  const [selected, setSelected] = useState<Card | null>(null);
  const [toast, setToast] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [studioName, setStudioName] = useState("Starfall Studio");
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("starfall");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [roleDefinitions, setRoleDefinitions] = useState<RoleDefinition[]>(initialRoleDefinitions);
  const [currentPermissions, setCurrentPermissions] = useState<RolePermissions | null>(null);
  const [memberRoleFilter, setMemberRoleFilter] = useState<RoleName | "All">("All");
  const [projectStatusFilter, setProjectStatusFilter] = useState("All");
  const [projectSearch, setProjectSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState("All activity");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [language, setLanguage] = useState<"en" | "ko">("en");
  const [subTodos, setSubTodos] = useState<Record<number, SubTodo[]>>(initialSubTodos);
  const [editCardOpen, setEditCardOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    const headers = { apikey: SUPABASE_PUBLISHABLE_KEY };
    Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/questdeck_cards?select=id,title,description,tag,owner_initials,points,color,status,due_label,questdeck_projects(name)&order=id.asc`, { headers }).then(response => {
        if (!response.ok) throw new Error("Supabase card request failed");
        return response.json() as Promise<SupabaseCard[]>;
      }),
      fetch(`${SUPABASE_URL}/rest/v1/questdeck_subtasks?select=id,card_id,text,done,sort_order&order=card_id.asc,sort_order.asc`, { headers }).then(response => {
        if (!response.ok) throw new Error("Supabase sub-task request failed");
        return response.json() as Promise<SupabaseSubTodo[]>;
      }),
    ])
      .then(([remoteCards, remoteSubTodos]) => {
        const mapped = remoteCards.map(card => ({
          id: card.id, title: card.title, description: card.description, tag: card.tag, owner: card.owner_initials,
          points: card.points, color: card.color, status: card.status, project: card.questdeck_projects.name, due: card.due_label,
        } satisfies Card));
        setCards(mapped);

        const remoteTodos = remoteSubTodos.reduce<Record<number, SubTodo[]>>((all, todo) => {
          (all[todo.card_id] ??= []).push({ id: todo.id, text: todo.text, done: todo.done });
          return all;
        }, {});
        setSubTodos(remoteTodos);
        setDataSource("supabase");
      })
      .catch(() => setDataSource("local"));
  }, []);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session?.access_token) {
      setCurrentPermissions(null);
      return;
    }
    void syncQuestdeck<{
      projects: Array<{ id: string; name: string; card_count: number; color: string; owner: string; status: Project["status"]; progress: number; updated_label: string }>;
      workspaces: Array<{ id: string; name: string; initials: string; member_count: number; status: Workspace["status"] }>;
      members: Member[];
      roles: Array<{ role: RoleName } & RolePermissions>;
      permissions: RolePermissions;
    }>("load_admin", {}, session.access_token).then(data => {
      setProjects(data.projects.map(item => ({ id: item.id, name: item.name, count: item.card_count, color: item.color, owner: item.owner, status: item.status, progress: item.progress, updated: item.updated_label })));
      setWorkspaces(data.workspaces.map(item => ({ id: item.id, name: item.name, initials: item.initials, members: item.member_count, status: item.status })));
      setMembers(data.members);
      setRoleDefinitions(initialRoleDefinitions.map(definition => {
        const saved = data.roles.find(role => role.role === definition.name);
        return saved ? { ...definition, permissions: { view_projects: saved.view_projects, edit_cards: saved.edit_cards, manage_members: saved.manage_members, workspace_settings: saved.workspace_settings, billing_security: saved.billing_security } } : definition;
      }));
      setCurrentPermissions(data.permissions);
    }).catch(error => setToast(error instanceof Error ? error.message : tr("Could not load workspace access", "워크스페이스 권한을 불러오지 못했습니다")));
  }, [session?.access_token]);
  useEffect(() => { window.localStorage.setItem("questdeck-cards", JSON.stringify(cards)); }, [cards]);
  useEffect(() => {
    const saved = window.localStorage.getItem("questdeck-column-names");
    if (saved) {
      try { setColumnNames(JSON.parse(saved)); } catch { /* Keep the standard workflow names. */ }
    }
  }, []);
  useEffect(() => { window.localStorage.setItem("questdeck-column-names", JSON.stringify(columnNames)); }, [columnNames]);
  useEffect(() => {
    fetch("/api/account").then(response => response.ok ? response.json() : null).then(data => data && setAccount(data)).catch(() => {});
    const savedMembers = window.localStorage.getItem("questdeck-members");
    const savedSettings = window.localStorage.getItem("questdeck-workspace-settings");
    const savedWorkspaces = window.localStorage.getItem("questdeck-workspaces");
    const savedNotifications = window.localStorage.getItem("questdeck-notifications");
    const savedProjects = window.localStorage.getItem("questdeck-projects");
    const savedLanguage = window.localStorage.getItem("questdeck-language");
    if (savedMembers) { try { setMembers(JSON.parse(savedMembers)); } catch {} }
    if (savedSettings) { try { const parsed = JSON.parse(savedSettings); setStudioName(parsed.studioName ?? "Starfall Studio"); setWeeklyDigest(parsed.weeklyDigest ?? true); } catch {} }
    if (savedWorkspaces) { try { const parsed = JSON.parse(savedWorkspaces); setWorkspaces((parsed.workspaces ?? initialWorkspaces).map((workspace: Workspace) => ({ ...workspace, status: workspace.status ?? "Active" }))); setActiveWorkspaceId(parsed.activeWorkspaceId ?? "starfall"); } catch {} }
    if (savedNotifications) { try { setNotifications(JSON.parse(savedNotifications)); } catch {} }
    if (savedProjects) { try { setProjects(JSON.parse(savedProjects)); } catch {} }
    if (savedLanguage === "ko" || savedLanguage === "en") setLanguage(savedLanguage);
  }, []);
  useEffect(() => { window.localStorage.setItem("questdeck-members", JSON.stringify(members)); }, [members]);
  useEffect(() => { window.localStorage.setItem("questdeck-workspaces", JSON.stringify({ workspaces, activeWorkspaceId })); }, [workspaces, activeWorkspaceId]);
  useEffect(() => { window.localStorage.setItem("questdeck-notifications", JSON.stringify(notifications)); }, [notifications]);
  useEffect(() => { window.localStorage.setItem("questdeck-projects", JSON.stringify(projects)); }, [projects]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2600); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { setMobileNavOpen(false); }, [view]);
  useEffect(() => { window.localStorage.setItem("questdeck-language", language); document.documentElement.lang = language; }, [language]);
  useEffect(() => { window.localStorage.setItem("questdeck-sub-todos", JSON.stringify(subTodos)); }, [subTodos]);

  const filtered = useMemo(() => cards.filter(card => {
    const matchesQuery = `${card.title} ${card.description} ${card.tag} ${card.project}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (project === "All projects" || card.project === project);
  }), [cards, query, project]);

  function requireSession() {
    if (session?.access_token) return session.access_token;
    setAuthOpen(true);
    setAuthMessage(tr("Sign in to save changes to the shared workspace.", "공유 워크스페이스에 변경 사항을 저장하려면 로그인하세요."));
    return null;
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email")).trim();
    const password = String(data.get("password"));
    setAuthBusy(true);
    setAuthMessage("");
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);
    if (result.error) {
      setAuthMessage(result.error.message);
      return;
    }
    if (authMode === "signup" && !result.data.session) {
      setAuthMessage(tr("Check your email to confirm your account, then sign in.", "이메일에서 계정을 확인한 후 로그인하세요."));
      setAuthMode("signin");
      return;
    }
    setAuthOpen(false);
    setToast(tr("Signed in — changes now sync to Supabase", "로그인했습니다 — 변경 사항이 Supabase에 동기화됩니다"));
  }

  async function handleGitHubSignIn() {
    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setAuthBusy(false);
      setAuthMessage(error.message);
    }
  }

  function createCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = requireSession();
    if (!accessToken) return;
    const data = new FormData(event.currentTarget);
    const newCard: Card = {
      id: Date.now(), title: String(data.get("title")), description: String(data.get("description") || "A newly forged quest, ready for the team."),
      tag: String(data.get("tag")), owner: "JK", points: Number(data.get("points")), color: "violet", status: createStatus, project: String(data.get("project")), due: "New",
    };
    setCards(prev => [newCard, ...prev]); setCreateOpen(false); setToast("Card added to your deck"); setView("quests");
    void syncQuestdeck("create_card", { card: newCard }, accessToken).catch(() => setToast(tr("Card saved locally; Supabase sync failed", "카드는 로컬에 저장되었지만 Supabase 동기화에 실패했습니다")));
  }

  function openCreateCard(status: Status = "Ready") {
    setCreateStatus(status);
    setActiveColumnMenu(null);
    if (session) setCreateOpen(true);
    else setAuthOpen(true);
  }

  function renameColumn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editColumn) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name")).trim();
    setColumnNames(current => ({ ...current, [editColumn]: name }));
    setEditColumn(null);
    setToast(tr("Column name updated", "열 이름을 수정했습니다"));
  }

  function resetColumnName(status: Status) {
    setColumnNames(current => {
      const next = { ...current };
      delete next[status];
      return next;
    });
    setActiveColumnMenu(null);
    setToast(tr("Column name reset", "열 이름을 기본값으로 되돌렸습니다"));
  }

  function updateStatus(card: Card, status: Status) {
    const accessToken = requireSession();
    if (!accessToken) return;
    const updated = { ...card, status };
    setCards(prev => prev.map(item => item.id === card.id ? updated : item));
    setSelected(updated); setToast(`Moved to ${status}`);
    void syncQuestdeck("update_card", { card: updated }, accessToken).catch(() => setToast(tr("Status saved locally; Supabase sync failed", "상태는 로컬에 저장되었지만 Supabase 동기화에 실패했습니다")));
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = requireSession();
    if (!accessToken) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email")).trim().toLowerCase();
    const name = String(data.get("name") || email.split("@")[0]);
    const initials = name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
    const member: Member = { id: Date.now(), name, email, initials, role: String(data.get("role")) as Member["role"], discipline: String(data.get("discipline") || "General"), status: "Invited" };
    try {
      await syncQuestdeck("add_member", { member }, accessToken);
      setMembers(current => [...current, member]);
      setInviteOpen(false);
      setToast(tr(`${name} was added to workspace access`, `${name}님을 워크스페이스 권한에 추가했습니다`));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not add member", "멤버를 추가하지 못했습니다"));
    }
  }

  function saveWorkspaceSettings() {
    window.localStorage.setItem("questdeck-workspace-settings", JSON.stringify({ studioName, weeklyDigest }));
    setToast("Workspace preferences saved on this device");
  }

  function openNotification(item: Notification) {
    setNotifications(current => current.map(notification => notification.id === item.id ? { ...notification, read: true } : notification));
    setNotificationOpen(false);
    setView(item.destination);
  }

  function switchWorkspace(workspace: Workspace) {
    setActiveWorkspaceId(workspace.id);
    setStudioName(workspace.name);
    setWorkspaceOpen(false);
    setToast(`Switched to ${workspace.name}`);
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = requireSession();
    if (!accessToken) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name")).trim();
    const initials = name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
    const workspace: Workspace = { id: String(Date.now()), name, initials, members: 1, status: "Active" };
    try {
      await syncQuestdeck("create_workspace", { workspace }, accessToken);
      setWorkspaces(current => [...current, workspace]);
      setActiveWorkspaceId(workspace.id);
      setStudioName(name);
      setCreateWorkspaceOpen(false);
      setWorkspaceOpen(false);
      setToast(tr(`${name} workspace created`, `${name} 워크스페이스를 만들었습니다`));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not create workspace", "워크스페이스를 만들지 못했습니다"));
    }
  }

  async function setWorkspaceStatus(workspace: Workspace, status: Workspace["status"]) {
    const accessToken = requireSession();
    if (!accessToken) return;
    try {
      await syncQuestdeck("set_workspace_status", { workspaceId: workspace.id, status }, accessToken);
      setWorkspaces(current => current.map(item => item.id === workspace.id ? { ...item, status } : item));
      if (status === "Archived" && activeWorkspaceId === workspace.id) {
        const fallback = workspaces.find(item => item.id !== workspace.id && item.status === "Active");
        if (fallback) { setActiveWorkspaceId(fallback.id); setStudioName(fallback.name); }
      }
      setToast(status === "Archived" ? tr("Workspace archived", "워크스페이스를 보관했습니다") : tr("Workspace restored", "워크스페이스를 복원했습니다"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not update workspace", "워크스페이스를 수정하지 못했습니다"));
    }
  }

  async function deleteWorkspace(workspace: Workspace) {
    const accessToken = requireSession();
    if (!accessToken || !window.confirm(tr(`Permanently delete ${workspace.name}? This cannot be undone.`, `${workspace.name}을(를) 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))) return;
    try {
      await syncQuestdeck("delete_workspace", { workspaceId: workspace.id }, accessToken);
      const remaining = workspaces.filter(item => item.id !== workspace.id);
      setWorkspaces(remaining);
      if (activeWorkspaceId === workspace.id) {
        const fallback = remaining.find(item => item.status === "Active") ?? remaining[0];
        setActiveWorkspaceId(fallback.id);
        setStudioName(fallback.name);
      }
      setToast(tr("Workspace permanently deleted", "워크스페이스를 영구 삭제했습니다"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not delete workspace", "워크스페이스를 삭제하지 못했습니다"));
    }
  }

  async function saveMemberEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editMember) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name")).trim();
    const updated: Member = {
      ...editMember,
      name,
      email: String(data.get("email")).trim().toLowerCase(),
      initials: name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase(),
      role: String(data.get("role")) as RoleName,
      discipline: String(data.get("discipline")).trim(),
      status: String(data.get("status")) as Member["status"],
    };
    try {
      await syncQuestdeck("update_member", { member: updated }, accessToken);
      setMembers(current => current.map(item => item.id === updated.id ? updated : item));
      setEditMember(null);
      setToast(tr("Member access updated", "멤버 권한을 수정했습니다"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not update member", "멤버를 수정하지 못했습니다"));
    }
  }

  async function removeMember(member: Member) {
    const accessToken = requireSession();
    if (!accessToken || !window.confirm(tr(`Remove ${member.name} from this workspace?`, `${member.name}님을 이 워크스페이스에서 삭제할까요?`))) return;
    try {
      await syncQuestdeck("remove_member", { memberId: member.id }, accessToken);
      setMembers(current => current.filter(item => item.id !== member.id));
      setEditMember(null);
      setToast(tr("Member removed", "멤버를 삭제했습니다"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not remove member", "멤버를 삭제하지 못했습니다"));
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = requireSession();
    if (!accessToken) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name"));
    const colors = ["purple", "yellow", "blue"];
    const newProject: Project = { id: String(Date.now()), name, count: 0, color: colors[projects.length % colors.length], owner: String(data.get("owner")), status: "Active", progress: 0, updated: "Just now" };
    try {
      await syncQuestdeck("create_project", { project: newProject }, accessToken);
      setProjects(current => [...current, newProject]);
      setCreateProjectOpen(false);
      setToast(`${name} project created`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not create project", "프로젝트를 만들지 못했습니다"));
    }
  }

  async function saveProjectEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editProject) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    const data = new FormData(event.currentTarget);
    const updated: Project = {
      ...editProject,
      name: String(data.get("name")).trim(),
      owner: String(data.get("owner")),
      status: String(data.get("status")) as Project["status"],
      progress: Number(data.get("progress")),
      color: String(data.get("color")),
      updated: "Just now",
    };
    try {
      await syncQuestdeck("update_project", { project: updated }, accessToken);
      setProjects(current => current.map(item => item.id === updated.id ? updated : item));
      setCards(current => current.map(card => card.project === editProject.name ? { ...card, project: updated.name } : card));
      if (project === editProject.name) setProject(updated.name);
      setEditProject(null);
      setToast(tr("Project updated", "프로젝트를 수정했습니다"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not update project", "프로젝트를 수정하지 못했습니다"));
    }
  }

  async function toggleProjectArchive(item: Project) {
    const accessToken = requireSession();
    if (!accessToken) return;
    const status = item.status === "Archived" ? "Active" : "Archived";
    const updated = { ...item, status, updated: "Just now" };
    try {
      await syncQuestdeck("update_project", { project: updated }, accessToken);
      setProjects(current => current.map(projectItem => projectItem.id === item.id ? updated : projectItem));
      setToast(`${item.name} ${status === "Archived" ? "archived" : "restored"}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not update project", "프로젝트를 수정하지 못했습니다"));
    }
  }

  async function toggleRolePermission(roleName: RoleName, key: PermissionKey) {
    if (roleName === "Owner") return;
    const accessToken = requireSession();
    if (!accessToken) return;
    const definition = roleDefinitions.find(role => role.name === roleName);
    if (!definition) return;
    const permissions = { ...definition.permissions, [key]: !definition.permissions[key], billing_security: false };
    try {
      await syncQuestdeck("update_role_permissions", { role: roleName, permissions }, accessToken);
      setRoleDefinitions(current => current.map(role => role.name === roleName ? { ...role, permissions } : role));
      setToast(tr(`${roleName} permissions updated`, `${roleName} 권한을 수정했습니다`));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not update permissions", "권한을 수정하지 못했습니다"));
    }
  }

  function addSubTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = String(data.get("subTodo")).trim();
    if (!text) return;
    const items = [...(subTodos[selected.id] ?? []), { id: Date.now(), text, done: false }];
    setSubTodos(current => ({ ...current, [selected.id]: items }));
    void syncQuestdeck("replace_subtasks", { cardId: selected.id, items }, accessToken).catch(() => setToast(tr("Sub-task saved locally; Supabase sync failed", "하위 작업은 로컬에 저장되었지만 Supabase 동기화에 실패했습니다")));
    form.reset();
    setToast(tr("Sub-task added", "하위 작업을 추가했습니다"));
  }

  function toggleSubTodo(cardId: number, todoId: number) {
    const accessToken = requireSession();
    if (!accessToken) return;
    const items = (subTodos[cardId] ?? []).map(todo => todo.id === todoId ? { ...todo, done: !todo.done } : todo);
    setSubTodos(current => ({ ...current, [cardId]: items }));
    void syncQuestdeck("replace_subtasks", { cardId, items }, accessToken).catch(() => setToast(tr("Sub-task saved locally; Supabase sync failed", "하위 작업은 로컬에 저장되었지만 Supabase 동기화에 실패했습니다")));
  }

  function removeSubTodo(cardId: number, todoId: number) {
    const accessToken = requireSession();
    if (!accessToken) return;
    const items = (subTodos[cardId] ?? []).filter(todo => todo.id !== todoId);
    setSubTodos(current => ({ ...current, [cardId]: items }));
    void syncQuestdeck("replace_subtasks", { cardId, items }, accessToken).catch(() => setToast(tr("Sub-task saved locally; Supabase sync failed", "하위 작업은 로컬에 저장되었지만 Supabase 동기화에 실패했습니다")));
  }

  function saveCardEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    const data = new FormData(event.currentTarget);
    const updated: Card = {
      ...selected,
      title: String(data.get("title")),
      description: String(data.get("description")),
      tag: String(data.get("tag")),
      points: Number(data.get("points")),
      project: String(data.get("project")),
      due: String(data.get("due")),
      status: String(data.get("status")) as Status,
    };
    setCards(current => current.map(card => card.id === updated.id ? updated : card));
    setSelected(updated);
    setEditCardOpen(false);
    setToast(tr("Card updated", "카드를 수정했습니다"));
    void syncQuestdeck("update_card", { card: updated }, accessToken).catch(() => setToast(tr("Card saved locally; Supabase sync failed", "카드는 로컬에 저장되었지만 Supabase 동기화에 실패했습니다")));
  }

  const accountEmail = session?.user.email ?? account?.email ?? null;
  const accountName = account?.fullName ?? account?.displayName ?? accountEmail?.split("@")[0] ?? "Guest";
  const accountInitials = accountName.split(/\s+|@/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const activeWorkspace = workspaces.find(workspace => workspace.id === activeWorkspaceId && workspace.status === "Active") ?? workspaces.find(workspace => workspace.status === "Active") ?? initialWorkspaces[0];
  const unreadCount = notifications.filter(notification => !notification.read).length;
  const visibleProjects = projects.filter(item => (projectStatusFilter === "All" || item.status === projectStatusFilter) && `${item.name} ${item.owner}`.toLowerCase().includes(projectSearch.toLowerCase()));
  const visibleMembers = members.filter(member => memberRoleFilter === "All" || member.role === memberRoleFilter);
  const visibleActivity = activityEvents.filter(item => activityFilter === "All activity" || item.type === activityFilter);
  const tr = (english: string, korean: string) => language === "ko" ? korean : english;
  const statusLabel = (status: Status | Project["status"]) => ({ Ready: tr("Ready", "준비"), "In progress": tr("In progress", "진행 중"), Review: tr("Review", "검토"), Done: tr("Done", "완료"), Active: tr("Active", "활성"), "On hold": tr("On hold", "보류"), Archived: tr("Archived", "보관됨") }[status]);
  const selectedTodos = selected ? (subTodos[selected.id] ?? []) : [];
  const completedSubTodos = selectedTodos.filter(todo => todo.done).length;

  return <main className="app-shell">
    <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
      <div className="brand"><span className="brand-mark">Q</span><span>Questdeck</span><button className="sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">×</button></div>
      <div className="workspace-wrap"><button className={`workspace ${workspaceOpen ? "open" : ""}`} onClick={() => setWorkspaceOpen(open => !open)}><span className="workspace-icon">{activeWorkspace.initials}</span><span><small>{tr("WORKSPACE", "워크스페이스")}</small>{activeWorkspace.name}</span><b>⌄</b></button>{workspaceOpen && <div className="workspace-menu"><header><span>{tr("Your workspaces", "내 워크스페이스")}</span><button onClick={() => setWorkspaceOpen(false)}>×</button></header>{workspaces.filter(workspace => workspace.status === "Active").map(workspace => <button className={`workspace-option ${workspace.id === activeWorkspaceId ? "active" : ""}`} key={workspace.id} onClick={() => switchWorkspace(workspace)}><span>{workspace.initials}</span><div><b>{workspace.name}</b><small>{workspace.members} {tr("members", "명")}</small></div>{workspace.id === activeWorkspaceId && <i>✓</i>}</button>)}<footer><button onClick={() => { setCreateWorkspaceOpen(true); setWorkspaceOpen(false); }}>＋ {tr("Create workspace", "워크스페이스 만들기")}</button><button onClick={() => { setView("management"); setWorkspaceOpen(false); }}>⚙ {tr("Manage workspaces", "워크스페이스 관리")}</button></footer></div>}</div>
      <nav>
        <p className="nav-label">{tr("PLAN", "계획")}</p>
        <button className={`nav-item ${view === "overview" ? "active" : ""}`} onClick={() => setView("overview")}><span>⌂</span> {tr("Overview", "개요")}</button>
        <button className={`nav-item ${view === "quests" ? "active" : ""}`} onClick={() => setView("quests")}><span>▤</span> {tr("Production board", "프로덕션 보드")} <i>{cards.filter(c => c.status !== "Done").length}</i></button>
        <button className={`nav-item ${view === "timeline" ? "active" : ""}`} onClick={() => setView("timeline")}><span>↔</span> {tr("Timeline", "타임라인")}</button>
        <button className={`nav-item ${view === "milestones" ? "active" : ""}`} onClick={() => setView("milestones")}><span>◎</span> {tr("Milestones", "마일스톤")}</button>
        <p className="nav-label">{tr("MANAGE", "관리")}</p>
        <button className={`nav-item ${view === "management" ? "active" : ""}`} onClick={() => setView("management")}><span>⚙</span> {tr("Workspace", "워크스페이스")}</button>
        <button className={`nav-item ${view === "projects-management" ? "active" : ""}`} onClick={() => setView("projects-management")}><span>▦</span> {tr("Projects", "프로젝트")}</button>
        <button className={`nav-item ${view === "roles" ? "active" : ""}`} onClick={() => setView("roles")}><span>♙</span> {tr("Roles & access", "역할 및 권한")}</button>
        <button className={`nav-item ${view === "account" ? "active" : ""}`} onClick={() => setView("account")}><span>◉</span> {tr("My account", "내 계정")}</button>
        <p className="nav-label">{tr("PROJECTS", "프로젝트")}</p>
        {projects.filter(item => item.status !== "Archived").map(item => <button className="nav-item" key={item.id} onClick={() => { setProject(item.name); setView("quests"); }}><span className={`dot ${item.color}`} /> {item.name}<i>{item.count}</i></button>)}
      </nav>
      <div className="sidebar-bottom"><button className="nav-item"><span>?</span> {tr("Help & shortcuts", "도움말 및 단축키")}</button><button className="profile profile-button" onClick={() => setView("account")}><span>{accountInitials}</span><div><b>{accountName}</b><small>{tr("Producer · Owner", "프로듀서 · 소유자")}</small></div><i>›</i></button></div>
    </aside>
    {mobileNavOpen && <button className="mobile-sidebar-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}

    <section className="workspace-main">
      <header className="topbar"><div className="topbar-inner">
        <button className="mobile-menu-button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><span /><span /><span /></button>
        <label className="search">⌕ <input value={query} onChange={e => setQuery(e.target.value)} placeholder={tr("Search cards, decks, people…", "카드, 덱, 멤버 검색…")} aria-label={tr("Search cards", "카드 검색")}/><kbd>⌘ K</kbd></label>
        <span className={`data-source ${dataSource}`}><i />{dataSource === "supabase" ? tr("Supabase live", "Supabase 연결됨") : dataSource === "local" ? tr("Local mode", "로컬 모드") : tr("Connecting", "연결 중")}</span>
        <button className={`auth-chip ${session ? "signed-in" : ""}`} onClick={() => session ? setView("account") : setAuthOpen(true)}>{session ? accountEmail : tr("Sign in", "로그인")}</button>
        <select className="language-select" value={language} onChange={event => setLanguage(event.target.value as "en" | "ko")} aria-label={tr("Language", "언어")}><option value="en">EN</option><option value="ko">한국어</option></select>
        <button className={`icon-button ${view === "activity" ? "active" : ""}`} aria-label="Activity" onClick={() => setView("activity")}>◌</button><button className={`icon-button ${notificationOpen ? "active" : ""}`} aria-label={`${unreadCount} unread notifications`} onClick={() => setNotificationOpen(open => !open)}>♧{unreadCount > 0 && <em>{unreadCount}</em>}</button>
        <button className="create-button top-create" onClick={() => openCreateCard()}><span>＋</span><b>{tr("Create card", "카드 만들기")}</b></button>
        <div className="mobile-session-bar">
          <span className={`mobile-data-source ${dataSource}`}><i />{dataSource === "supabase" ? tr("Supabase live", "Supabase 연결됨") : dataSource === "local" ? tr("Local mode", "로컬 모드") : tr("Connecting", "연결 중")}</span>
          <button className={`mobile-auth-chip ${session ? "signed-in" : ""}`} onClick={() => session ? setView("account") : setAuthOpen(true)}>{session ? accountEmail : tr("Sign in", "로그인")}</button>
        </div>
        {notificationOpen && <section className="notification-panel"><header><div><small>{tr("INBOX", "받은 알림")}</small><h3>{tr("Notifications", "알림")}</h3></div><button onClick={() => setNotifications(current => current.map(item => ({...item, read:true})))}>{tr("Mark all read", "모두 읽음")}</button></header><div className="notification-tabs"><button className="active">{tr("All", "전체")}</button><button>{tr("Mentions", "멘션")}</button><button>{tr("Assigned", "담당")}</button></div><div className="notification-list">{notifications.map(item => <button className={`notification-item ${item.read ? "read" : ""}`} key={item.id} onClick={() => openNotification(item)}><span className={`notification-avatar ${item.tone}`}>{item.icon}</span><div><b>{item.title}</b><p>{item.detail}</p><small>{item.time} {tr("ago", "전")}</small></div>{!item.read && <i />}</button>)}</div><footer><button onClick={() => { setNotificationOpen(false); setView("account"); }}>{tr("Notification settings", "알림 설정")} →</button></footer></section>}
      </div></header>

      {view === "overview" && <div className="content">
        <div className="welcome"><div><p>{tr("MONDAY, AUGUST 18", "8월 18일 월요일")}</p><h1>{tr("Good morning, Jamie", "좋은 아침이에요, Jamie")} <span>✦</span></h1><h2>{tr("Here’s what’s moving in your world.", "오늘 스튜디오에서 진행 중인 작업이에요.")}</h2></div><div className="team"><span>MK</span><span>JL</span><span>AS</span><span>+4</span></div></div>
        <div className="stats">
          <article><span className="stat-icon purple-bg">✓</span><div><small>{tr("COMPLETED THIS WEEK", "이번 주 완료")}</small><strong>{cards.filter(c => c.status === "Done").length + 16}</strong><p><b>↑ 24%</b> {tr("from last week", "지난주 대비")}</p></div></article>
          <article><span className="stat-icon coral-bg">◷</span><div><small>{tr("IN PROGRESS", "진행 중")}</small><strong>{cards.filter(c => c.status === "In progress").length + 10}</strong><p>{tr("Across 3 projects", "3개 프로젝트")}</p></div></article>
          <article><span className="stat-icon amber-bg">!</span><div><small>{tr("NEEDS ATTENTION", "확인 필요")}</small><strong>5</strong><p><b className="warn">{tr("2 overdue", "2개 기한 초과")}</b></p></div></article>
        </div>
        <div className="section-heading"><div><h3>{tr("Your hand", "내 카드")}</h3><p>{tr("Cards ready for you to play next.", "다음으로 진행할 준비가 된 카드입니다.")}</p></div><button onClick={() => setView("quests")}>{tr("View all", "전체 보기")} <span>→</span></button></div>
        <div className="card-grid hand-grid">{filtered.filter(card => card.status !== "Done").slice(0, 3).map(card => <QuestCard card={card} onOpen={setSelected} todoSummary={{completed:(subTodos[card.id] ?? []).filter(todo => todo.done).length,total:(subTodos[card.id] ?? []).length}} key={card.id}/>)}</div>
        <div className="overview-bottom">
          <section className="milestone-preview"><div className="mini-title"><div><small>NEXT MILESTONE</small><h3>Festival demo</h3></div><b>12 days</b></div><div className="progress-track"><span style={{width:"68%"}}/></div><p><b>34 of 50 cards</b> completed <span>68%</span></p><div className="milestone-tags"><i>Core loop ✓</i><i>Forest biome</i><i>Demo polish</i></div></section>
          <section className="activity"><div className="mini-title"><div><small>LIVE PULSE</small><h3>Studio activity</h3></div><button onClick={() => setView("activity")} aria-label="View all activity">•••</button></div><ul><li><span className="pulse-avatar lilac">AS</span><p><b>Alex</b> moved <strong>Boss arena concept</strong> to Review<small>18 minutes ago</small></p></li><li><span className="pulse-avatar aqua">JL</span><p><b>Jules</b> completed <strong>Cave reverb zones</strong><small>42 minutes ago</small></p></li><li><span className="pulse-avatar gold">MK</span><p><b>Mina</b> added 2 comments<small>1 hour ago</small></p></li></ul></section>
        </div>
      </div>}

      {view === "activity" && <div className="content activity-content"><div className="page-title"><div><p>{tr("WORKSPACE PULSE", "워크스페이스 소식")}</p><h1>{tr("Activity", "활동")}</h1><h2>{tr("Every meaningful change across your studio, in one timeline.", "스튜디오의 모든 주요 변경 사항을 한 타임라인에서 확인하세요.")}</h2></div><div className="activity-actions"><select value={activityFilter} onChange={event => setActivityFilter(event.target.value)} aria-label={tr("Filter activity", "활동 필터")}><option value="All activity">{tr("All activity", "모든 활동")}</option><option value="Cards">{tr("Cards", "카드")}</option><option value="Comments">{tr("Comments", "댓글")}</option><option value="Milestones">{tr("Milestones", "마일스톤")}</option><option value="Team">{tr("Team", "팀")}</option></select><button className="secondary-button" onClick={() => setToast(tr("Activity marked as reviewed", "모든 활동을 확인했습니다"))}>{tr("Mark all reviewed", "모두 확인")}</button></div></div><div className="activity-layout"><section className="management-card activity-feed"><header><div><small>{tr("RECENT CHANGES", "최근 변경")}</small><h3>{visibleActivity.length} {tr("events", "개 활동")}</h3></div><span className="live-indicator"><i /> {tr("Live", "실시간")}</span></header><div className="activity-day"><span>{tr("TODAY", "오늘")}</span></div>{visibleActivity.slice(0,4).map(item => <article className="activity-event" key={item.id}><span className={`event-avatar ${item.tone}`}>{item.initials}</span><div className="event-copy"><p><b>{item.person}</b> {item.action} <strong>{item.target}</strong></p><blockquote>{item.detail}</blockquote><small>{item.project} · {item.time}</small></div><span className="event-type">{item.type}</span><button aria-label={`More options for ${item.target}`}>•••</button></article>)}{visibleActivity.length > 4 && <><div className="activity-day"><span>{tr("YESTERDAY", "어제")}</span></div>{visibleActivity.slice(4).map(item => <article className="activity-event" key={item.id}><span className={`event-avatar ${item.tone}`}>{item.initials}</span><div className="event-copy"><p><b>{item.person}</b> {item.action} <strong>{item.target}</strong></p><blockquote>{item.detail}</blockquote><small>{item.project} · {item.time}</small></div><span className="event-type">{item.type}</span><button aria-label={`More options for ${item.target}`}>•••</button></article>)}</>}</section><aside className="activity-summary"><section className="management-card"><small>{tr("THIS WEEK", "이번 주")}</small><div className="summary-stat"><strong>42</strong><span>{tr("Cards updated", "카드 업데이트")}</span></div><div className="summary-stat"><strong>18</strong><span>{tr("Completed", "완료")}</span></div><div className="summary-stat"><strong>27</strong><span>{tr("Comments", "댓글")}</span></div></section><section className="management-card contributors"><small>{tr("TOP CONTRIBUTORS", "주요 기여자")}</small>{initialMembers.slice(1,4).map((member,index) => <div key={member.id}><span className="member-avatar">{member.initials}</span><p><b>{member.name}</b><small>{12-index*3} {tr("updates", "개 업데이트")}</small></p><strong>#{index+1}</strong></div>)}</section></aside></div></div>}

      {view === "quests" && <div className="content board-content">
        <div className="page-title"><div><p>{tr("PRODUCTION", "프로덕션")}</p><h1>{tr("Production board", "프로덕션 보드")}</h1><h2>{tr("Move every quest from idea to shipped.", "모든 퀘스트를 아이디어에서 출시까지 진행하세요.")}</h2></div><div className="board-actions"><select value={project} onChange={e => setProject(e.target.value)} aria-label={tr("Filter by project", "프로젝트 필터")}><option value="All projects">{tr("All projects", "모든 프로젝트")}</option>{projects.map(p => <option key={p.name}>{p.name}</option>)}</select><button onClick={() => { setProject("All projects"); setQuery(""); }}>{tr("Clear filters", "필터 초기화")}</button></div></div>
        <div className="board">
          {(["Ready", "In progress", "Review", "Done"] as Status[]).map((status, index) => <section className="board-column" key={status}><header><span className={`status-dot s${index}`}/><h3>{columnNames[status] || statusLabel(status)}</h3><b>{filtered.filter(c => c.status === status).length}</b><div className="column-menu-wrap"><button className={`column-menu-trigger ${activeColumnMenu === status ? "active" : ""}`} onClick={() => setActiveColumnMenu(current => current === status ? null : status)} aria-label={`${columnNames[status] || statusLabel(status)} ${tr("options", "옵션")}`} aria-expanded={activeColumnMenu === status}>•••</button>{activeColumnMenu === status && <div className="column-menu" role="menu"><button role="menuitem" onClick={() => openCreateCard(status)}>＋ <span>{tr("Add card here", "여기에 카드 추가")}</span></button><button role="menuitem" onClick={() => { setEditColumn(status); setActiveColumnMenu(null); }}>✎ <span>{tr("Rename column", "열 이름 변경")}</span></button>{columnNames[status] && <button role="menuitem" onClick={() => resetColumnName(status)}>↺ <span>{tr("Reset name", "기본 이름 복원")}</span></button>}</div>}</div></header><div className="column-cards">{filtered.filter(c => c.status === status).map(card => <QuestCard card={card} onOpen={setSelected} compact todoSummary={{completed:(subTodos[card.id] ?? []).filter(todo => todo.done).length,total:(subTodos[card.id] ?? []).length}} key={card.id}/>)}<button className="add-inline" onClick={() => openCreateCard(status)}>＋ {tr("Add a card", "카드 추가")}</button></div></section>)}
        </div>
      </div>}

      {view === "timeline" && <div className="content schedule-content">
        <div className="page-title timeline-title"><div><p>{tr("PRODUCTION SCHEDULE", "프로덕션 일정")}</p><h1>{tr("Timeline", "타임라인")}</h1><h2>{tr("See every team’s card runs, handoffs, and deadlines in one place.", "모든 팀의 카드 진행, 인계, 마감일을 한곳에서 확인하세요.")}</h2></div><div className="timeline-controls"><button>‹</button><button className="today-button">{tr("Today", "오늘")}</button><button>›</button><select aria-label="Timeline scale"><option>{tr("2 weeks", "2주")}</option><option>{tr("Month", "월")}</option><option>{tr("Quarter", "분기")}</option></select></div></div>
        <section className="schedule-shell">
          <header className="schedule-month"><div className="lane-corner"><span>TEAMS</span><b>August 2026</b></div><div className="month-band"><span>Week 34</span><i>Festival demo · Aug 30</i></div></header>
          <div className="schedule-scroll">
            <div className="date-grid"><div className="date-label-spacer"/>{timelineDays.map((day, index) => { const [weekday, date] = day.split(" "); return <div className={`date-cell ${index === 1 ? "today" : ""} ${index === 5 || index === 6 || index === 12 || index === 13 ? "weekend" : ""}`} key={day}><small>{weekday}</small><b>{date}</b></div>})}</div>
            <div className="schedule-body">
              <div className="today-line" aria-hidden="true"><span>Today</span></div>
              <div className="deadline-marker deadline-one" title="Playtest checkpoint"><span>◆</span><small>Playtest</small></div>
              <div className="deadline-marker deadline-two" title="Content lock"><span>◆</span><small>Content lock</small></div>
              {timelineLanes.map((lane, laneIndex) => <div className="schedule-row" key={lane.team}><div className="lane-label"><span className={`lane-swatch ${lane.tone}`}/><div><b>{lane.team}</b><small>{lane.owner} · {lane.bars.length} runs</small></div></div><div className="lane-track">{lane.bars.map((bar, barIndex) => <button className={`run-bar ${lane.tone}`} style={{gridColumn:`${bar.start + 1} / span ${bar.span}`}} key={bar.title} onClick={() => setSelected(cards[(laneIndex * 2 + barIndex) % cards.length])} aria-label={`Open ${bar.title}`}><span>{bar.title}</span><small>{bar.span}d</small>{bar.progress > 0 && <i style={{width:`${bar.progress}%`}}/>}</button>)}</div></div>)}
            </div>
          </div>
          <footer className="timeline-legend"><span><i className="legend-dot active-dot"/> Active run</span><span><i className="legend-dot planned-dot"/> Planned</span><span><b>◆</b> Milestone</span><p>Drag the schedule horizontally on smaller screens</p></footer>
        </section>
      </div>}

      {view === "milestones" && <div className="content">
        <div className="page-title"><div><p>{tr("ROADMAP", "로드맵")}</p><h1>{tr("Milestones", "마일스톤")}</h1><h2>{tr("Keep scope honest and the whole studio moving together.", "범위를 명확히 하고 스튜디오 전체가 함께 나아가세요.")}</h2></div><button className="secondary-button">＋ {tr("New milestone", "새 마일스톤")}</button></div>
        <div className="timeline">
          {[{date:"AUG 30",title:"Festival demo",progress:68,color:"violet",cards:"34 / 50 cards",note:"Playable demo for the Autumn Game Showcase"},{date:"SEP 27",title:"Content complete",progress:41,color:"mint",cards:"28 / 68 cards",note:"All chapters and production assets locked"},{date:"NOV 14",title:"Gold candidate",progress:18,color:"coral",cards:"12 / 66 cards",note:"Release-ready build for platform certification"}].map((m, i) => <article className="milestone-row" key={m.title}><div className="date-token"><small>2026</small><b>{m.date}</b></div><span className={`timeline-node ${m.color}`}>{i + 1}</span><div className="milestone-card"><div className="milestone-card-head"><div><small>{i === 0 ? "UP NEXT" : i === 1 ? "PRODUCTION" : "RELEASE"}</small><h3>{m.title}</h3><p>{m.note}</p></div><b>{m.progress}%</b></div><div className="progress-track"><span className={m.color} style={{width:`${m.progress}%`}}/></div><footer><span>{m.cards}</span><span>{i === 0 ? "12 days left" : i === 1 ? "40 days left" : "88 days left"}</span></footer></div></article>)}
        </div>
      </div>}

      {view === "management" && <div className="content manage-content">
        <div className="page-title"><div><p>{tr("WORKSPACE ADMIN", "워크스페이스 관리")}</p><h1>{tr("Manage", "관리")} {studioName}</h1><h2>{tr("Control your team, permissions, and workspace defaults.", "팀, 권한, 워크스페이스 기본값을 관리하세요.")}</h2></div><button className="create-button" disabled={Boolean(session) && !currentPermissions?.manage_members} onClick={() => setInviteOpen(true)}>＋ {tr("Add member", "멤버 추가")}</button></div>
        <div className="management-grid">
          <section className="management-card team-management"><header><div><small>TEAM & ACCESS</small><h3>{memberRoleFilter === "All" ? members.length : visibleMembers.length} {memberRoleFilter === "All" ? tr("workspace members", "명의 워크스페이스 멤버") : `${memberRoleFilter} ${tr("members", "멤버")}`}</h3>{memberRoleFilter !== "All" && <button className="role-filter" onClick={() => setMemberRoleFilter("All")}>× {tr("Clear filter", "필터 해제")}</button>}</div><button className="healthy-pill" onClick={() => setView("roles")}>{tr("Manage roles", "역할 관리")} →</button></header>{currentPermissions && !currentPermissions.manage_members ? <div className="access-denied"><b>{tr("Member management is restricted", "멤버 관리는 제한되어 있습니다")}</b><p>{tr("Ask an Owner or Admin to update workspace access.", "소유자 또는 관리자에게 워크스페이스 권한 변경을 요청하세요.")}</p></div> : <div className="member-list">{visibleMembers.map(member => <div className="member-row" key={member.id}><span className="member-avatar">{member.initials}</span><div className="member-identity"><b>{member.name}</b><small>{member.email} · {member.discipline}</small></div><span className={`member-status ${member.status.toLowerCase()}`}>{member.status}</span><span className="member-role">{member.role}</span><button className="row-menu" onClick={() => setEditMember(member)} aria-label={`Edit ${member.name}`}>✎</button></div>)}</div>}</section>
          <aside className="management-side"><section className="management-card"><small>{tr("WORKSPACE PROFILE", "워크스페이스 프로필")}</small><label>{tr("Studio name", "스튜디오 이름")}<input value={studioName} onChange={event => setStudioName(event.target.value)} /></label><label>{tr("Default project", "기본 프로젝트")}<select><option>Project Nightfall</option><option>Marketing</option><option>Studio Ops</option></select></label><label className="toggle-row"><span><b>{tr("Weekly production digest", "주간 프로덕션 요약")}</b><small>{tr("Monday summary for the team", "매주 월요일 팀 요약")}</small></span><input type="checkbox" checked={weeklyDigest} onChange={event => setWeeklyDigest(event.target.checked)} /></label><button className="secondary-button full-button" onClick={saveWorkspaceSettings}>{tr("Save preferences", "설정 저장")}</button><p className="local-note">{tr("These workspace preferences are saved on this device.", "이 워크스페이스 설정은 현재 기기에 저장됩니다.")}</p></section><section className="management-card workspace-directory-card"><header><div><small>{tr("YOUR WORKSPACES", "내 워크스페이스")}</small><h3>{tr("Manage workspaces", "워크스페이스 관리")}</h3></div><button onClick={() => setCreateWorkspaceOpen(true)} disabled={Boolean(session) && !currentPermissions?.workspace_settings}>＋ {tr("New", "추가")}</button></header><div className="workspace-admin-list">{workspaces.map(workspace => <article className={workspace.status === "Archived" ? "archived" : ""} key={workspace.id}><span>{workspace.initials}</span><div><b>{workspace.name}</b><small>{workspace.members} {tr("members", "명")} · {tr(workspace.status, workspace.status === "Active" ? "활성" : "보관됨")}</small></div><div className="workspace-admin-actions"><button disabled={Boolean(session) && !currentPermissions?.workspace_settings} onClick={() => void setWorkspaceStatus(workspace, workspace.status === "Active" ? "Archived" : "Active")}>{workspace.status === "Active" ? tr("Archive", "보관") : tr("Restore", "복원")}</button><button className="delete-workspace-button" disabled={workspaces.length <= 1 || !currentPermissions?.billing_security} onClick={() => void deleteWorkspace(workspace)}>{tr("Delete", "삭제")}</button></div></article>)}</div><p className="workspace-safety-note">{tr("Archived workspaces can be restored. Permanent deletion is limited to workspace owners.", "보관된 워크스페이스는 복원할 수 있습니다. 영구 삭제는 워크스페이스 소유자만 가능합니다.")}</p></section></aside>
        </div>
      </div>}

      {view === "projects-management" && <div className="content projects-admin-content"><div className="page-title"><div><p>{tr("PORTFOLIO", "포트폴리오")}</p><h1>{tr("Manage projects", "프로젝트 관리")}</h1><h2>{tr("Create, organize, and monitor every stream of studio work.", "스튜디오의 모든 작업을 만들고 정리하고 모니터링하세요.")}</h2></div><button className="create-button" disabled={Boolean(session) && !currentPermissions?.workspace_settings} onClick={() => setCreateProjectOpen(true)}>＋ {tr("New project", "새 프로젝트")}</button></div><div className="project-admin-toolbar"><div>{["All","Active","On hold","Archived"].map(status => <button className={projectStatusFilter === status ? "active" : ""} onClick={() => setProjectStatusFilter(status)} key={status}>{status === "All" ? tr("All", "전체") : statusLabel(status as Project["status"])}<span>{status === "All" ? projects.length : projects.filter(item => item.status === status).length}</span></button>)}</div><label>⌕ <input value={projectSearch} onChange={event => setProjectSearch(event.target.value)} placeholder={tr("Search projects…", "프로젝트 검색…")} /></label></div><section className="project-admin-list">{visibleProjects.map(item => <article className="project-admin-card" key={item.id}><span className={`project-color ${item.color}`} /><div className="project-main"><header><div><small>{statusLabel(item.status)}</small><h3>{item.name}</h3></div><button onClick={() => setEditProject(item)} aria-label={`Edit ${item.name}`}>✎</button></header><p><span className="member-avatar">{item.owner.split(/\s+/).map(part => part[0]).join("")}</span> {tr("Led by", "담당")} {item.owner}</p><div className="project-progress"><div><span style={{width:`${item.progress}%`}} /></div><b>{item.progress}%</b></div><footer><span><b>{item.count}</b> {tr("cards", "카드")}</span><span>{tr("Updated", "업데이트")} {item.updated}</span></footer></div><aside><button onClick={() => { setProject(item.name); setView("quests"); }}>{tr("Open board", "보드 열기")} →</button><button onClick={() => setEditProject(item)}>✎ {tr("Edit project", "프로젝트 수정")}</button><button onClick={() => void toggleProjectArchive(item)}>{item.status === "Archived" ? tr("Restore project", "프로젝트 복원") : tr("Archive project", "프로젝트 보관")}</button></aside></article>)}</section>{visibleProjects.length === 0 && <div className="empty-projects"><span>◇</span><h3>{tr("No projects here", "프로젝트가 없습니다")}</h3><p>{tr("Change the filter or create a new project.", "필터를 변경하거나 새 프로젝트를 만드세요.")}</p></div>}</div>}

      {view === "roles" && <div className="content roles-content"><div className="page-title"><div><p>{tr("PERMISSIONS", "권한")}</p><h1>{tr("Roles & access", "역할 및 권한")}</h1><h2>{tr("Choose what each teammate can see, change, and manage.", "각 팀원이 보고 변경하고 관리할 수 있는 항목을 설정하세요.")}</h2></div><button className="secondary-button" disabled={Boolean(session) && !currentPermissions?.manage_members} onClick={() => { setView("management"); setInviteOpen(true); }}>＋ {tr("Assign a role", "역할 지정")}</button></div><div className="role-cards">{roleDefinitions.map(role => { const roleCount = members.filter(member => member.role === role.name).length; return <article className="role-card" key={role.name}><span className={`role-icon ${role.color}`}>{role.name[0]}</span><div><small>{roleCount} {tr(roleCount === 1 ? "PERSON" : "PEOPLE", "명")}</small><h3>{role.name}</h3><p>{role.description}</p></div><button onClick={() => { setMemberRoleFilter(role.name); setView("management"); }}>{tr("View members", "멤버 보기")} →</button></article>; })}</div><section className="management-card permission-matrix"><header><div><small>{tr("ACCESS MATRIX", "권한 매트릭스")}</small><h3>{tr("Role permissions", "역할 권한")}</h3></div><span>{currentPermissions?.billing_security ? tr("Click a permission to change it", "권한을 클릭하여 변경하세요") : `${tr("Changes apply across", "적용 대상")} ${activeWorkspace.name}`}</span></header><div className="matrix-row matrix-head"><b>{tr("Capability", "기능")}</b>{roleDefinitions.map(role => <b key={role.name}>{role.name}</b>)}</div>{permissionRows.map(permission => <div className="matrix-row" key={permission.key}><span>{tr(permission.english,permission.korean)}</span>{roleDefinitions.map(role => <button className={`permission-toggle ${role.permissions[permission.key] ? "allowed" : "denied"}`} disabled={role.name === "Owner" || !currentPermissions?.billing_security} onClick={() => void toggleRolePermission(role.name, permission.key)} aria-label={`${role.name}: ${permission.english}`} key={role.name}>{role.permissions[permission.key] ? "✓" : "—"}</button>)}</div>)}</section></div>}

      {view === "account" && <div className="content account-content">
        <div className="page-title"><div><p>{tr("PERSONAL SETTINGS", "개인 설정")}</p><h1>{tr("My account", "내 계정")}</h1><h2>{tr("Your identity, preferences, and active access.", "계정 정보, 환경설정, 접근 권한을 관리하세요.")}</h2></div><button className="secondary-button signout-link" onClick={() => session ? void supabase.auth.signOut() : setAuthOpen(true)}>{session ? tr("Sign out", "로그아웃") : tr("Sign in", "로그인")}</button></div>
        <div className="account-grid"><section className="management-card account-hero"><div className="account-avatar">{accountInitials}</div><div><small>{session ? tr("SIGNED IN WITH SUPABASE", "SUPABASE로 로그인됨") : tr("SIGN IN TO EDIT", "수정하려면 로그인하세요")}</small><h2>{accountName}</h2><p>{accountEmail ?? tr("Secure workspace account", "안전한 워크스페이스 계정")}</p><span className="verified-badge">{session ? "✓ " + tr("Verified identity", "인증된 계정") : tr("Read-only access", "읽기 전용")}</span></div></section><section className="management-card account-details"><small>{tr("ACCOUNT DETAILS", "계정 정보")}</small><div className="detail-line"><span>{tr("Email", "이메일")}</span><b>{accountEmail ?? tr("Not signed in", "로그인하지 않음")}</b></div><div className="detail-line"><span>{tr("Workspace role", "워크스페이스 역할")}</span><b>Owner</b></div><div className="detail-line"><span>{tr("Primary discipline", "주요 분야")}</span><b>Production</b></div><div className="detail-line"><span>{tr("Access", "접근 권한")}</span><b>{session ? tr("All projects", "모든 프로젝트") : tr("View only", "보기 전용")}</b></div></section><section className="management-card account-preferences"><small>NOTIFICATIONS</small><label className="toggle-row"><span><b>Assigned card updates</b><small>Changes to cards you own</small></span><input type="checkbox" defaultChecked /></label><label className="toggle-row"><span><b>Milestone reminders</b><small>Three days before deadlines</small></span><input type="checkbox" defaultChecked /></label><label className="toggle-row"><span><b>Studio activity</b><small>Daily collaboration summary</small></span><input type="checkbox" /></label></section><section className="management-card sessions-card"><small>SECURITY</small><h3>{session ? tr("Active session", "활성 세션") : tr("No active session", "활성 세션 없음")}</h3><p>{session ? tr("Signed in through Supabase · Current browser", "Supabase로 로그인 · 현재 브라우저") : tr("Sign in to create and edit shared cards.", "공유 카드를 만들고 수정하려면 로그인하세요.")}</p><span className="healthy-pill">{session ? tr("Protected", "보호됨") : tr("Read only", "읽기 전용")}</span></section></div>
      </div>}
    </section>

    {createOpen && <div className="modal-backdrop" onMouseDown={() => setCreateOpen(false)}><section className="modal create-modal" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Create a card"><header><div><small>{tr("NEW QUEST", "새 퀘스트")}</small><h2>{tr("Forge a card", "카드 만들기")}</h2></div><button onClick={() => setCreateOpen(false)} aria-label="Close">×</button></header><form onSubmit={createCard}><label>{tr("Card title", "카드 제목")}<input name="title" required autoFocus placeholder={tr("What needs to happen?", "어떤 작업이 필요한가요?")}/></label><label>{tr("Description", "설명")}<textarea name="description" placeholder={tr("Add context, goals, or acceptance notes…", "배경, 목표 또는 완료 조건을 입력하세요…")}/></label><div className="form-row"><label>{tr("Discipline", "분야")}<select name="tag"><option>GAMEPLAY</option><option>ART</option><option>AUDIO</option><option>ENGINEERING</option><option>NARRATIVE</option><option>MARKETING</option></select></label><label>{tr("Effort", "작업량")}<select name="points"><option value="1">1 point</option><option value="2">2 points</option><option value="3">3 points</option><option value="5">5 points</option><option value="8">8 points</option></select></label></div><div className="form-row"><label>{tr("Project", "프로젝트")}<select name="project">{projects.map(p => <option key={p.name}>{p.name}</option>)}</select></label><label>{tr("Column", "열")}<select value={createStatus} onChange={event => setCreateStatus(event.target.value as Status)}>{productionStages.map(status => <option value={status} key={status}>{columnNames[status] || statusLabel(status)}</option>)}</select></label></div><footer><button type="button" onClick={() => setCreateOpen(false)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Create card", "카드 만들기")}</button></footer></form></section></div>}

    {editColumn && <div className="modal-backdrop" onMouseDown={() => setEditColumn(null)}><section className="modal create-modal column-edit-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Rename column", "열 이름 변경")}><header><div><small>{tr("BOARD SETTINGS", "보드 설정")}</small><h2>{tr("Rename column", "열 이름 변경")}</h2></div><button onClick={() => setEditColumn(null)} aria-label="Close">×</button></header><form onSubmit={renameColumn}><label>{tr("Column name", "열 이름")}<input name="name" required autoFocus defaultValue={columnNames[editColumn] || statusLabel(editColumn)} maxLength={30} /></label><p className="form-help">{tr("This changes the label on this device; cards still keep their workflow stage.", "이 기기에서 표시되는 이름만 변경되며 카드의 작업 단계는 유지됩니다.")}</p><footer><button type="button" onClick={() => setEditColumn(null)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Save name", "이름 저장")}</button></footer></form></section></div>}

    {inviteOpen && <div className="modal-backdrop" onMouseDown={() => setInviteOpen(false)}><section className="modal create-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add a workspace member"><header><div><small>{tr("TEAM ACCESS", "팀 권한")}</small><h2>{tr("Add a member", "멤버 추가")}</h2></div><button onClick={() => setInviteOpen(false)} aria-label="Close">×</button></header><form onSubmit={inviteMember}><label>{tr("Name", "이름")}<input name="name" placeholder={tr("Teammate name", "팀원 이름")} /></label><label>{tr("Email", "이메일")}<input name="email" type="email" required autoFocus placeholder="name@studio.com" /></label><label>{tr("Discipline", "분야")}<input name="discipline" placeholder={tr("Art, Audio, Production…", "아트, 오디오, 프로덕션…")} /></label><label>{tr("Workspace role", "워크스페이스 역할")}<select name="role"><option>Member</option><option>Admin</option><option>Guest</option></select></label><div className="invite-note"><b>{tr("Access preview", "권한 미리보기")}</b><p>{tr("This email is added to workspace access. When that person signs in with the same email, their assigned role becomes active.", "이 이메일을 워크스페이스 권한에 추가합니다. 해당 사용자가 같은 이메일로 로그인하면 지정된 역할이 활성화됩니다.")}</p></div><footer><button type="button" onClick={() => setInviteOpen(false)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Add member", "멤버 추가")}</button></footer></form></section></div>}

    {createWorkspaceOpen && <div className="modal-backdrop" onMouseDown={() => setCreateWorkspaceOpen(false)}><section className="modal create-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Create workspace"><header><div><small>{tr("NEW SPACE", "새 공간")}</small><h2>{tr("Create a workspace", "워크스페이스 만들기")}</h2></div><button onClick={() => setCreateWorkspaceOpen(false)} aria-label="Close">×</button></header><form onSubmit={createWorkspace}><label>{tr("Workspace name", "워크스페이스 이름")}<input name="name" required autoFocus placeholder={tr("Your studio or team", "스튜디오 또는 팀 이름")} /></label><div className="invite-note"><b>{tr("A fresh deck", "새로운 덱")}</b><p>{tr("Your new workspace starts with its own members, projects, and production settings.", "새 워크스페이스는 독립적인 멤버, 프로젝트, 프로덕션 설정으로 시작합니다.")}</p></div><footer><button type="button" onClick={() => setCreateWorkspaceOpen(false)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Create workspace", "워크스페이스 만들기")}</button></footer></form></section></div>}

    {createProjectOpen && <div className="modal-backdrop" onMouseDown={() => setCreateProjectOpen(false)}><section className="modal create-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Create project"><header><div><small>{tr("NEW PROJECT", "새 프로젝트")}</small><h2>{tr("Start a project", "프로젝트 시작")}</h2></div><button onClick={() => setCreateProjectOpen(false)} aria-label="Close">×</button></header><form onSubmit={createProject}><label>{tr("Project name", "프로젝트 이름")}<input name="name" required autoFocus placeholder={tr("Project name", "프로젝트 이름")} /></label><label>{tr("Project lead", "프로젝트 리드")}<select name="owner">{members.filter(member => member.status === "Active").map(member => <option key={member.id}>{member.name}</option>)}</select></label><label>{tr("Starting template", "시작 템플릿")}<select><option>{tr("Game production", "게임 프로덕션")}</option><option>{tr("Marketing campaign", "마케팅 캠페인")}</option><option>{tr("Studio operations", "스튜디오 운영")}</option><option>{tr("Blank project", "빈 프로젝트")}</option></select></label><footer><button type="button" onClick={() => setCreateProjectOpen(false)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Create project", "프로젝트 만들기")}</button></footer></form></section></div>}

    {editProject && <div className="modal-backdrop" onMouseDown={() => setEditProject(null)}><section className="modal create-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Edit project", "프로젝트 수정")}><header><div><small>{tr("PROJECT SETTINGS", "프로젝트 설정")}</small><h2>{tr("Edit project", "프로젝트 수정")}</h2></div><button onClick={() => setEditProject(null)} aria-label="Close">×</button></header><form onSubmit={saveProjectEdits}><label>{tr("Project name", "프로젝트 이름")}<input name="name" required autoFocus defaultValue={editProject.name} /></label><div className="form-row"><label>{tr("Project lead", "프로젝트 리드")}<select name="owner" defaultValue={editProject.owner}>{members.filter(member => member.status === "Active").map(member => <option key={member.id}>{member.name}</option>)}</select></label><label>{tr("Status", "상태")}<select name="status" defaultValue={editProject.status}><option>Active</option><option>On hold</option><option>Archived</option></select></label></div><div className="form-row"><label>{tr("Progress", "진행률")}<input name="progress" type="number" min="0" max="100" defaultValue={editProject.progress} /></label><label>{tr("Color", "색상")}<select name="color" defaultValue={editProject.color}><option value="purple">Purple</option><option value="yellow">Yellow</option><option value="blue">Blue</option></select></label></div><footer><button type="button" onClick={() => setEditProject(null)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Save project", "프로젝트 저장")}</button></footer></form></section></div>}

    {editMember && <div className="modal-backdrop" onMouseDown={() => setEditMember(null)}><section className="modal create-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Edit member", "멤버 수정")}><header><div><small>{tr("MEMBER ACCESS", "멤버 권한")}</small><h2>{tr("Edit member", "멤버 수정")}</h2></div><button onClick={() => setEditMember(null)} aria-label="Close">×</button></header><form onSubmit={saveMemberEdits}><label>{tr("Name", "이름")}<input name="name" required autoFocus defaultValue={editMember.name} /></label><label>{tr("Email", "이메일")}<input name="email" type="email" required defaultValue={editMember.email} /></label><div className="form-row"><label>{tr("Discipline", "분야")}<input name="discipline" required defaultValue={editMember.discipline} /></label><label>{tr("Status", "상태")}<select name="status" defaultValue={editMember.status}><option>Active</option><option>Invited</option></select></label></div><label>{tr("Workspace role", "워크스페이스 역할")}<select name="role" defaultValue={editMember.role} disabled={editMember.role === "Owner"}><option>Owner</option><option>Admin</option><option>Member</option><option>Guest</option></select>{editMember.role === "Owner" && <input type="hidden" name="role" value="Owner" />}</label><footer className="member-edit-footer">{editMember.role !== "Owner" ? <button className="danger-button" type="button" onClick={() => void removeMember(editMember)}>{tr("Remove member", "멤버 삭제")}</button> : <span />}<div><button type="button" onClick={() => setEditMember(null)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Save member", "멤버 저장")}</button></div></footer></form></section></div>}

    {selected && !editCardOpen && <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><section className="modal detail-modal" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={selected.title}><div className={`detail-banner ${selected.color}`}><span>{selected.tag}</span><b>{selected.points}</b></div><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button><div className="detail-content"><div className="detail-title-row"><div><small>{selected.project.toUpperCase()}</small><h2>{selected.title}</h2></div><button className="edit-card-button" onClick={() => setEditCardOpen(true)}>✎ {tr("Edit card", "카드 수정")}</button></div><p>{selected.description}</p><div className="detail-grid"><div><small>{tr("OWNER", "담당자")}</small><b><span className="avatar">{selected.owner}</span> Jamie Kim</b></div><div><small>{tr("DUE", "마감")}</small><b>◷ {selected.due}</b></div></div><label>{tr("Status", "상태")}<select value={selected.status} onChange={e => updateStatus(selected, e.target.value as Status)}>{productionStages.map(s => <option value={s} key={s}>{statusLabel(s)}</option>)}</select></label><div className="subtodo-section"><header><div><small>{tr("SUB-TASKS", "하위 작업")}</small><b>{completedSubTodos}/{selectedTodos.length}</b></div>{selectedTodos.length > 0 && <div className="subtodo-progress"><span style={{width:`${Math.round((completedSubTodos / selectedTodos.length) * 100)}%`}} /></div>}</header><div className="subtodo-list">{selectedTodos.map(todo => <div className={`subtodo-row ${todo.done ? "done" : ""}`} key={todo.id}><button className="subtodo-check" onClick={() => toggleSubTodo(selected.id, todo.id)} aria-label={todo.done ? tr("Mark incomplete", "미완료로 표시") : tr("Mark complete", "완료로 표시")}>{todo.done ? "✓" : ""}</button><span>{todo.text}</span><button className="subtodo-remove" onClick={() => removeSubTodo(selected.id, todo.id)} aria-label={tr("Remove sub-task", "하위 작업 삭제")}>×</button></div>)}{selectedTodos.length === 0 && <p className="subtodo-empty">{tr("No sub-tasks yet. Break this card into smaller steps.", "아직 하위 작업이 없습니다. 카드를 더 작은 단계로 나눠보세요.")}</p>}</div><form className="subtodo-form" onSubmit={addSubTodo}><input name="subTodo" placeholder={tr("Add a sub-task…", "하위 작업 추가…")} aria-label={tr("New sub-task", "새 하위 작업")} /><button type="submit">＋ {tr("Add", "추가")}</button></form></div></div></section></div>}

    {selected && editCardOpen && <div className="modal-backdrop" onMouseDown={() => setEditCardOpen(false)}><section className="modal create-modal edit-card-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Edit card", "카드 수정")}><header><div><small>{tr("CARD DETAILS", "카드 정보")}</small><h2>{tr("Edit card", "카드 수정")}</h2></div><button onClick={() => setEditCardOpen(false)} aria-label="Close">×</button></header><form onSubmit={saveCardEdits}><label>{tr("Card title", "카드 제목")}<input name="title" required autoFocus defaultValue={selected.title} /></label><label>{tr("Description", "설명")}<textarea name="description" defaultValue={selected.description} /></label><div className="form-row"><label>{tr("Discipline", "분야")}<select name="tag" defaultValue={selected.tag}><option>GAMEPLAY</option><option>ART</option><option>AUDIO</option><option>ENGINEERING</option><option>NARRATIVE</option><option>MARKETING</option><option>RELEASE</option><option>STUDIO</option></select></label><label>{tr("Effort", "작업량")}<select name="points" defaultValue={selected.points}><option value="1">1 point</option><option value="2">2 points</option><option value="3">3 points</option><option value="5">5 points</option><option value="8">8 points</option></select></label></div><div className="form-row"><label>{tr("Project", "프로젝트")}<select name="project" defaultValue={selected.project}>{projects.map(projectItem => <option key={projectItem.id}>{projectItem.name}</option>)}</select></label><label>{tr("Status", "상태")}<select name="status" defaultValue={selected.status}>{productionStages.map(status => <option value={status} key={status}>{statusLabel(status)}</option>)}</select></label></div><label>{tr("Due date", "마감일")}<input name="due" defaultValue={selected.due} placeholder={tr("Today, Aug 24, or No date", "오늘, 8월 24일 또는 날짜 없음")} /></label><footer><button type="button" onClick={() => setEditCardOpen(false)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Save changes", "변경 사항 저장")}</button></footer></form></section></div>}
    {authOpen && <div className="modal-backdrop" onMouseDown={() => setAuthOpen(false)}><section className="modal create-modal auth-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Questdeck account", "Questdeck 계정")}><header><div><small>QUESTDECK ACCOUNT</small><h2>{authMode === "signin" ? tr("Welcome back", "다시 오신 것을 환영합니다") : tr("Create your account", "계정 만들기")}</h2></div><button onClick={() => setAuthOpen(false)} aria-label="Close">×</button></header><button className="github-auth-button" type="button" onClick={() => void handleGitHubSignIn()} disabled={authBusy}><span aria-hidden="true">GH</span>{tr("Continue with GitHub", "GitHub로 계속하기")}</button><div className="auth-divider"><span>{tr("or use email", "또는 이메일 사용")}</span></div><form onSubmit={handleAuth}><label>{tr("Email", "이메일")}<input name="email" type="email" required autoFocus autoComplete="email" placeholder="you@example.com" /></label><label>{tr("Password", "비밀번호")}<input name="password" type="password" minLength={8} required autoComplete={authMode === "signin" ? "current-password" : "new-password"} placeholder={tr("At least 8 characters", "8자 이상")} /></label>{authMessage && <p className="auth-message">{authMessage}</p>}<footer className="auth-footer"><button type="button" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthMessage(""); }}>{authMode === "signin" ? tr("Create account", "계정 만들기") : tr("I already have an account", "이미 계정이 있어요")}</button><button className="create-button" type="submit" disabled={authBusy}>{authBusy ? tr("Please wait…", "잠시만 기다려주세요…") : authMode === "signin" ? tr("Sign in", "로그인") : tr("Sign up", "가입하기")}</button></footer></form></section></div>}
    {toast && <div className="toast">✓ {toast}</div>}
  </main>;
}
