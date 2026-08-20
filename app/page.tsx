"use client";

import { ChangeEvent, DragEvent, FormEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import FlowchartStudio, { flowchartImagePaths, isFlowchartDocument } from "./flowchart-studio";
import SpreadsheetStudio, { isSpreadsheetDocument } from "./spreadsheet-studio";
import PlatformAdmin from "./platform-admin";
import { OwnerWaitingList, WaitingRoom } from "./waiting-room";
import "./workspace-access.css";
import "./spreadsheet-studio.css";

type Status = "Ready" | "In progress" | "Review" | "Done";
type View = "overview" | "quests" | "timeline" | "mindmap" | "flowchart" | "spreadsheet" | "documents" | "milestones" | "activity" | "management" | "projects-management" | "roles" | "account" | "platform-admin" | "waiting-list";
type Card = { id: number; title: string; description: string; tag: string; owner: string; collaborators?: string[]; points: number; priority: number; color: string; status: Status; project: string; due: string; dueDate: string | null; startDate?: string | null; archived?: boolean };
type Account = { displayName: string; email: string; fullName: string | null };
type RoleName = "Owner" | "Admin" | "Team Leader" | "Member" | "Guest";
type PermissionKey = "view_projects" | "edit_cards" | "manage_members" | "workspace_settings" | "billing_security";
type RolePermissions = Record<PermissionKey, boolean>;
type RoleDefinition = { name: RoleName; description: string; color: string; permissions: RolePermissions };
type Member = { id: number; name: string; email: string; initials: string; role: RoleName; discipline: string; status: "Active" | "Invited"; workspaceIds: string[] };
type Workspace = { id: string; name: string; initials: string; members: number; status: "Active" | "Archived" };
type Notification = { id: number; title: string; detail: string; time: string; icon: string; tone: string; read: boolean; destination: View; createdAt?: string };
type ActivityEvent = { id: number; person: string; initials: string; action: string; target: string; detail: string; project: string; type: string; time: string; tone: string; destination: View; createdAt: string };
type Project = { id: string; name: string; count: number; color: string; owner: string; status: "Active" | "On hold" | "Archived"; progress: number; updated: string };
type SubTodo = { id: number; text: string; done: boolean };
type JourneyTemplate = { id: string; name: string; nameKo: string; steps: string[]; stepsKo: string[] };
type ProductionDiscipline = { id: number; name: string; color: string };
type WorkspaceDocument = { id: number; title: string; content: string; createdByEmail: string; ownerName: string; isPublished: boolean; shareSlug: string; createdAt: string; updatedAt: string };
type DocumentComment = { id: number; documentId: number; userId: string; authorEmail: string; authorName: string; body: string; createdAt: string };
type Milestone = { id: number; title: string; milestoneDate: string; progress: number; completedCards: number; totalCards: number; note: string; color: "violet" | "mint" | "coral" | "blue" | "amber" | "rose"; stage: string };
type BoardSort = "Default" | "Priority" | "Priority low" | "Due date" | "Due date latest" | "Effort" | "Effort low" | "Title" | "Newest";
type BoardBackup = { version: 1; product: "Questdeck"; createdAt: string; cards: Card[]; subTodos: Record<number, SubTodo[]>; columnNames: Partial<Record<Status, string>> };
type WorkspaceBackupAttachment = { path: string; mimeType: string; dataUrl: string };
type WorkspaceBackup = { version: 2; product: "Questdeck"; kind: "full-workspace"; createdAt: string; workspace: { cards: Card[]; subTodos: Record<number, SubTodo[]>; projects: Project[]; milestones: Milestone[]; productionDisciplines: ProductionDiscipline[]; members: Member[]; roleDefinitions: RoleDefinition[]; workspaces: Workspace[]; activeWorkspaceId: string; settings: { studioName: string; weeklyDigest: boolean; defaultProjectId: string; language: "en" | "ko" }; documents: WorkspaceDocument[]; documentComments: DocumentComment[]; notifications: Notification[]; activityEvents: ActivityEvent[]; columnNames: Partial<Record<Status, string>> }; attachments: WorkspaceBackupAttachment[] };
type CardHoverPreview = { card: Card; left: number; top: number; completed: number; total: number };
type TimelineGesture = { cardId: number; mode: "move" | "start" | "end"; pointerId: number; startClientX: number; dayWidth: number; originStart: Date; originEnd: Date; currentStart: Date; currentEnd: Date };
type TimelinePan = { pointerId: number; lastClientX: number; dayWidth: number };
type MindmapNode = { id: string; title: string; note: string; x: number; y: number; color: "violet" | "mint" | "coral" | "blue" | "amber"; imagePath?: string };
type MindmapEdge = { id: string; from: string; to: string };
type MindmapData = { version: 1; nodes: MindmapNode[]; edges: MindmapEdge[] };
type MindmapViewport = { x: number; y: number; zoom: number };
type MindmapGesture = { mode: "pan" | "node"; pointerId: number; startX: number; startY: number; originX: number; originY: number; nodeId?: string };

const SUPABASE_URL = "https://duddukvihvuoqawsoqus.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_TcigjkGnxplktO6uSngk8w_UETJmWR6";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

type SupabaseCard = {
  id: number;
  title: string;
  description: string;
  tag: string;
  owner_initials: string;
  collaborator_initials: string[] | null;
  points: number;
  color: string;
  status: Status;
  due_label: string;
  due_date: string | null;
  start_date: string | null;
  priority: number;
  archived: boolean;
  questdeck_projects: { name: string };
};

type SupabaseSubTodo = { id: number; card_id: number; text: string; done: boolean; sort_order: number };
type SupabaseMilestone = { id: number; title: string; milestone_date: string; progress: number; completed_cards: number; total_cards: number; note: string; color: Milestone["color"]; stage: string };

async function syncQuestdeck<T = { ok: boolean }>(action: string, payload: Record<string, unknown>, accessToken: string): Promise<T> {
  let workspaceId = "";
  try { workspaceId = JSON.parse(window.localStorage.getItem("questdeck-workspaces") || "{}").activeWorkspaceId || ""; } catch {}
  const response = await fetch("/api/questdeck-sync", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action, workspaceId, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Supabase sync failed");
  const card = payload.card as Card | undefined;
  if ((action === "create_card" || action === "update_card") && card && Number.isSafeInteger(card.id)) {
    const collaboratorResponse = await fetch(`${SUPABASE_URL}/rest/v1/questdeck_cards?id=eq.${card.id}${workspaceId ? `&workspace_id=eq.${encodeURIComponent(workspaceId)}` : ""}`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${accessToken}`, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ collaborator_initials: Array.from(new Set((card.collaborators ?? []).filter(initials => initials && initials !== card.owner))).slice(0, 20) }),
    });
    if (!collaboratorResponse.ok) throw new Error("Co-worker assignment could not sync");
  }
  return data as T;
}

const DOCUMENT_IMAGE_BUCKET = "questdeck-document-images";
const DOCUMENT_IMAGE_PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${DOCUMENT_IMAGE_BUCKET}/`;
const documentImagePathPattern = /^(?:[a-zA-Z0-9_-]+\/)?[0-9a-f-]{36}\/\d+\/[a-zA-Z0-9._-]+$/i;
const documentImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const HERO_MARKER = "__questdeck_hero__";
const HERO_CHILD_PREFIX = "__questdeck_hero_child__:";
const MINDMAP_DOCUMENT_PREFIX = "__questdeck_mindmap_v1__:";
const initialMindmapNodes: MindmapNode[] = [
  { id: "vision", title: "Game vision", note: "The experience we want players to remember", x: 0, y: 0, color: "violet" },
  { id: "player", title: "Player experience", note: "Core emotions, choices, and feedback", x: -310, y: 190, color: "mint" },
  { id: "world", title: "World & story", note: "Setting, characters, and narrative hooks", x: 310, y: 190, color: "coral" },
];
const initialMindmapEdges: MindmapEdge[] = [
  { id: "vision-player", from: "vision", to: "player" },
  { id: "vision-world", from: "vision", to: "world" },
];
const journeyTemplates: JourneyTemplate[] = [
  { id: "feature", name: "Feature journey", nameKo: "기능 제작 여정", steps: ["Define the experience", "Build the first pass", "Playtest and review", "Polish and ship"], stepsKo: ["경험 정의", "첫 버전 제작", "플레이테스트 및 검토", "다듬기 및 출시"] },
  { id: "asset", name: "Asset journey", nameKo: "에셋 제작 여정", steps: ["Create the brief", "Produce the asset", "Review in context", "Final polish"], stepsKo: ["브리프 작성", "에셋 제작", "게임 내 검토", "최종 다듬기"] },
  { id: "release", name: "Release journey", nameKo: "출시 여정", steps: ["Plan the release", "Prepare the build", "Quality check", "Publish and monitor"], stepsKo: ["출시 계획", "빌드 준비", "품질 확인", "게시 및 모니터링"] },
];

function visibleSubTodos(items: SubTodo[]) { return items.filter(item => item.text !== HERO_MARKER && !item.text.startsWith(HERO_CHILD_PREFIX)); }
function heroChildIds(items: SubTodo[]) { return items.filter(item => item.text.startsWith(HERO_CHILD_PREFIX)).map(item => Number(item.text.slice(HERO_CHILD_PREFIX.length))).filter(Number.isFinite); }
function hasHeroMarker(items: SubTodo[]) { return items.some(item => item.text === HERO_MARKER); }
const richTextTags = new Set(["p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "a", "table", "thead", "tbody", "tr", "th", "td", "hr", "figure", "figcaption", "img"]);
function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;"); }
function sanitizeRichText(value: string) {
  if (!/<[a-z][\s\S]*>/i.test(value)) return `<p>${escapeHtml(value).replace(/\n/g, "<br>")}</p>`;
  return value.replace(/<!--[\s\S]*?-->/g, "").replace(/<\s*(\/?)\s*([a-z0-9]+)([^>]*)>/gi, (_match, closing: string, rawTag: string, attributes: string) => {
    const tag = rawTag.toLowerCase();
    if (!richTextTags.has(tag)) return "";
    if (closing) return tag === "br" || tag === "hr" ? "" : `</${tag}>`;
    if (tag === "a") {
      const href = attributes.match(/href\s*=\s*[\"']([^\"']+)[\"']/i)?.[1] ?? "";
      const safeHref = /^(https?:|mailto:)/i.test(href) ? escapeHtml(href) : "";
      return safeHref ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">` : "<a>";
    }
    if (tag === "img") {
      const src = attributes.match(/src\s*=\s*[\"']([^\"']+)[\"']/i)?.[1] ?? "";
      const alt = attributes.match(/alt\s*=\s*[\"']([^\"']*)[\"']/i)?.[1] ?? "";
      const storedPath = attributes.match(/data-storage-path\s*=\s*[\"']([^\"']+)[\"']/i)?.[1] ?? "";
      const legacyPath = src.startsWith(DOCUMENT_IMAGE_PUBLIC_PREFIX) ? decodeURIComponent(src.slice(DOCUMENT_IMAGE_PUBLIC_PREFIX.length)) : "";
      const path = storedPath || legacyPath;
      return documentImagePathPattern.test(path) ? `<img data-storage-path="${escapeHtml(path)}" alt="${escapeHtml(alt)}">` : "";
    }
    return tag === "br" || tag === "hr" ? `<${tag}>` : `<${tag}>`;
  });
}
function richTextExcerpt(value: string) { return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }

async function hydrateDocumentImages(value: string) {
  const sanitized = sanitizeRichText(value);
  if (typeof DOMParser === "undefined") return sanitized;
  const parsed = new DOMParser().parseFromString(sanitized, "text/html");
  const images = Array.from(parsed.querySelectorAll<HTMLImageElement>("img[data-storage-path]"));
  const paths = Array.from(new Set(images.map(image => image.dataset.storagePath ?? "").filter(path => documentImagePathPattern.test(path))));
  if (!paths.length) return parsed.body.innerHTML;
  const { data, error } = await supabase.storage.from(DOCUMENT_IMAGE_BUCKET).createSignedUrls(paths, 3600);
  if (error) return parsed.body.innerHTML;
  const signedByPath = new Map((data ?? []).filter(item => item.signedUrl).map(item => [item.path, item.signedUrl]));
  images.forEach(image => {
    const signedUrl = signedByPath.get(image.dataset.storagePath ?? "");
    if (signedUrl) image.src = signedUrl;
  });
  return parsed.body.innerHTML;
}

const initialCards: Card[] = [];
const initialProjects: Project[] = [];
const initialMilestones: Milestone[] = [];

const productionStages: Status[] = ["Ready", "In progress", "Review", "Done"];
const initialDisciplines = ["Production", "Game Design", "Engineering", "Art", "Audio", "Narrative", "Marketing", "QA", "General"];
const initialProductionDisciplines: ProductionDiscipline[] = [
  { id: 1, name: "Gameplay", color: "violet" }, { id: 2, name: "Art", color: "coral" },
  { id: 3, name: "Audio", color: "mint" }, { id: 4, name: "Engineering", color: "blue-card" },
  { id: 5, name: "Narrative", color: "rose-card" }, { id: 6, name: "Marketing", color: "amber-card" },
  { id: 7, name: "Release", color: "violet" }, { id: 8, name: "Studio", color: "mint" },
  { id: 9, name: "General", color: "blue-card" },
];

const initialMembers: Member[] = [];

const initialWorkspaces: Workspace[] = [
  { id: "workspace", name: "Workspace", initials: "W", members: 0, status: "Active" },
];

const initialNotifications: Notification[] = [];

const initialRoleDefinitions: RoleDefinition[] = [
  { name: "Owner", description: "Full workspace control, billing, and security.", color: "violet", permissions: { view_projects: true, edit_cards: true, manage_members: true, workspace_settings: true, billing_security: true } },
  { name: "Admin", description: "Manage projects and production settings in assigned workspaces.", color: "coral", permissions: { view_projects: true, edit_cards: true, manage_members: false, workspace_settings: true, billing_security: false } },
  { name: "Team Leader", description: "Lead production work in assigned workspaces without changing access.", color: "amber-card", permissions: { view_projects: true, edit_cards: true, manage_members: false, workspace_settings: true, billing_security: false } },
  { name: "Member", description: "Create and update cards across assigned projects.", color: "mint", permissions: { view_projects: true, edit_cards: true, manage_members: false, workspace_settings: false, billing_security: false } },
  { name: "Guest", description: "Review and comment on specifically shared work.", color: "blue-card", permissions: { view_projects: true, edit_cards: false, manage_members: false, workspace_settings: false, billing_security: false } },
];

const permissionRows: { key: PermissionKey; english: string; korean: string }[] = [
  { key: "view_projects", english: "View projects", korean: "프로젝트 보기" },
  { key: "edit_cards", english: "Create & edit cards", korean: "카드 만들기 및 편집" },
  { key: "manage_members", english: "Manage members", korean: "멤버 관리" },
  { key: "workspace_settings", english: "Manage projects & production", korean: "프로젝트 및 프로덕션 관리" },
  { key: "billing_security", english: "Billing & security", korean: "결제 및 보안" },
];

const initialActivityEvents: ActivityEvent[] = [];

function isView(value: string): value is View {
  return ["overview", "quests", "timeline", "mindmap", "flowchart", "spreadsheet", "documents", "milestones", "activity", "management", "projects-management", "roles", "account", "platform-admin", "waiting-list"].includes(value);
}

function isMindmapDocument(document: WorkspaceDocument) { return document.content.startsWith(MINDMAP_DOCUMENT_PREFIX); }
function serializeMindmap(nodes: MindmapNode[], edges: MindmapEdge[]) { return `${MINDMAP_DOCUMENT_PREFIX}${JSON.stringify({ version: 1, nodes, edges } satisfies MindmapData)}`; }
function parseMindmap(content: string): MindmapData | null {
  if (!content.startsWith(MINDMAP_DOCUMENT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(content.slice(MINDMAP_DOCUMENT_PREFIX.length)) as Partial<MindmapData>;
    if (parsed.version !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return { version: 1, nodes: parsed.nodes as MindmapNode[], edges: parsed.edges as MindmapEdge[] };
  } catch { return null; }
}

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  const days = Math.floor(elapsed / 86_400_000);
  return days === 1 ? "Yesterday" : `${days}d`;
}

const initialSubTodos: Record<number, SubTodo[]> = {};

const dayMs = 86_400_000;

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const timelineReferenceDate = startOfDay(new Date());

function cardDueDate(label: string) {
  if (label === "Today") return timelineReferenceDate;
  if (label === "Tomorrow") return addDays(timelineReferenceDate, 1);
  const match = label.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
  if (!match) return null;
  const parsed = new Date(`${match[1]} ${match[2]}, 2026`);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function timelineDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dueLabelFromInput(value: string) {
  if (!value) return "No date";
  return timelineDateLabel(new Date(`${value}T12:00:00`));
}

function cardDueTone(card: Card) {
  if (!card.dueDate) return "due-none";
  if (card.status === "Done") return "due-complete";
  const due = startOfDay(new Date(`${card.dueDate}T12:00:00`));
  const days = Math.round((due.getTime() - startOfDay(new Date()).getTime()) / dayMs);
  if (days < 0) return "due-overdue";
  if (days === 0) return "due-today";
  if (days <= 7) return "due-upcoming";
  return "due-later";
}

function priorityTone(priority: number) {
  if (priority >= 8) return "critical";
  if (priority >= 5) return "high";
  return "normal";
}

function QuestCard({ card, onOpen, compact = false, todoSummary, heroExpanded = true, heroTreeLabel, onToggleHero, draggable = false, dragging = false, onDragStart, onDragEnd, onPreviewStart, onPreviewEnd }: { card: Card; onOpen: (card: Card) => void; compact?: boolean; todoSummary?: { completed: number; total: number; isHero?: boolean; heroChildren?: number; heroCompleted?: number; parentHero?: boolean; parentHeroTitle?: string }; heroExpanded?: boolean; heroTreeLabel?: string; onToggleHero?: () => void; draggable?: boolean; dragging?: boolean; onDragStart?: (event: DragEvent<HTMLButtonElement>) => void; onDragEnd?: () => void; onPreviewStart?: (card: Card, element: HTMLButtonElement, todoSummary?: { completed: number; total: number }) => void; onPreviewEnd?: () => void }) {
  return <button className={`quest-card priority-${priorityTone(card.priority)} ${compact ? "compact" : ""} ${todoSummary?.isHero ? "hero-parent-card" : ""} ${todoSummary?.parentHero ? "hero-sub-card" : ""} ${dragging ? "board-card-dragging" : ""}`} onClick={() => { onPreviewEnd?.(); onOpen(card); }} aria-label={`Open ${card.title}`} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} onMouseEnter={event => onPreviewStart?.(card, event.currentTarget, todoSummary)} onMouseLeave={onPreviewEnd} onFocus={event => onPreviewStart?.(card, event.currentTarget, todoSummary)} onBlur={onPreviewEnd}>
    <div className={`card-accent ${card.color}`}><span>{card.tag}</span><b className={`priority-badge ${priorityTone(card.priority)}`}>P{card.priority}</b><b>{card.points}</b></div>
    <div className="card-body"><div className="card-meta-row"><small>{card.project.toUpperCase()}</small><span className="card-assignee-stack" aria-label={`Owner ${card.owner}${card.collaborators?.length ? `, co-workers ${card.collaborators.join(", ")}` : ""}`}><i className="primary-assignee" title={`Owner · ${card.owner}`}>{card.owner}</i>{(card.collaborators ?? []).slice(0, 3).map(initials => <i title={`Co-worker · ${initials}`} key={initials}>{initials}</i>)}{(card.collaborators?.length ?? 0) > 3 && <b>+{(card.collaborators?.length ?? 0) - 3}</b>}</span></div><div className="card-title-row"><h4>{card.title}</h4><time className={cardDueTone(card)} dateTime={card.dueDate ?? undefined}>◷ {card.due}</time></div>{!compact && <p>{card.description}</p>}{todoSummary?.isHero && <><div className="hero-card-chip"><b>★ HERO</b><span>{todoSummary.heroCompleted}/{todoSummary.heroChildren} cards</span></div>{onToggleHero && <span className="hero-tree-toggle" role="button" aria-expanded={heroExpanded} onClick={event => { event.preventDefault(); event.stopPropagation(); onToggleHero(); }} title={heroTreeLabel}><span>{heroTreeLabel}</span><b>{todoSummary.heroChildren}</b><i className={heroExpanded ? "expanded" : ""}>⌄</i></span>}</>}{todoSummary?.parentHero && <div className="hero-child-chip"><b>↳ SUB-CARD</b>{todoSummary.parentHeroTitle && <span>{todoSummary.parentHeroTitle}</span>}</div>}{todoSummary && todoSummary.total > 0 && <div className="card-subtask-progress" aria-label={`${todoSummary.completed} of ${todoSummary.total} sub-tasks complete`}><span><i style={{width:`${(todoSummary.completed / todoSummary.total) * 100}%`}} /></span><b>☑ {todoSummary.completed}/{todoSummary.total}</b></div>}</div>
  </button>;
}

function CoworkerPicker({ members, owner, selected, label, hint, onChange }: { members: Member[]; owner: string; selected: string[]; label: string; hint: string; onChange: (next: string[]) => void }) {
  const available = members.filter(member => member.status === "Active" && member.initials !== owner);
  return <fieldset className="coworker-picker"><legend>{label}</legend><small>{hint}</small><div>{available.map(member => { const active = selected.includes(member.initials); return <button type="button" className={active ? "active" : ""} aria-pressed={active} onClick={() => onChange(active ? selected.filter(initials => initials !== member.initials) : [...selected, member.initials])} key={member.id}><span>{member.initials}</span><b>{member.name}</b><i>{active ? "✓" : "+"}</i></button>; })}{available.length === 0 && <p>—</p>}</div></fieldset>;
}

export default function Home() {
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [dataSource, setDataSource] = useState<"connecting" | "supabase" | "local">("connecting");
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("All projects");
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraftTitle, setCreateDraftTitle] = useState("");
  const [createDraftDescription, setCreateDraftDescription] = useState("");
  const [createStatus, setCreateStatus] = useState<Status>("Ready");
  const [createEffort, setCreateEffort] = useState(3);
  const [createPriority, setCreatePriority] = useState(5);
  const [createOwner, setCreateOwner] = useState("JK");
  const [createCollaborators, setCreateCollaborators] = useState<string[]>([]);
  const [createStartDate, setCreateStartDate] = useState("");
  const [createDueDate, setCreateDueDate] = useState("");
  const [editEffort, setEditEffort] = useState(3);
  const [editPriority, setEditPriority] = useState(5);
  const [editOwner, setEditOwner] = useState("JK");
  const [editCollaborators, setEditCollaborators] = useState<string[]>([]);
  const [editStartDate, setEditStartDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [mindmapNodes, setMindmapNodes] = useState<MindmapNode[]>(initialMindmapNodes);
  const [mindmapEdges, setMindmapEdges] = useState<MindmapEdge[]>(initialMindmapEdges);
  const [activeMindmapDocumentId, setActiveMindmapDocumentId] = useState<number | null>(null);
  const [mindmapTitle, setMindmapTitle] = useState("Game vision");
  const [mindmapViewport, setMindmapViewport] = useState<MindmapViewport>({ x: 430, y: 145, zoom: 1 });
  const [selectedMindmapNodeId, setSelectedMindmapNodeId] = useState<string | null>("vision");
  const [linkingMindmapNodeId, setLinkingMindmapNodeId] = useState<string | null>(null);
  const [mindmapDirty, setMindmapDirty] = useState(false);
  const [mindmapSaveState, setMindmapSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [mindmapImageUploading, setMindmapImageUploading] = useState(false);
  const [mindmapImageUrls, setMindmapImageUrls] = useState<Record<string, string>>({});
  const mindmapImageInputRef = useRef<HTMLInputElement | null>(null);
  const mindmapCanvasRef = useRef<HTMLDivElement | null>(null);
  const mindmapGestureRef = useRef<MindmapGesture | null>(null);
  const mindmapDidMoveRef = useRef(false);
  const mindmapRevisionRef = useRef(0);
  const mindmapSaveRequestRef = useRef(0);
  const [documentEditorOpen, setDocumentEditorOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<WorkspaceDocument | null>(null);
  const [documentDraftTitle, setDocumentDraftTitle] = useState("");
  const [documentDraftContent, setDocumentDraftContent] = useState("");
  const [documentChangeVersion, setDocumentChangeVersion] = useState(0);
  const [documentDirty, setDocumentDirty] = useState(false);
  const [documentSaveState, setDocumentSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [documentComments, setDocumentComments] = useState<DocumentComment[]>([]);
  const [documentCommentsOpen, setDocumentCommentsOpen] = useState(true);
  const documentEditorRef = useRef<HTMLDivElement | null>(null);
  const documentEditorHtmlRef = useRef({ __html: "" });
  const documentEditingIdRef = useRef<number | null>(null);
  const documentDirtyRef = useRef(false);
  const documentSelectionRef = useRef<Range | null>(null);
  const documentTableCellRef = useRef<HTMLTableCellElement | null>(null);
  const documentImageInputRef = useRef<HTMLInputElement | null>(null);
  const documentSaveRequest = useRef(0);
  const [documentImageUploading, setDocumentImageUploading] = useState(false);
  const [documentExportOpen, setDocumentExportOpen] = useState(false);
  const [documentExportBusy, setDocumentExportBusy] = useState(false);
  const [documentTableMenuOpen, setDocumentTableMenuOpen] = useState(false);
  const [documentTableSize, setDocumentTableSize] = useState({ rows: 2, columns: 2 });
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
  const [milestoneEditorOpen, setMilestoneEditorOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [milestoneDraftDate, setMilestoneDraftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [milestoneSyncState, setMilestoneSyncState] = useState<"synced" | "syncing" | "error">("synced");
  const milestoneSyncRequest = useRef(0);
  const [publicDocument, setPublicDocument] = useState<WorkspaceDocument | null>(null);
  const [publicDocumentLoading, setPublicDocumentLoading] = useState(false);
  const [productionDisciplines, setProductionDisciplines] = useState(initialProductionDisciplines);
  const [disciplineManagerOpen, setDisciplineManagerOpen] = useState(false);
  const [newProductionDiscipline, setNewProductionDiscipline] = useState("");
  const [editingProductionDiscipline, setEditingProductionDiscipline] = useState<ProductionDiscipline | null>(null);
  const [boardSort, setBoardSort] = useState<BoardSort>("Default");
  const [priorityFilter, setPriorityFilter] = useState<"All" | "Critical" | "High" | "Normal">("All");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [disciplineFilter, setDisciplineFilter] = useState("All");
  const [dueFilter, setDueFilter] = useState<"All" | "Overdue" | "Today" | "This week" | "No date">("All");
  const [boardDensity, setBoardDensity] = useState<"comfortable" | "compact">("compact");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [quickCardTitles, setQuickCardTitles] = useState<Partial<Record<Status, string>>>({});
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [activeColumnMenu, setActiveColumnMenu] = useState<Status | null>(null);
  const [editColumn, setEditColumn] = useState<Status | null>(null);
  const [columnNames, setColumnNames] = useState<Partial<Record<Status, string>>>({});
  const [selected, setSelected] = useState<Card | null>(null);
  const [heroPanelOpen, setHeroPanelOpen] = useState(false);
  const [heroChildTitle, setHeroChildTitle] = useState("");
  const [toast, setToast] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [studioName, setStudioName] = useState("Starfall Studio");
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [defaultProjectId, setDefaultProjectId] = useState("nightfall");
  const [disciplines, setDisciplines] = useState(initialDisciplines);
  const [newDiscipline, setNewDiscipline] = useState("");
  const [editingDiscipline, setEditingDiscipline] = useState<string | null>(null);
  const [editedDiscipline, setEditedDiscipline] = useState("");
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>(initialActivityEvents);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<"All" | "Unread">("All");
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
  const [currentRole, setCurrentRole] = useState<RoleName | null>(null);
  const [isWorkspaceOwner, setIsWorkspaceOwner] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [memberRoleFilter, setMemberRoleFilter] = useState<RoleName | "All">("All");
  const [projectStatusFilter, setProjectStatusFilter] = useState("All");
  const [projectSearch, setProjectSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState("All activity");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [language, setLanguage] = useState<"en" | "ko">("en");
  const [subTodos, setSubTodos] = useState<Record<number, SubTodo[]>>(initialSubTodos);
  const [editCardOpen, setEditCardOpen] = useState(false);
  const [timelineStart, setTimelineStart] = useState(() => addDays(timelineReferenceDate, -7));
  const [timelineScale, setTimelineScale] = useState<"2 weeks" | "Month" | "Quarter">("2 weeks");
  const [timelineSort, setTimelineSort] = useState<"Due date" | "Status" | "Owner" | "Name">("Due date");
  const [timelineRowHeight, setTimelineRowHeight] = useState(132);
  const [timelineHover, setTimelineHover] = useState<{cardId: number; left: number; top: number} | null>(null);
  const [draggedTimelineCard, setDraggedTimelineCard] = useState<number | null>(null);
  const [timelineGesture, setTimelineGesture] = useState<TimelineGesture | null>(null);
  const timelineGestureRef = useRef<TimelineGesture | null>(null);
  const timelineDidDrag = useRef(false);
  const timelinePanRef = useRef<TimelinePan | null>(null);
  const [timelinePanning, setTimelinePanning] = useState(false);
  const [draggedBoardCard, setDraggedBoardCard] = useState<number | null>(null);
  const [boardDropStatus, setBoardDropStatus] = useState<Status | null>(null);
  const [boardDropAction, setBoardDropAction] = useState<"archive" | "delete" | null>(null);
  const [cardHoverPreview, setCardHoverPreview] = useState<CardHoverPreview | null>(null);
  const cardHoverTimer = useRef<number | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [collapsedHeroIds, setCollapsedHeroIds] = useState<Set<number>>(() => new Set());
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [workspaceAccess, setWorkspaceAccess] = useState<"checking" | "allowed" | "admin" | "waiting" | "denied">("checking");
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  async function loadWorkspaceFeed(accessToken = session?.access_token) {
    if (!accessToken) return;
    const data = await syncQuestdeck<{
      activity: Array<{ id: number; actor_name: string; actor_email: string; actor_initials: string; action: string; target: string; detail: string; project: string; event_type: string; tone: string; destination: string; created_at: string }>;
      notifications: Array<{ id: number; title: string; detail: string; icon: string; tone: string; destination: string; is_read: boolean; created_at: string }>;
    }>("load_feed", { workspaceId: activeWorkspaceId }, accessToken);
    setActivityEvents(data.activity.map(item => ({
      id: item.id,
      person: item.actor_name,
      initials: item.actor_initials || "Q",
      action: item.action,
      target: item.target,
      detail: item.detail,
      project: item.project,
      type: item.event_type,
      time: relativeTime(item.created_at),
      tone: item.tone,
      destination: isView(item.destination) ? item.destination : "overview",
      createdAt: item.created_at,
    })));
    setNotifications(data.notifications.map(item => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      time: relativeTime(item.created_at),
      icon: item.icon || "Q",
      tone: item.tone,
      read: item.is_read,
      destination: isView(item.destination) ? item.destination : "overview",
      createdAt: item.created_at,
    })));
  }

  useEffect(() => {
    if (!session?.access_token || workspaceAccess !== "allowed") return;
    const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${session.access_token}` };
    Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/questdeck_cards?select=id,title,description,tag,owner_initials,collaborator_initials,points,priority,color,status,due_label,due_date,start_date,archived,questdeck_projects(name)&workspace_id=eq.${encodeURIComponent(activeWorkspaceId)}&order=id.asc`, { headers }).then(response => {
        if (!response.ok) throw new Error("Supabase card request failed");
        return response.json() as Promise<SupabaseCard[]>;
      }),
      fetch(`${SUPABASE_URL}/rest/v1/questdeck_subtasks?select=id,card_id,text,done,sort_order&workspace_id=eq.${encodeURIComponent(activeWorkspaceId)}&order=card_id.asc,sort_order.asc`, { headers }).then(response => {
        if (!response.ok) throw new Error("Supabase sub-task request failed");
        return response.json() as Promise<SupabaseSubTodo[]>;
      }),
      fetch(`${SUPABASE_URL}/rest/v1/questdeck_milestones?select=id,title,milestone_date,progress,completed_cards,total_cards,note,color,stage&workspace_id=eq.${encodeURIComponent(activeWorkspaceId)}&order=milestone_date.asc`, { headers }).then(response => {
        if (!response.ok) throw new Error("Supabase milestone request failed");
        return response.json() as Promise<SupabaseMilestone[]>;
      }),
    ])
      .then(([remoteCards, remoteSubTodos, remoteMilestones]) => {
        const mapped = remoteCards.map(card => ({
          id: card.id, title: card.title, description: card.description, tag: card.tag, owner: card.owner_initials, collaborators: card.collaborator_initials ?? [],
          points: card.points, priority: card.priority ?? 5, color: card.color, status: card.status, project: card.questdeck_projects.name, due: card.due_label || "No date", dueDate: card.due_date, startDate: card.start_date, archived: card.archived,
        } satisfies Card));
        setCards(mapped);

        const remoteTodos = remoteSubTodos.reduce<Record<number, SubTodo[]>>((all, todo) => {
          (all[todo.card_id] ??= []).push({ id: todo.id, text: todo.text, done: todo.done });
          return all;
        }, {});
        setSubTodos(remoteTodos);
        setMilestones(remoteMilestones.map(item => ({ id: item.id, title: item.title, milestoneDate: item.milestone_date, progress: item.progress, completedCards: item.completed_cards, totalCards: item.total_cards, note: item.note, color: item.color, stage: item.stage })));
        setDataSource("supabase");
      })
      .catch(() => setDataSource("local"));
  }, [session?.access_token, workspaceAccess, activeWorkspaceId]);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setAuthReady(true); });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session?.access_token || workspaceAccess !== "allowed") return;
    void fetch(`${SUPABASE_URL}/rest/v1/questdeck_disciplines?select=id,name,color&workspace_id=eq.${encodeURIComponent(activeWorkspaceId)}&order=created_at.asc`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${session.access_token}` } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Discipline request failed")))
      .then((items: ProductionDiscipline[]) => { if (items.length) setProductionDisciplines(items); })
      .catch(() => undefined);
  }, [session?.access_token, workspaceAccess, activeWorkspaceId]);
  useEffect(() => {
    if (!session?.access_token || !session.user.email) {
      setWorkspaceAccess("checking");
      setIsPlatformAdmin(false);
      return;
    }
    setWorkspaceAccess("checking");
    void syncQuestdeck<{ hasWorkspaceAccess: boolean; isPlatformAdmin: boolean; isWaiting: boolean; pendingRequestCount: number; activeWorkspaceId: string | null }>("load_access", {}, session.access_token)
      .then(data => {
        setIsPlatformAdmin(data.isPlatformAdmin);
        setPendingRequestCount(data.pendingRequestCount || 0);
        if (data.activeWorkspaceId) setActiveWorkspaceId(data.activeWorkspaceId);
        setWorkspaceAccess(data.hasWorkspaceAccess ? "allowed" : data.isPlatformAdmin ? "admin" : data.isWaiting ? "waiting" : "denied");
      })
      .catch(() => { setIsPlatformAdmin(false); setWorkspaceAccess("denied"); });
  }, [session?.access_token, session?.user.email]);
  useEffect(() => {
    if (!session?.access_token || workspaceAccess !== "allowed") {
      setCurrentPermissions(null);
      setDocuments([]);
      setActivityEvents([]);
      setNotifications([]);
      return;
    }
    void syncQuestdeck<{
      projects: Array<{ id: string; name: string; card_count: number; color: string; owner: string; status: Project["status"]; progress: number; updated_label: string }>;
      workspaces: Array<{ id: string; name: string; initials: string; member_count: number; status: Workspace["status"] }>;
      members: Member[];
      roles: Array<{ role: RoleName } & RolePermissions>;
      permissions: RolePermissions;
      activeWorkspaceId: string;
      currentRole: RoleName;
      isOwner: boolean;
      isPlatformAdmin: boolean;
    }>("load_admin", { workspaceId: activeWorkspaceId }, session.access_token).then(data => {
      if (data.activeWorkspaceId !== activeWorkspaceId) setActiveWorkspaceId(data.activeWorkspaceId);
      setProjects(data.projects.map(item => ({ id: item.id, name: item.name, count: item.card_count, color: item.color, owner: item.owner, status: item.status, progress: item.progress, updated: item.updated_label })));
      setWorkspaces(data.workspaces.map(item => ({ id: item.id, name: item.name, initials: item.initials, members: item.member_count, status: item.status })));
      setMembers(data.members);
      setDisciplines(current => Array.from(new Set([...current, ...data.members.map(member => member.discipline).filter(Boolean)])));
      setRoleDefinitions(initialRoleDefinitions.map(definition => {
        const saved = data.roles.find(role => role.role === definition.name);
        return saved ? { ...definition, permissions: { view_projects: saved.view_projects, edit_cards: saved.edit_cards, manage_members: saved.manage_members, workspace_settings: saved.workspace_settings, billing_security: saved.billing_security } } : definition;
      }));
      setCurrentPermissions(data.permissions);
      setCurrentRole(data.currentRole);
      setIsWorkspaceOwner(data.isOwner);
      setIsPlatformAdmin(data.isPlatformAdmin);
    }).catch(error => {
      setCurrentPermissions(null);
      setCurrentRole(null);
      setIsWorkspaceOwner(false);
      setToast(error instanceof Error ? error.message : tr("Could not load workspace access", "워크스페이스 권한을 불러오지 못했습니다"));
    });
  }, [session?.access_token, workspaceAccess, activeWorkspaceId]);
  useEffect(() => {
    if (!session?.access_token || workspaceAccess !== "allowed") return;
    void loadWorkspaceFeed(session.access_token).catch(() => undefined);
    const timer = window.setInterval(() => void loadWorkspaceFeed(session.access_token).catch(() => undefined), 20_000);
    return () => window.clearInterval(timer);
  }, [session?.access_token, workspaceAccess, activeWorkspaceId]);
  useEffect(() => {
    if (!session?.access_token || workspaceAccess !== "allowed") return;
    void syncQuestdeck<{ documents: Array<{ id: number; title: string; content: string; created_by_email: string; owner_name: string; is_published: boolean; share_slug: string; created_at: string; updated_at: string }> }>("load_documents", { workspaceId: activeWorkspaceId }, session.access_token)
      .then(data => setDocuments(data.documents.map(item => ({ id: item.id, title: item.title, content: item.content, createdByEmail: item.created_by_email, ownerName: item.owner_name, isPublished: item.is_published, shareSlug: item.share_slug, createdAt: item.created_at, updatedAt: item.updated_at }))))
      .catch(error => setToast(error instanceof Error ? error.message : tr("Could not load documents", "문서를 불러오지 못했습니다")));
  }, [session?.access_token, workspaceAccess, activeWorkspaceId]);
  useEffect(() => {
    if (mindmapDirty) return;
    const maps = documents.filter(isMindmapDocument);
    if (activeMindmapDocumentId === null && maps.length > 0) { setActiveMindmapDocumentId(maps[0].id); return; }
    const stored = maps.find(document => document.id === activeMindmapDocumentId);
    if (!stored && maps.length > 0) { setActiveMindmapDocumentId(maps[0].id); return; }
    const parsed = stored ? parseMindmap(stored.content) : null;
    if (!parsed) return;
    setMindmapTitle(stored?.title || tr("Untitled mindmap", "제목 없는 마인드맵"));
    setMindmapNodes(parsed.nodes);
    setMindmapEdges(parsed.edges);
    setSelectedMindmapNodeId(parsed.nodes[0]?.id ?? null);
    setLinkingMindmapNodeId(null);
    setMindmapSaveState("saved");
  }, [documents, mindmapDirty, activeMindmapDocumentId]);
  useEffect(() => {
    const paths = Array.from(new Set(mindmapNodes.map(node => node.imagePath).filter((path): path is string => Boolean(path) && documentImagePathPattern.test(path!))));
    if (!session?.access_token || paths.length === 0) { setMindmapImageUrls({}); return; }
    let active = true;
    void supabase.storage.from(DOCUMENT_IMAGE_BUCKET).createSignedUrls(paths, 3600).then(({ data, error }) => {
      if (!active || error) return;
      setMindmapImageUrls(Object.fromEntries((data ?? []).filter(item => item.signedUrl).map(item => [item.path, item.signedUrl])));
    });
    return () => { active = false; };
  }, [activeMindmapDocumentId, mindmapNodes.map(node => node.imagePath ?? "").join("|"), session?.access_token]);
  useEffect(() => {
    if (!mindmapDirty || !session?.access_token || workspaceAccess !== "allowed") return;
    const timer = window.setTimeout(() => void saveMindmap(), 850);
    return () => window.clearTimeout(timer);
  }, [mindmapNodes, mindmapEdges, mindmapTitle, activeMindmapDocumentId, mindmapDirty, session?.access_token, workspaceAccess]);
  useEffect(() => {
    if (view !== "mindmap") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable=true]")) return;
      if ((event.key === "Delete" || event.key === "Backspace") && selectedMindmapNodeId) { event.preventDefault(); deleteMindmapNode(selectedMindmapNodeId); }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); addMindmapNode(); }
      if ((event.ctrlKey || event.metaKey) && event.key === "0") { event.preventDefault(); fitMindmap(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view, selectedMindmapNodeId, mindmapNodes]);
  useEffect(() => {
    if (!documentEditorOpen || !editingDocument || !documentDirty) return;
    const timer = window.setTimeout(() => void saveDocumentDraft(false), 1100);
    return () => window.clearTimeout(timer);
  }, [documentEditorOpen, editingDocument?.id, documentDraftTitle, documentChangeVersion, documentDirty]);
  useEffect(() => {
    const editor = documentEditorRef.current;
    if (!documentEditorOpen || !editor) return;
    const remember = () => rememberDocumentSelection();
    editor.addEventListener("keydown", handleDocumentKeyDown);
    editor.addEventListener("keyup", remember);
    editor.addEventListener("mouseup", remember);
    document.addEventListener("selectionchange", remember);
    return () => {
      editor.removeEventListener("keydown", handleDocumentKeyDown);
      editor.removeEventListener("keyup", remember);
      editor.removeEventListener("mouseup", remember);
      document.removeEventListener("selectionchange", remember);
    };
  }, [documentEditorOpen, editingDocument?.id, documentDraftTitle]);
  useEffect(() => {
    const shareSlug = new URLSearchParams(window.location.search).get("document");
    if (!shareSlug || !/^[0-9a-f-]{36}$/i.test(shareSlug) || !session?.access_token || workspaceAccess !== "allowed") return;
    setPublicDocumentLoading(true);
    void fetch(`${SUPABASE_URL}/rest/v1/questdeck_documents?select=id,title,content,created_by_email,owner_name,is_published,share_slug,created_at,updated_at&share_slug=eq.${shareSlug}&is_published=eq.true&limit=1`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${session.access_token}` } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Document request failed")))
      .then(async (items: Array<{ id: number; title: string; content: string; created_by_email: string; owner_name: string; is_published: boolean; share_slug: string; created_at: string; updated_at: string }>) => {
        const item = items[0];
        if (item) setPublicDocument({ id: item.id, title: item.title, content: await hydrateDocumentImages(item.content), createdByEmail: item.created_by_email, ownerName: item.owner_name, isPublished: item.is_published, shareSlug: item.share_slug, createdAt: item.created_at, updatedAt: item.updated_at });
      })
      .finally(() => setPublicDocumentLoading(false));
  }, [session?.access_token, workspaceAccess]);
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
    const savedProjects = window.localStorage.getItem("questdeck-projects");
    const savedDisciplines = window.localStorage.getItem("questdeck-disciplines");
    const savedLanguage = window.localStorage.getItem("questdeck-language");
    const savedCards = window.localStorage.getItem("questdeck-cards");
    const savedSubTodos = window.localStorage.getItem("questdeck-sub-todos");
    if (savedCards) { try { const parsed = JSON.parse(savedCards); if (Array.isArray(parsed)) setCards(parsed); } catch {} }
    if (savedSubTodos) { try { setSubTodos(JSON.parse(savedSubTodos)); } catch {} }
    if (savedMembers) { try { setMembers(JSON.parse(savedMembers).map((member: Member) => ({ ...member, workspaceIds: Array.isArray(member.workspaceIds) ? member.workspaceIds : [] }))); } catch {} }
    if (savedSettings) { try { const parsed = JSON.parse(savedSettings); setStudioName(parsed.studioName ?? "Starfall Studio"); setWeeklyDigest(parsed.weeklyDigest ?? true); setDefaultProjectId(parsed.defaultProjectId ?? "nightfall"); } catch {} }
    if (savedWorkspaces) { try { const parsed = JSON.parse(savedWorkspaces); setWorkspaces((parsed.workspaces ?? initialWorkspaces).map((workspace: Workspace) => ({ ...workspace, status: workspace.status ?? "Active" }))); setActiveWorkspaceId(parsed.activeWorkspaceId ?? "starfall"); } catch {} }
    if (savedProjects) { try { setProjects(JSON.parse(savedProjects)); } catch {} }
    if (savedDisciplines) { try { const parsed = JSON.parse(savedDisciplines); if (Array.isArray(parsed) && parsed.length) setDisciplines(parsed); } catch {} }
    if (savedLanguage === "ko" || savedLanguage === "en") setLanguage(savedLanguage);
  }, []);
  useEffect(() => { window.localStorage.setItem("questdeck-members", JSON.stringify(members)); }, [members]);
  useEffect(() => { window.localStorage.setItem("questdeck-workspaces", JSON.stringify({ workspaces, activeWorkspaceId })); }, [workspaces, activeWorkspaceId]);
  useEffect(() => { window.localStorage.setItem("questdeck-notifications", JSON.stringify(notifications)); }, [notifications]);
  useEffect(() => { window.localStorage.setItem("questdeck-projects", JSON.stringify(projects)); }, [projects]);
  useEffect(() => { window.localStorage.setItem("questdeck-disciplines", JSON.stringify(disciplines)); }, [disciplines]);
  useEffect(() => {
    const available = projects.filter(item => item.status !== "Archived");
    if (!available.some(item => item.id === defaultProjectId)) setDefaultProjectId(available[0]?.id ?? "");
  }, [projects, defaultProjectId]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2600); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { setMobileNavOpen(false); }, [view]);
  useEffect(() => { window.localStorage.setItem("questdeck-language", language); document.documentElement.lang = language; }, [language]);
  useEffect(() => { window.localStorage.setItem("questdeck-sub-todos", JSON.stringify(subTodos)); }, [subTodos]);

  const filtered = useMemo(() => {
    const archivedProjectNames = new Set(projects.filter(item => item.status === "Archived").map(item => item.name));
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    const weekEndKey = weekEnd.toISOString().slice(0, 10);
    const visible = cards.filter(card => {
      const matchesQuery = `${card.title} ${card.description} ${card.tag} ${card.project}`.toLowerCase().includes(query.toLowerCase());
      const tone = priorityTone(card.priority);
      const matchesPriority = priorityFilter === "All" || (priorityFilter === "Critical" && tone === "critical") || (priorityFilter === "High" && tone === "high") || (priorityFilter === "Normal" && tone === "normal");
      const matchesOwner = ownerFilter === "All" || card.owner === ownerFilter || (card.collaborators ?? []).includes(ownerFilter);
      const matchesDiscipline = disciplineFilter === "All" || card.tag === disciplineFilter;
      const matchesDue = dueFilter === "All" || (dueFilter === "No date" && !card.dueDate) || (dueFilter === "Overdue" && Boolean(card.dueDate && card.dueDate < todayKey && card.status !== "Done")) || (dueFilter === "Today" && card.dueDate === todayKey) || (dueFilter === "This week" && Boolean(card.dueDate && card.dueDate >= todayKey && card.dueDate <= weekEndKey));
      return !card.archived && !archivedProjectNames.has(card.project) && matchesQuery && matchesPriority && matchesOwner && matchesDiscipline && matchesDue && (project === "All projects" || card.project === project);
    });
    return [...visible].sort((a, b) => {
      if (boardSort === "Priority") return b.priority - a.priority;
      if (boardSort === "Priority low") return a.priority - b.priority;
      if (boardSort === "Effort") return b.points - a.points;
      if (boardSort === "Effort low") return a.points - b.points;
      if (boardSort === "Due date") return (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31");
      if (boardSort === "Due date latest") return (b.dueDate ?? "0000-00-00").localeCompare(a.dueDate ?? "0000-00-00");
      if (boardSort === "Title") return a.title.localeCompare(b.title);
      if (boardSort === "Newest") return b.id - a.id;
      return a.id - b.id;
    });
  }, [boardSort, cards, disciplineFilter, dueFilter, ownerFilter, priorityFilter, projects, query, project]);

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
    const tag = String(data.get("tag"));
    const discipline = productionDisciplines.find(item => item.name === tag);
    if (createStartDate && createDueDate && createStartDate > createDueDate) { setToast(tr("Start date must be before the due date", "시작일은 마감일보다 빨라야 합니다")); return; }
    const newCard: Card = {
      id: Date.now(), title: String(data.get("title")), description: String(data.get("description") || "A newly forged quest, ready for the team."),
      tag, owner: createOwner, collaborators: createCollaborators.filter(initials => initials !== createOwner), points: createEffort, priority: createPriority, color: discipline?.color ?? "violet", status: createStatus, project: String(data.get("project")), due: dueLabelFromInput(createDueDate), dueDate: createDueDate || null, startDate: createStartDate || null, archived: false,
    };
    setCards(prev => [newCard, ...prev]); setCreateOpen(false); setToast("Card added to your deck"); setView("quests");
    void syncQuestdeck("create_card", { card: newCard }, accessToken).catch(() => setToast(tr("Card saved locally; Supabase sync failed", "카드는 로컬에 저장되었지만 Supabase 동기화에 실패했습니다")));
  }

  function quickAddCard(event: FormEvent<HTMLFormElement>, status: Status) {
    event.preventDefault();
    const title = (quickCardTitles[status] ?? "").trim();
    if (!title) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    const targetProject = project === "All projects" ? defaultProjectName : project;
    if (!targetProject) { setToast(tr("Create an active project first", "먼저 활성 프로젝트를 만들어 주세요")); return; }
    const discipline = productionDisciplines.find(item => item.name === "General") ?? productionDisciplines[0];
    const newCard: Card = {
      id: Date.now(), title, description: "", tag: discipline?.name ?? "General", owner: currentMember?.initials ?? activeCardOwners[0]?.initials ?? "JK", collaborators: [],
      points: 3, priority: 5, color: discipline?.color ?? "blue-card", status, project: targetProject, due: "No date", dueDate: null, startDate: null, archived: false,
    };
    setCards(current => [newCard, ...current]);
    setQuickCardTitles(current => ({ ...current, [status]: "" }));
    setToast(tr(`Added “${title}” to ${statusLabel(status)}`, `“${title}” 카드를 ${statusLabel(status)}에 추가했습니다`));
    void syncQuestdeck("create_card", { card: newCard }, accessToken).catch(() => setToast(tr("Card saved locally; Supabase sync failed", "카드는 로컬에 저장되었지만 Supabase 동기화에 실패했습니다")));
  }

  async function downloadWorkspaceBackup() {
    const accessToken = requireSession();
    if (!accessToken) return;
    setBackupBusy(true);
    try {
      const { data: commentRows, error: commentError } = await supabase.from("questdeck_document_comments").select("id,document_id,user_id,author_email,author_name,body,created_at").eq("workspace_id", activeWorkspaceId).order("created_at", { ascending: true });
      if (commentError) throw commentError;
      const allDocumentComments: DocumentComment[] = (commentRows ?? []).map(row => ({ id: row.id, documentId: row.document_id, userId: row.user_id, authorEmail: row.author_email, authorName: row.author_name, body: row.body, createdAt: row.created_at }));
      const imagePaths = Array.from(new Set(documents.flatMap(document => {
        const documentPaths = Array.from(document.content.matchAll(/data-storage-path=["']([^"']+)["']/g)).map(match => match[1]);
        const mindmapPaths = (parseMindmap(document.content)?.nodes ?? []).map(node => node.imagePath ?? "");
        return [...documentPaths, ...mindmapPaths, ...flowchartImagePaths(document.content)].filter(path => documentImagePathPattern.test(path));
      })));
      const attachments: WorkspaceBackupAttachment[] = [];
      if (imagePaths.length) {
        const { data: signedImages, error: signedError } = await supabase.storage.from(DOCUMENT_IMAGE_BUCKET).createSignedUrls(imagePaths, 3600);
        if (signedError) throw signedError;
        await Promise.all((signedImages ?? []).map(async item => {
          if (!item.signedUrl) return;
          const response = await fetch(item.signedUrl);
          if (!response.ok) throw new Error(tr("An attached image could not be backed up", "첨부 이미지 중 하나를 백업하지 못했습니다"));
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          attachments.push({ path: item.path, mimeType: blob.type || "application/octet-stream", dataUrl });
        }));
      }
      const backup: WorkspaceBackup = {
        version: 2,
        product: "Questdeck",
        kind: "full-workspace",
        createdAt: new Date().toISOString(),
        workspace: { cards, subTodos, projects, milestones, productionDisciplines, members, roleDefinitions, workspaces, activeWorkspaceId, settings: { studioName, weeklyDigest, defaultProjectId, language }, documents, documentComments: allDocumentComments, notifications, activityEvents, columnNames },
        attachments,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `questdeck-full-workspace-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast(tr(`Full backup downloaded · ${attachments.length} images included`, `전체 백업을 다운로드했습니다 · 이미지 ${attachments.length}개 포함`));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not create the full backup", "전체 백업을 만들지 못했습니다"));
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreBoardBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) { setToast(tr("Backup file is too large", "백업 파일이 너무 큽니다")); return; }
    setBackupBusy(true);
    try {
      const parsed = JSON.parse(await file.text()) as Partial<BoardBackup>;
      if (parsed.version !== 1 || parsed.product !== "Questdeck" || !Array.isArray(parsed.cards) || !parsed.cards.every(card => card && typeof card.id === "number" && typeof card.title === "string" && productionStages.includes(card.status))) throw new Error("Invalid backup");
      const knownProjects = new Set(projects.map(item => item.name));
      const restoredCards = parsed.cards.filter(card => knownProjects.has(card.project));
      const skipped = parsed.cards.length - restoredCards.length;
      const existingIds = new Set(cards.map(card => card.id));
      const merged = new Map(cards.map(card => [card.id, card]));
      restoredCards.forEach(card => merged.set(card.id, card));
      setCards(Array.from(merged.values()));
      const restoredTodos = parsed.subTodos && typeof parsed.subTodos === "object" ? parsed.subTodos : {};
      setSubTodos(current => ({ ...current, ...restoredTodos }));
      if (parsed.columnNames && typeof parsed.columnNames === "object") setColumnNames(parsed.columnNames);
      if (session?.access_token) {
        await Promise.all(restoredCards.map(async card => {
          await syncQuestdeck(existingIds.has(card.id) ? "update_card" : "create_card", { card }, session.access_token!);
          const items = restoredTodos[card.id];
          if (Array.isArray(items)) await syncQuestdeck("replace_subtasks", { cardId: card.id, items }, session.access_token!);
        }));
      }
      setBackupOpen(false);
      setToast(skipped ? tr(`Restored ${restoredCards.length} cards; skipped ${skipped} from missing projects`, `${restoredCards.length}개 복원, 없는 프로젝트의 ${skipped}개 건너뜀`) : tr(`Restored ${restoredCards.length} cards`, `${restoredCards.length}개 카드를 복원했습니다`));
    } catch {
      setToast(tr("That file is not a valid Questdeck board backup", "올바른 Questdeck 보드 백업 파일이 아닙니다"));
    } finally {
      setBackupBusy(false);
    }
  }

  function openCreateCard(status: Status = "Ready", prefill?: { title: string; description: string }) {
    setCreateStatus(status);
    setCreateDraftTitle(prefill?.title ?? "");
    setCreateDraftDescription(prefill?.description ?? "");
    setCreateEffort(3);
    setCreatePriority(5);
    setCreateOwner(currentMember?.initials ?? members.find(member => member.status === "Active" && member.workspaceIds.includes(activeWorkspaceId))?.initials ?? "JK");
    setCreateCollaborators([]);
    setCreateStartDate("");
    setCreateDueDate("");
    setActiveColumnMenu(null);
    if (session) setCreateOpen(true);
    else setAuthOpen(true);
  }

  function openCardEditor(card: Card) {
    setEditEffort(card.points);
    setEditPriority(card.priority);
    setEditOwner(card.owner);
    setEditCollaborators(card.collaborators ?? []);
    setEditStartDate(card.startDate ?? card.dueDate ?? "");
    setEditDueDate(card.dueDate ?? "");
    setEditCardOpen(true);
  }

  function openCard(card: Card) {
    setSelected(card);
    setHeroPanelOpen(true);
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

  async function moveBoardCard(cardId: number, status: Status) {
    const accessToken = requireSession();
    const previous = cards.find(card => card.id === cardId);
    setDraggedBoardCard(null);
    setBoardDropStatus(null);
    setBoardDropAction(null);
    if (!accessToken || !previous || previous.status === status) return;
    const updated = { ...previous, status };
    setCards(current => current.map(card => card.id === cardId ? updated : card));
    setSelected(current => current?.id === cardId ? updated : current);
    setToast(tr(`${previous.title} moved to ${statusLabel(status)}`, `${previous.title} 카드를 ${statusLabel(status)}(으)로 이동했습니다`));
    try {
      await syncQuestdeck("update_card", { card: updated }, accessToken);
    } catch (error) {
      setCards(current => current.map(card => card.id === cardId ? previous : card));
      setSelected(current => current?.id === cardId ? previous : current);
      setToast(error instanceof Error ? error.message : tr("Could not move card", "카드를 이동하지 못했습니다"));
    }
  }

  async function setCardArchived(card: Card, archived: boolean) {
    const accessToken = requireSession();
    setDraggedBoardCard(null);
    setBoardDropStatus(null);
    setBoardDropAction(null);
    if (!accessToken || Boolean(card.archived) === archived) return;
    const updated = { ...card, archived };
    setCards(current => current.map(item => item.id === card.id ? updated : item));
    setSelected(null);
    setToast(archived ? tr(`${card.title} moved to the archive`, `${card.title} 카드를 보관함으로 이동했습니다`) : tr(`${card.title} restored to the board`, `${card.title} 카드를 보드로 복원했습니다`));
    try {
      await syncQuestdeck("update_card", { card: updated }, accessToken);
    } catch (error) {
      setCards(current => current.map(item => item.id === card.id ? card : item));
      setToast(error instanceof Error ? error.message : tr("Could not update archive", "보관함을 업데이트하지 못했습니다"));
    }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = requireSession();
    if (!accessToken) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email")).trim().toLowerCase();
    const name = String(data.get("name") || email.split("@")[0]);
    const initials = name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
    const workspaceIds = data.getAll("workspaceIds").map(String);
    const member: Member = { id: Date.now(), name, email, initials, role: String(data.get("role")) as Member["role"], discipline: String(data.get("discipline") || "General"), status: "Invited", workspaceIds: workspaceIds.length ? workspaceIds : [activeWorkspaceId] };
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
    const name = studioName.trim() || activeWorkspace.name;
    const initials = name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
    setStudioName(name);
    setWorkspaces(current => current.map(workspace => workspace.id === activeWorkspaceId ? { ...workspace, name, initials } : workspace));
    window.localStorage.setItem("questdeck-workspace-settings", JSON.stringify({ studioName: name, weeklyDigest, defaultProjectId }));
    setToast(tr("Workspace profile saved on this device", "워크스페이스 프로필을 이 기기에 저장했습니다"));
  }

  function openNotification(item: Notification) {
    setNotifications(current => current.map(notification => notification.id === item.id ? { ...notification, read: true } : notification));
    if (session?.access_token) void syncQuestdeck("mark_notification_read", { notificationId: item.id }, session.access_token).catch(() => undefined);
    setNotificationOpen(false);
    setView(item.destination);
  }

  function markAllNotificationsRead() {
    setNotifications(current => current.map(item => ({ ...item, read: true })));
    if (session?.access_token) void syncQuestdeck("mark_all_notifications_read", {}, session.access_token).catch(() => undefined);
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
      workspaceIds: editMember.role === "Owner" ? workspaces.map(workspace => workspace.id) : data.getAll("workspaceIds").map(String),
    };
    if (!updated.workspaceIds.length) { setToast(tr("Choose at least one workspace", "워크스페이스를 하나 이상 선택하세요")); return; }
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

  async function updateMemberDiscipline(member: Member, discipline: string) {
    const accessToken = requireSession();
    if (!accessToken || discipline === member.discipline) return;
    const updated = { ...member, discipline };
    try {
      await syncQuestdeck("update_member", { member: updated }, accessToken);
      setMembers(current => current.map(item => item.id === updated.id ? updated : item));
      setToast(tr(`${member.name}'s primary discipline is now ${discipline}`, `${member.name}님의 주요 분야를 ${discipline}(으)로 변경했습니다`));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not update discipline", "분야를 수정하지 못했습니다"));
    }
  }

  function addDiscipline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireSession()) return;
    const name = newDiscipline.trim();
    if (!name) return;
    if (disciplines.some(item => item.toLowerCase() === name.toLowerCase())) {
      setToast(tr("That discipline already exists", "이미 존재하는 분야입니다"));
      return;
    }
    setDisciplines(current => [...current.filter(item => item !== "General"), name, ...(current.includes("General") ? ["General"] : [])]);
    setNewDiscipline("");
    setToast(tr(`${name} discipline added`, `${name} 분야를 추가했습니다`));
  }

  async function renameDiscipline(oldName: string) {
    if (oldName === "General") return;
    const name = editedDiscipline.trim();
    if (!name || name === oldName) { setEditingDiscipline(null); return; }
    if (disciplines.some(item => item !== oldName && item.toLowerCase() === name.toLowerCase())) {
      setToast(tr("That discipline already exists", "이미 존재하는 분야입니다"));
      return;
    }
    const accessToken = requireSession();
    if (!accessToken) return;
    const affected = members.filter(member => member.discipline === oldName).map(member => ({ ...member, discipline: name }));
    try {
      await Promise.all(affected.map(member => syncQuestdeck("update_member", { member }, accessToken)));
      setMembers(current => current.map(member => member.discipline === oldName ? { ...member, discipline: name } : member));
      setDisciplines(current => current.map(item => item === oldName ? name : item));
      setEditingDiscipline(null);
      setEditedDiscipline("");
      setToast(tr(`${oldName} renamed to ${name}`, `${oldName}을(를) ${name}(으)로 변경했습니다`));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not rename discipline", "분야 이름을 변경하지 못했습니다"));
    }
  }

  async function deleteDiscipline(name: string) {
    if (name === "General") return;
    const affected = members.filter(member => member.discipline === name);
    if (!window.confirm(tr(`Delete ${name}? ${affected.length} assigned member(s) will move to General.`, `${name} 분야를 삭제할까요? 배정된 멤버 ${affected.length}명은 General로 이동합니다.`))) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    const reassigned = affected.map(member => ({ ...member, discipline: "General" }));
    try {
      await Promise.all(reassigned.map(member => syncQuestdeck("update_member", { member }, accessToken)));
      setMembers(current => current.map(member => member.discipline === name ? { ...member, discipline: "General" } : member));
      setDisciplines(current => current.filter(item => item !== name));
      if (editingDiscipline === name) setEditingDiscipline(null);
      setToast(tr(`${name} deleted`, `${name} 분야를 삭제했습니다`));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not delete discipline", "분야를 삭제하지 못했습니다"));
    }
  }

  async function addProductionDiscipline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = requireSession();
    const name = newProductionDiscipline.trim();
    if (!accessToken || !name) return;
    if (productionDisciplines.some(item => item.name.toLowerCase() === name.toLowerCase())) {
      setToast(tr("That production discipline already exists", "이미 존재하는 프로덕션 분야입니다"));
      return;
    }
    const colors = ["violet", "coral", "mint", "blue-card", "rose-card", "amber-card"];
    try {
      const result = await syncQuestdeck<{ discipline: ProductionDiscipline }>("add_discipline", { name, color: colors[productionDisciplines.length % colors.length] }, accessToken);
      setProductionDisciplines(current => [...current.filter(item => item.name !== "General"), result.discipline, ...current.filter(item => item.name === "General")]);
      setNewProductionDiscipline("");
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not add discipline", "분야를 추가하지 못했습니다"));
    }
  }

  async function renameProductionDiscipline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProductionDiscipline || editingProductionDiscipline.name === "General") return;
    const accessToken = requireSession();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name")).trim();
    if (!accessToken || !name) return;
    try {
      await syncQuestdeck("rename_discipline", { id: editingProductionDiscipline.id, name }, accessToken);
      setProductionDisciplines(current => current.map(item => item.id === editingProductionDiscipline.id ? { ...item, name } : item));
      setCards(current => current.map(card => card.tag === editingProductionDiscipline.name ? { ...card, tag: name } : card));
      setSelected(current => current?.tag === editingProductionDiscipline.name ? { ...current, tag: name } : current);
      setEditingProductionDiscipline(null);
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not rename discipline", "분야 이름을 변경하지 못했습니다"));
    }
  }

  async function deleteProductionDiscipline(item: ProductionDiscipline) {
    if (item.name === "General" || !window.confirm(tr(`Delete ${item.name}? Cards will move to General.`, `${item.name} 분야를 삭제할까요? 카드는 General로 이동합니다.`))) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    try {
      await syncQuestdeck("delete_discipline", { id: item.id }, accessToken);
      setProductionDisciplines(current => current.filter(discipline => discipline.id !== item.id));
      setCards(current => current.map(card => card.tag === item.name ? { ...card, tag: "General", color: "blue-card" } : card));
      setSelected(current => current?.tag === item.name ? { ...current, tag: "General", color: "blue-card" } : current);
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not delete discipline", "분야를 삭제하지 못했습니다"));
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
      if (!defaultProjectId) setDefaultProjectId(newProject.id);
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
      if (updated.status === "Archived" && project === editProject.name) setProject("All projects");
      else if (project === editProject.name) setProject(updated.name);
      if (updated.status === "Archived" && defaultProjectId === updated.id) setDefaultProjectId(projects.find(item => item.id !== updated.id && item.status !== "Archived")?.id ?? "");
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
      if (status === "Archived" && project === item.name) setProject("All projects");
      if (status === "Archived" && defaultProjectId === item.id) setDefaultProjectId(projects.find(projectItem => projectItem.id !== item.id && projectItem.status !== "Archived")?.id ?? "");
      setToast(`${item.name} ${status === "Archived" ? "archived" : "restored"}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not update project", "프로젝트를 수정하지 못했습니다"));
    }
  }

  async function deleteArchivedProject(item: Project) {
    if (item.status !== "Archived") return;
    if (!window.confirm(tr(
      `Permanently delete “${item.name}” and all of its cards and sub-tasks? This cannot be undone.`,
      `“${item.name}” 프로젝트와 모든 카드 및 하위 작업을 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
    ))) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    try {
      await syncQuestdeck("delete_project", { projectId: item.id }, accessToken);
      const deletedCardIds = new Set(cards.filter(card => card.project === item.name).map(card => card.id));
      setProjects(current => current.filter(projectItem => projectItem.id !== item.id));
      setCards(current => current.filter(card => card.project !== item.name));
      setSubTodos(current => Object.fromEntries(Object.entries(current).filter(([cardId]) => !deletedCardIds.has(Number(cardId)))));
      if (project === item.name) setProject("All projects");
      if (defaultProjectId === item.id) setDefaultProjectId(activeProjects.find(projectItem => projectItem.id !== item.id)?.id ?? "");
      setToast(tr(`${item.name} permanently deleted`, `${item.name} 프로젝트를 영구 삭제했습니다`));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not delete project", "프로젝트를 삭제하지 못했습니다"));
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

  function persistHeroItems(cardId: number, items: SubTodo[], message?: string) {
    const accessToken = requireSession();
    if (!accessToken) return;
    setSubTodos(current => ({ ...current, [cardId]: items }));
    void syncQuestdeck("replace_subtasks", { cardId, items }, accessToken).catch(() => setToast(tr("Hero links saved locally; Supabase sync failed", "Hero 연결은 로컬에 저장되었지만 Supabase 동기화에 실패했습니다")));
    if (message) setToast(message);
  }

  function promoteSelectedToHero() {
    if (!selected) return;
    const items = subTodos[selected.id] ?? [];
    if (hasHeroMarker(items)) return;
    persistHeroItems(selected.id, [{ id: Date.now(), text: HERO_MARKER, done: false }, ...items], tr("Hero card created", "Hero 카드를 만들었습니다"));
  }

  function linkExistingHeroChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const childId = Number(new FormData(event.currentTarget).get("heroChildId"));
    if (!Number.isFinite(childId) || childId === selected.id) return;
    const items = subTodos[selected.id] ?? [];
    const linked = new Set(heroChildIds(items));
    if (linked.has(childId)) return;
    const next = [
      ...(hasHeroMarker(items) ? items : [{ id: Date.now(), text: HERO_MARKER, done: false }, ...items]),
      { id: Date.now() + 1, text: `${HERO_CHILD_PREFIX}${childId}`, done: false },
    ];
    persistHeroItems(selected.id, next, tr("Card linked to Hero", "카드를 Hero에 연결했습니다"));
    event.currentTarget.reset();
  }

  function unlinkHeroChild(heroId: number, childId: number) {
    const items = subTodos[heroId] ?? [];
    persistHeroItems(heroId, items.filter(item => item.text !== `${HERO_CHILD_PREFIX}${childId}`), tr("Card removed from Hero", "카드를 Hero에서 분리했습니다"));
  }

  function createHeroChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !heroChildTitle.trim()) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    const child: Card = {
      ...selected,
      id: Date.now(),
      title: heroChildTitle.trim(),
      description: tr(`Part of ${selected.title}.`, `${selected.title} Hero 카드의 하위 카드입니다.`),
      points: 3,
      status: "Ready",
      due: "No date",
      dueDate: null,
      startDate: null,
      archived: false,
    };
    const items = subTodos[selected.id] ?? [];
    const next = [
      ...(hasHeroMarker(items) ? items : [{ id: Date.now() + 1, text: HERO_MARKER, done: false }, ...items]),
      { id: Date.now() + 2, text: `${HERO_CHILD_PREFIX}${child.id}`, done: false },
    ];
    setCards(current => [child, ...current]);
    setHeroChildTitle("");
    persistHeroItems(selected.id, next, tr("Sub-card created", "하위 카드를 만들었습니다"));
    void syncQuestdeck("create_card", { card: child }, accessToken).catch(() => setToast(tr("Sub-card saved locally; Supabase sync failed", "하위 카드는 로컬에 저장되었지만 Supabase 동기화에 실패했습니다")));
  }

  function startHeroJourney(template: JourneyTemplate) {
    if (!selected) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    const baseId = Date.now();
    const steps = language === "ko" ? template.stepsKo : template.steps;
    const children = steps.map((title, index): Card => ({
      ...selected,
      id: baseId + index,
      title,
      description: tr(`${template.name}: step ${index + 1} of ${steps.length}.`, `${template.nameKo}: ${steps.length}단계 중 ${index + 1}단계입니다.`),
      points: 3,
      status: "Ready",
      due: "No date",
      dueDate: null,
      startDate: null,
      archived: false,
    }));
    const items = subTodos[selected.id] ?? [];
    const existingIds = new Set(heroChildIds(items));
    const markers = children.filter(child => !existingIds.has(child.id)).map((child, index) => ({ id: baseId + 100 + index, text: `${HERO_CHILD_PREFIX}${child.id}`, done: false }));
    const next = [...(hasHeroMarker(items) ? items : [{ id: baseId + 99, text: HERO_MARKER, done: false }, ...items]), ...markers];
    setCards(current => [...children, ...current]);
    persistHeroItems(selected.id, next, tr(`${template.name} started with ${children.length} cards`, `${template.nameKo}에 ${children.length}개 카드가 생성되었습니다`));
    children.forEach(child => void syncQuestdeck("create_card", { card: child }, accessToken).catch(() => setToast(tr("Some Journey cards could not sync", "일부 여정 카드를 동기화하지 못했습니다"))));
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
    if (editStartDate && editDueDate && editStartDate > editDueDate) { setToast(tr("Start date must be before the due date", "시작일은 마감일보다 빨라야 합니다")); return; }
    const updated: Card = {
      ...selected,
      title: String(data.get("title")),
      description: String(data.get("description")),
      tag: String(data.get("tag")),
      points: editEffort,
      priority: editPriority,
      owner: editOwner,
      collaborators: editCollaborators.filter(initials => initials !== editOwner),
      color: productionDisciplines.find(item => item.name === String(data.get("tag")))?.color ?? selected.color,
      project: String(data.get("project")),
      due: dueLabelFromInput(editDueDate),
      dueDate: editDueDate || null,
      startDate: editStartDate || null,
      status: String(data.get("status")) as Status,
    };
    setCards(current => current.map(card => card.id === updated.id ? updated : card));
    setSelected(updated);
    setEditCardOpen(false);
    setToast(tr("Card updated", "카드를 수정했습니다"));
    void syncQuestdeck("update_card", { card: updated }, accessToken).catch(() => setToast(tr("Card saved locally; Supabase sync failed", "카드는 로컬에 저장되었지만 Supabase 동기화에 실패했습니다")));
  }

  async function deleteCard(card: Card) {
    setDraggedBoardCard(null);
    setBoardDropStatus(null);
    setBoardDropAction(null);
    if (!window.confirm(tr(`Delete “${card.title}” and all of its sub-tasks? This cannot be undone.`, `“${card.title}” 카드와 모든 하위 작업을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    try {
      await syncQuestdeck("delete_card", { cardId: card.id }, accessToken);
      setCards(current => current.filter(item => item.id !== card.id));
      setSubTodos(current => {
        const next = { ...current };
        delete next[card.id];
        return next;
      });
      setProjects(current => current.map(item => item.name === card.project ? { ...item, count: Math.max(0, item.count - 1) } : item));
      setSelected(null);
      setEditCardOpen(false);
      setToast(tr("Card deleted", "카드를 삭제했습니다"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not delete card", "카드를 삭제하지 못했습니다"));
    }
  }

  function markMindmapDirty() {
    mindmapRevisionRef.current += 1;
    setMindmapDirty(true);
    setMindmapSaveState("saving");
  }

  async function saveMindmap(): Promise<WorkspaceDocument | null> {
    const accessToken = requireSession();
    if (!accessToken) return null;
    const revision = mindmapRevisionRef.current;
    const request = ++mindmapSaveRequestRef.current;
    const content = serializeMindmap(mindmapNodes, mindmapEdges);
    const existing = documents.find(document => document.id === activeMindmapDocumentId && isMindmapDocument(document));
    setMindmapSaveState("saving");
    try {
      const document = existing
        ? { ...existing, title: mindmapTitle.trim() || tr("Untitled mindmap", "제목 없는 마인드맵"), content, isPublished: false }
        : { title: mindmapTitle.trim() || tr("Untitled mindmap", "제목 없는 마인드맵"), content, createdByEmail: accountEmail ?? "", ownerName: accountName, isPublished: false };
      const result = await syncQuestdeck<{ document: { id: number; title: string; content: string; created_by_email: string; owner_name: string; is_published: boolean; share_slug: string; created_at: string; updated_at: string } }>(existing ? "update_document" : "create_document", { document }, accessToken);
      if (mindmapSaveRequestRef.current !== request) return;
      const saved = mapDocument(result.document);
      setDocuments(current => existing ? current.map(item => item.id === saved.id ? saved : item) : [saved, ...current]);
      if (!existing) setActiveMindmapDocumentId(saved.id);
      if (mindmapRevisionRef.current === revision) {
        setMindmapDirty(false);
        setMindmapSaveState("saved");
      } else setMindmapSaveState("saving");
      return saved;
    } catch (error) {
      if (mindmapSaveRequestRef.current === request) setMindmapSaveState("error");
      setToast(error instanceof Error ? error.message : tr("Could not save mindmap", "마인드맵을 저장하지 못했습니다"));
      return null;
    }
  }

  async function createMindmap() {
    const accessToken = requireSession();
    if (!accessToken) return;
    if (mindmapDirty && !await saveMindmap()) return;
    const id = `idea-${Date.now()}`;
    const nodes: MindmapNode[] = [{ id, title: tr("Central idea", "중심 아이디어"), note: tr("What do you want to explore?", "무엇을 탐색하고 싶나요?"), x: 0, y: 0, color: "violet" }];
    const title = tr(`Mindmap ${documents.filter(isMindmapDocument).length + 1}`, `마인드맵 ${documents.filter(isMindmapDocument).length + 1}`);
    try {
      const result = await syncQuestdeck<{ document: { id: number; title: string; content: string; created_by_email: string; owner_name: string; is_published: boolean; share_slug: string; created_at: string; updated_at: string } }>("create_document", { document: { title, content: serializeMindmap(nodes, []), createdByEmail: accountEmail ?? "", ownerName: accountName, isPublished: false } }, accessToken);
      const saved = mapDocument(result.document);
      setDocuments(current => [saved, ...current]);
      setActiveMindmapDocumentId(saved.id);
      setMindmapTitle(saved.title);
      setMindmapNodes(nodes);
      setMindmapEdges([]);
      setSelectedMindmapNodeId(id);
      setMindmapDirty(false);
      setMindmapSaveState("saved");
      setMindmapViewport({ x: 430, y: 170, zoom: 1 });
    } catch (error) { setToast(error instanceof Error ? error.message : tr("Could not create mindmap", "마인드맵을 만들지 못했습니다")); }
  }

  async function switchMindmap(document: WorkspaceDocument) {
    if (document.id === activeMindmapDocumentId) return;
    if (mindmapDirty && !await saveMindmap()) return;
    setMindmapDirty(false);
    setActiveMindmapDocumentId(document.id);
    setMindmapViewport({ x: 430, y: 145, zoom: 1 });
  }

  async function deleteMindmap(document: WorkspaceDocument) {
    if (!window.confirm(tr(`Delete “${document.title}” and its attached images?`, `“${document.title}”과(와) 첨부 이미지를 삭제할까요?`))) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    try {
      const parsed = parseMindmap(document.content);
      const imagePaths = Array.from(new Set((parsed?.nodes ?? []).map(node => node.imagePath).filter((path): path is string => Boolean(path) && documentImagePathPattern.test(path!))));
      if (imagePaths.length) await supabase.storage.from(DOCUMENT_IMAGE_BUCKET).remove(imagePaths);
      await syncQuestdeck("delete_document", { documentId: document.id }, accessToken);
      const remaining = documents.filter(item => item.id !== document.id);
      const next = remaining.find(isMindmapDocument);
      setDocuments(remaining);
      setMindmapDirty(false);
      setActiveMindmapDocumentId(next?.id ?? null);
      if (!next) { setMindmapTitle(tr("New mindmap", "새 마인드맵")); setMindmapNodes([]); setMindmapEdges([]); setSelectedMindmapNodeId(null); }
      setToast(tr("Mindmap deleted", "마인드맵을 삭제했습니다"));
    } catch (error) { setToast(error instanceof Error ? error.message : tr("Could not delete mindmap", "마인드맵을 삭제하지 못했습니다")); }
  }

  async function uploadMindmapImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const node = mindmapNodes.find(item => item.id === selectedMindmapNodeId);
    const accessToken = requireSession();
    if (!file || !node || !accessToken || !session?.user.id) return;
    if (!documentImageTypes.has(file.type)) { setToast(tr("Choose a JPG, PNG, WebP, or GIF image", "JPG, PNG, WebP 또는 GIF 이미지를 선택하세요")); return; }
    if (file.size > 10 * 1024 * 1024) { setToast(tr("Image must be smaller than 10 MB", "이미지는 10MB보다 작아야 합니다")); return; }
    setMindmapImageUploading(true);
    try {
      const mapDocument = documents.find(document => document.id === activeMindmapDocumentId && isMindmapDocument(document)) ?? await saveMindmap();
      if (!mapDocument) throw new Error(tr("Save the mindmap before attaching an image", "이미지를 첨부하기 전에 마인드맵을 저장하세요"));
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-90) || "image";
      const path = `${activeWorkspaceId}/${session.user.id}/${mapDocument.id}/mindmap-${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from(DOCUMENT_IMAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      if (node.imagePath) await supabase.storage.from(DOCUMENT_IMAGE_BUCKET).remove([node.imagePath]);
      setMindmapImageUrls(current => ({ ...current, [path]: URL.createObjectURL(file) }));
      updateMindmapNode(node.id, { imagePath: path });
      setToast(tr("Image attached privately", "이미지를 비공개로 첨부했습니다"));
    } catch (error) { setToast(error instanceof Error ? error.message : tr("Could not attach image", "이미지를 첨부하지 못했습니다")); }
    finally { setMindmapImageUploading(false); }
  }

  async function removeMindmapImage(node: MindmapNode) {
    if (!node.imagePath) return;
    const path = node.imagePath;
    const { error } = await supabase.storage.from(DOCUMENT_IMAGE_BUCKET).remove([path]);
    if (error) { setToast(error.message); return; }
    setMindmapImageUrls(current => { const next = { ...current }; delete next[path]; return next; });
    updateMindmapNode(node.id, { imagePath: undefined });
  }

  function createCardFromMindmap(node: MindmapNode) {
    openCreateCard("Ready", { title: node.title, description: node.note });
  }

  function addMindmapNode(clientX?: number, clientY?: number) {
    const canvas = mindmapCanvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const screenX = clientX ?? (rect ? rect.left + rect.width / 2 : 500);
    const screenY = clientY ?? (rect ? rect.top + rect.height / 2 : 400);
    const id = `idea-${Date.now()}`;
    const node: MindmapNode = {
      id,
      title: tr("New idea", "새 아이디어"),
      note: tr("Add a short thought or question", "짧은 생각이나 질문을 추가하세요"),
      x: (screenX - (rect?.left ?? 0) - mindmapViewport.x) / mindmapViewport.zoom - 110,
      y: (screenY - (rect?.top ?? 0) - mindmapViewport.y) / mindmapViewport.zoom - 65,
      color: "blue",
    };
    setMindmapNodes(current => [...current, node]);
    setSelectedMindmapNodeId(id);
    markMindmapDirty();
  }

  function deleteMindmapNode(nodeId: string) {
    const node = mindmapNodes.find(item => item.id === nodeId);
    if (!node || !window.confirm(tr(`Delete “${node.title}” from the mindmap?`, `마인드맵에서 “${node.title}”을(를) 삭제할까요?`))) return;
    setMindmapNodes(current => current.filter(item => item.id !== nodeId));
    setMindmapEdges(current => current.filter(edge => edge.from !== nodeId && edge.to !== nodeId));
    setSelectedMindmapNodeId(current => current === nodeId ? null : current);
    setLinkingMindmapNodeId(current => current === nodeId ? null : current);
    markMindmapDirty();
  }

  function updateMindmapNode(nodeId: string, patch: Partial<MindmapNode>) {
    setMindmapNodes(current => current.map(node => node.id === nodeId ? { ...node, ...patch } : node));
    markMindmapDirty();
  }

  function connectMindmapNode(nodeId: string) {
    if (!linkingMindmapNodeId) { setLinkingMindmapNodeId(nodeId); return; }
    if (linkingMindmapNodeId === nodeId) { setLinkingMindmapNodeId(null); return; }
    const duplicate = mindmapEdges.some(edge => edge.from === linkingMindmapNodeId && edge.to === nodeId || edge.from === nodeId && edge.to === linkingMindmapNodeId);
    if (!duplicate) {
      setMindmapEdges(current => [...current, { id: `edge-${Date.now()}`, from: linkingMindmapNodeId, to: nodeId }]);
      markMindmapDirty();
    }
    setLinkingMindmapNodeId(null);
  }

  function beginMindmapPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest(".mindmap-node")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    mindmapGestureRef.current = { mode: "pan", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: mindmapViewport.x, originY: mindmapViewport.y };
    mindmapDidMoveRef.current = false;
  }

  function beginMindmapNodeDrag(event: ReactPointerEvent<HTMLElement>, node: MindmapNode) {
    if (event.button !== 0 || Boolean(session) && !currentPermissions?.edit_cards || (event.target as HTMLElement).closest("button")) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    mindmapGestureRef.current = { mode: "node", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y, nodeId: node.id };
    mindmapDidMoveRef.current = false;
    setSelectedMindmapNodeId(node.id);
  }

  function moveMindmapPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = mindmapGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) mindmapDidMoveRef.current = true;
    if (gesture.mode === "pan") setMindmapViewport(current => ({ ...current, x: gesture.originX + deltaX, y: gesture.originY + deltaY }));
    else if (gesture.nodeId) setMindmapNodes(current => current.map(node => node.id === gesture.nodeId ? { ...node, x: gesture.originX + deltaX / mindmapViewport.zoom, y: gesture.originY + deltaY / mindmapViewport.zoom } : node));
  }

  function finishMindmapPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = mindmapGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.mode === "node" && mindmapDidMoveRef.current) markMindmapDirty();
    mindmapGestureRef.current = null;
  }

  function zoomMindmap(nextZoom: number, clientX?: number, clientY?: number) {
    const canvas = mindmapCanvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return;
    const zoom = Math.min(2.2, Math.max(.35, nextZoom));
    const anchorX = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const anchorY = (clientY ?? rect.top + rect.height / 2) - rect.top;
    setMindmapViewport(current => {
      const worldX = (anchorX - current.x) / current.zoom;
      const worldY = (anchorY - current.y) / current.zoom;
      return { x: anchorX - worldX * zoom, y: anchorY - worldY * zoom, zoom };
    });
  }

  function handleMindmapWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoomMindmap(mindmapViewport.zoom * (event.deltaY > 0 ? .9 : 1.1), event.clientX, event.clientY);
  }

  function fitMindmap() {
    const canvas = mindmapCanvasRef.current;
    if (!canvas || mindmapNodes.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const minX = Math.min(...mindmapNodes.map(node => node.x));
    const minY = Math.min(...mindmapNodes.map(node => node.y));
    const maxX = Math.max(...mindmapNodes.map(node => node.x + 220));
    const maxY = Math.max(...mindmapNodes.map(node => node.y + 130));
    const zoom = Math.min(1.25, Math.max(.35, Math.min((rect.width - 100) / Math.max(220, maxX - minX), (rect.height - 100) / Math.max(130, maxY - minY))));
    setMindmapViewport({ x: (rect.width - (minX + maxX) * zoom) / 2, y: (rect.height - (minY + maxY) * zoom) / 2, zoom });
  }

  function mapDocument(item: { id: number; title: string; content: string; created_by_email: string; owner_name: string; is_published: boolean; share_slug: string; created_at: string; updated_at: string }): WorkspaceDocument {
    return { id: item.id, title: item.title, content: item.content, createdByEmail: item.created_by_email, ownerName: item.owner_name, isPublished: item.is_published, shareSlug: item.share_slug, createdAt: item.created_at, updatedAt: item.updated_at };
  }

  function mapDocumentComment(item: { id: number; document_id: number; user_id: string; author_email: string; author_name: string; body: string; created_at: string }): DocumentComment {
    return { id: item.id, documentId: item.document_id, userId: item.user_id, authorEmail: item.author_email, authorName: item.author_name, body: item.body, createdAt: item.created_at };
  }

  async function loadDocumentComments(documentId: number) {
    const { data, error } = await supabase.from("questdeck_document_comments").select("id,document_id,user_id,author_email,author_name,body,created_at").eq("workspace_id", activeWorkspaceId).eq("document_id", documentId).order("created_at", { ascending: true });
    if (error) { setDocumentComments([]); return; }
    setDocumentComments((data ?? []).map(mapDocumentComment));
  }

  function openDocumentEditor(document: WorkspaceDocument) {
    const content = sanitizeRichText(document.content);
    documentEditorHtmlRef.current = { __html: content };
    documentEditingIdRef.current = document.id;
    documentDirtyRef.current = false;
    setEditingDocument(document);
    setDocumentDraftTitle(document.title);
    setDocumentDraftContent(content);
    setDocumentDirty(false);
    setDocumentSaveState("saved");
    setDocumentCommentsOpen(true);
    setDocumentEditorOpen(true);
    void loadDocumentComments(document.id);
    void hydrateDocumentImages(content).then(hydrated => {
      if (documentEditingIdRef.current !== document.id || documentDirtyRef.current) return;
      setDocumentDraftContent(hydrated);
      if (documentEditorRef.current) documentEditorRef.current.innerHTML = hydrated;
    });
  }

  async function createBlankDocument() {
    const accessToken = requireSession();
    if (!accessToken) return;
    try {
      const document = { title: tr("Untitled document", "제목 없는 문서"), content: "<p><br></p>", createdByEmail: accountEmail ?? "", ownerName: accountName, isPublished: false };
      const result = await syncQuestdeck<{ document: { id: number; title: string; content: string; created_by_email: string; owner_name: string; is_published: boolean; share_slug: string; created_at: string; updated_at: string } }>("create_document", { document }, accessToken);
      const saved = mapDocument(result.document);
      setDocuments(current => [saved, ...current]);
      openDocumentEditor(saved);
    } catch (error) { setToast(error instanceof Error ? error.message : tr("Could not create document", "문서를 만들지 못했습니다")); }
  }

  async function saveDocumentDraft(closeAfter = false) {
    const accessToken = requireSession();
    if (!accessToken || !editingDocument) return;
    const request = ++documentSaveRequest.current;
    const document = { ...editingDocument, title: documentDraftTitle.trim() || tr("Untitled document", "제목 없는 문서"), content: sanitizeRichText(documentEditorRef.current?.innerHTML ?? documentDraftContent) };
    setDocumentSaveState("saving");
    try {
      const result = await syncQuestdeck<{ document: { id: number; title: string; content: string; created_by_email: string; owner_name: string; is_published: boolean; share_slug: string; created_at: string; updated_at: string } }>("update_document", { document }, accessToken);
      if (request !== documentSaveRequest.current) return;
      const saved = mapDocument(result.document);
      setDocuments(current => current.map(item => item.id === saved.id ? saved : item));
      setEditingDocument(saved);
      documentDirtyRef.current = false;
      setDocumentDirty(false);
      setDocumentSaveState("saved");
      if (closeAfter) { setDocumentEditorOpen(false); setEditingDocument(null); setDocumentComments([]); setToast(tr("Document saved", "문서를 저장했습니다")); }
    } catch (error) {
      if (request === documentSaveRequest.current) setDocumentSaveState("unsaved");
      setToast(error instanceof Error ? error.message : tr("Could not save document", "문서를 저장하지 못했습니다"));
    }
  }

  function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveDocumentDraft(true);
  }

  function updateDocumentContent() {
    documentDirtyRef.current = true;
    setDocumentDirty(true);
    setDocumentChangeVersion(version => version + 1);
    setDocumentSaveState("unsaved");
  }

  function rememberDocumentSelection() {
    const editor = documentEditorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    documentSelectionRef.current = range.cloneRange();
    const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
    documentTableCellRef.current = element?.closest("td,th") as HTMLTableCellElement | null;
  }

  function restoreDocumentSelection() {
    const editor = documentEditorRef.current;
    const range = documentSelectionRef.current;
    if (!editor) return;
    editor.focus();
    if (!range || !editor.contains(range.commonAncestorContainer)) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function formatDocument(command: string, value?: string) {
    restoreDocumentSelection();
    document.execCommand(command, false, value);
    rememberDocumentSelection();
    updateDocumentContent();
  }

  function addDocumentLink() {
    const url = window.prompt(tr("Paste a web address", "웹 주소를 붙여넣으세요"), "https://");
    if (!url || !/^https?:\/\//i.test(url)) return;
    formatDocument("createLink", url);
  }

  function insertDocumentTable(rows: number | unknown = 2, columns: number | unknown = 2) {
    const rowCount = typeof rows === "number" ? Math.max(1, Math.min(5, rows)) : 2;
    const columnCount = typeof columns === "number" ? Math.max(1, Math.min(5, columns)) : 2;
    const tableRows = Array.from({ length: rowCount }, (_, row) => `<tr>${Array.from({ length: columnCount }, () => row === 0 ? "<th>Heading</th>" : "<td>Cell</td>").join("")}</tr>`).join("");
    formatDocument("insertHTML", `<table><tbody>${tableRows}</tbody></table><p><br></p>`);
    setDocumentTableMenuOpen(false);
  }

  function activeDocumentCell() {
    rememberDocumentSelection();
    return documentTableCellRef.current;
  }

  function mutateDocumentTable(action: "add-row" | "add-column" | "delete-row" | "delete-column") {
    const cell = activeDocumentCell();
    const row = cell?.parentElement as HTMLTableRowElement | null;
    const table = cell?.closest<HTMLTableElement>("table");
    if (!cell || !row || !table) { setToast(tr("Place the cursor inside a table cell first", "먼저 표 셀 안에 커서를 놓으세요")); return; }
    if (action === "add-row") {
      const next = table.insertRow(row.rowIndex + 1);
      for (let index = 0; index < row.cells.length; index += 1) next.insertCell().textContent = tr("Cell", "셀");
      documentTableCellRef.current = next.cells[0];
    } else if (action === "add-column") {
      const columnIndex = cell.cellIndex + 1;
      Array.from(table.rows).forEach((tableRow, rowIndex) => {
        const nextCell = document.createElement(rowIndex === 0 ? "th" : "td");
        nextCell.textContent = rowIndex === 0 ? tr("Heading", "제목") : tr("Cell", "셀");
        tableRow.insertBefore(nextCell, tableRow.cells[columnIndex] ?? null);
      });
      documentTableCellRef.current = table.rows[row.rowIndex]?.cells[columnIndex] ?? cell;
    } else if (action === "delete-row") {
      if (table.rows.length <= 1) { table.remove(); documentTableCellRef.current = null; }
      else { table.deleteRow(row.rowIndex); documentTableCellRef.current = table.rows[Math.min(row.rowIndex, table.rows.length - 1)]?.cells[Math.min(cell.cellIndex, table.rows[0].cells.length - 1)] ?? null; }
    } else {
      if (row.cells.length <= 1) { table.remove(); documentTableCellRef.current = null; }
      else { const columnIndex = cell.cellIndex; Array.from(table.rows).forEach(tableRow => tableRow.deleteCell(columnIndex)); documentTableCellRef.current = table.rows[Math.min(row.rowIndex, table.rows.length - 1)]?.cells[Math.min(columnIndex, table.rows[0].cells.length - 1)] ?? null; }
    }
    updateDocumentContent();
    const nextCell = documentTableCellRef.current;
    if (nextCell) {
      const range = document.createRange();
      range.selectNodeContents(nextCell);
      range.collapse(false);
      documentSelectionRef.current = range;
      restoreDocumentSelection();
    }
  }

  function removeDocumentIndent() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!range.collapsed || range.startContainer.nodeType !== Node.TEXT_NODE) { formatDocument("outdent"); return; }
    const textNode = range.startContainer as Text;
    const whitespace = textNode.data.slice(0, range.startOffset).match(/(?: {1,4}|\t)$/)?.[0];
    if (!whitespace) { formatDocument("outdent"); return; }
    const nextOffset = range.startOffset - whitespace.length;
    textNode.deleteData(nextOffset, whitespace.length);
    range.setStart(textNode, nextOffset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    documentSelectionRef.current = range.cloneRange();
    updateDocumentContent();
  }

  function handleDocumentKeyDown(event: KeyboardEvent) {
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && key === "s") { event.preventDefault(); updateDocumentContent(); void saveDocumentDraft(false); return; }
    if (modifier && key === "b") { event.preventDefault(); formatDocument("bold"); return; }
    if (modifier && key === "i") { event.preventDefault(); formatDocument("italic"); return; }
    if (modifier && key === "u") { event.preventDefault(); formatDocument("underline"); return; }
    if (modifier && key === "z") { event.preventDefault(); formatDocument(event.shiftKey ? "redo" : "undo"); return; }
    if (modifier && (key === "y" || (event.shiftKey && key === "z"))) { event.preventDefault(); formatDocument("redo"); return; }
    if (modifier && event.shiftKey && event.code === "Digit7") { event.preventDefault(); formatDocument("insertOrderedList"); return; }
    if (modifier && event.shiftKey && event.code === "Digit8") { event.preventDefault(); formatDocument("insertUnorderedList"); return; }
    if (event.key !== "Tab") return;
    event.preventDefault();
    const cell = activeDocumentCell();
    if (cell) {
      const table = cell.closest<HTMLTableElement>("table")!;
      const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>("th,td"));
      let nextIndex = cells.indexOf(cell) + (event.shiftKey ? -1 : 1);
      if (nextIndex >= cells.length) { mutateDocumentTable("add-row"); return; }
      nextIndex = Math.max(0, nextIndex);
      const range = document.createRange();
      range.selectNodeContents(cells[nextIndex]);
      range.collapse(false);
      documentSelectionRef.current = range;
      documentTableCellRef.current = cells[nextIndex];
      restoreDocumentSelection();
      return;
    }
    const selection = window.getSelection();
    const element = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode as Element : selection?.anchorNode?.parentElement;
    if (element?.closest("li")) formatDocument(event.shiftKey ? "outdent" : "indent");
    else if (event.shiftKey) removeDocumentIndent();
    else formatDocument("insertText", "    ");
  }

  async function uploadDocumentImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editingDocument || !session) return;
    if (!documentImageTypes.has(file.type)) { setToast(tr("Use a JPG, PNG, WebP, or GIF image", "JPG, PNG, WebP 또는 GIF 이미지를 사용하세요")); return; }
    if (file.size > 5 * 1024 * 1024) { setToast(tr("Image must be 5 MB or smaller", "이미지는 5MB 이하여야 합니다")); return; }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
    const path = `${activeWorkspaceId}/${session.user.id}/${editingDocument.id}/${Date.now()}-${safeName}`;
    setDocumentImageUploading(true);
    try {
      const { error } = await supabase.storage.from(DOCUMENT_IMAGE_BUCKET).upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
      if (error) throw error;
      const { data, error: signedError } = await supabase.storage.from(DOCUMENT_IMAGE_BUCKET).createSignedUrl(path, 3600);
      if (signedError) throw signedError;
      formatDocument("insertHTML", `<figure><img src="${escapeHtml(data.signedUrl)}" data-storage-path="${escapeHtml(path)}" alt="${escapeHtml(file.name)}"><figcaption>${escapeHtml(file.name)}</figcaption></figure><p><br></p>`);
      setToast(tr("Image added to the document", "문서에 이미지를 추가했습니다"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not upload image", "이미지를 업로드하지 못했습니다"));
    } finally { setDocumentImageUploading(false); }
  }

  async function buildDocumentExport() {
    const content = await hydrateDocumentImages(documentEditorRef.current?.innerHTML ?? documentDraftContent);
    const parsed = new DOMParser().parseFromString(content, "text/html");
    const images = Array.from(parsed.querySelectorAll<HTMLImageElement>("img"));
    await Promise.all(images.map(async image => {
      if (!image.src) return;
      const response = await fetch(image.src);
      if (!response.ok) throw new Error(tr("An image could not be included", "이미지를 내보내기에 포함하지 못했습니다"));
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      image.src = dataUrl;
      image.removeAttribute("data-storage-path");
    }));
    const title = escapeHtml(documentDraftTitle.trim() || tr("Untitled document", "제목 없는 문서"));
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{max-width:760px;margin:48px auto;padding:0 28px;color:#302b35;font:16px/1.7 Georgia,serif}h1{font-size:34px}h2{font-size:26px}h3{font-size:20px}img{display:block;max-width:100%;height:auto;margin:auto;border-radius:8px}figure{margin:24px 0;padding:10px;border:1px solid #ddd;border-radius:10px}figcaption{text-align:center;color:#777;font:12px Arial,sans-serif;padding-top:8px}table{width:100%;border-collapse:collapse}th,td{padding:10px;border:1px solid #ccc;text-align:left}blockquote{padding:12px 18px;border-left:4px solid #7657ee;background:#f6f2ff}</style></head><body><article>${parsed.body.innerHTML}</article></body></html>`;
  }

  async function exportDocument(format: "doc" | "html") {
    setDocumentExportBusy(true);
    setDocumentExportOpen(false);
    try {
      const html = await buildDocumentExport();
      const filename = (documentDraftTitle.trim() || "Questdeck document").replace(/[\\/:*?"<>|]+/g, "-");
      const blob = new Blob([html], { type: format === "doc" ? "application/msword;charset=utf-8" : "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      setToast(tr("Document exported", "문서를 내보냈습니다"));
    } catch (error) { setToast(error instanceof Error ? error.message : tr("Could not export document", "문서를 내보내지 못했습니다")); }
    finally { setDocumentExportBusy(false); }
  }

  async function printDocument() {
    const printWindow = window.open("", "questdeck-document-print", "width=920,height=780");
    if (!printWindow) { setToast(tr("Allow pop-ups to print this document", "문서를 인쇄하려면 팝업을 허용하세요")); return; }
    setDocumentExportBusy(true);
    setDocumentExportOpen(false);
    printWindow.document.write(`<p style="font-family:sans-serif;padding:24px">${tr("Preparing document…", "문서를 준비하는 중…")}</p>`);
    try {
      const html = await buildDocumentExport();
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => printWindow.print(), 250);
    } catch (error) { printWindow.close(); setToast(error instanceof Error ? error.message : tr("Could not prepare document", "문서를 준비하지 못했습니다")); }
    finally { setDocumentExportBusy(false); }
  }

  async function addDocumentComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDocument || !session) return;
    const form = event.currentTarget;
    const body = String(new FormData(form).get("comment") ?? "").trim();
    if (!body) return;
    const { data, error } = await supabase.from("questdeck_document_comments").insert({ workspace_id: activeWorkspaceId, document_id: editingDocument.id, user_id: session.user.id, author_email: accountEmail ?? "", author_name: accountName, body }).select("id,document_id,user_id,author_email,author_name,body,created_at").single();
    if (error || !data) { setToast(error?.message ?? tr("Could not add comment", "댓글을 추가하지 못했습니다")); return; }
    setDocumentComments(current => [...current, mapDocumentComment(data)]);
    form.reset();
  }

  async function deleteDocumentComment(comment: DocumentComment) {
    if (!session || comment.userId !== session.user.id) return;
    const { error } = await supabase.from("questdeck_document_comments").delete().eq("workspace_id", activeWorkspaceId).eq("id", comment.id);
    if (error) { setToast(error.message); return; }
    setDocumentComments(current => current.filter(item => item.id !== comment.id));
  }

  async function setDocumentPublished(document: WorkspaceDocument, isPublished: boolean, copyLink = false) {
    const accessToken = requireSession();
    if (!accessToken) return;
    try {
      const liveContent = editingDocument?.id === document.id ? sanitizeRichText(documentEditorRef.current?.innerHTML ?? document.content) : document.content;
      const result = await syncQuestdeck<{ document: { id: number; title: string; content: string; created_by_email: string; owner_name: string; is_published: boolean; share_slug: string; created_at: string; updated_at: string } }>("update_document", { document: { ...document, content: liveContent, isPublished } }, accessToken);
      const saved = mapDocument(result.document);
      setDocuments(current => current.map(item => item.id === saved.id ? saved : item));
      setEditingDocument(current => current?.id === saved.id ? saved : current);
      if (copyLink && isPublished) { await navigator.clipboard.writeText(`${window.location.origin}/?document=${saved.shareSlug}`); setToast(tr("Share link copied", "공유 링크를 복사했습니다")); }
      else setToast(isPublished ? tr("Document published", "문서를 공개했습니다") : tr("Document is private again", "문서를 다시 비공개로 전환했습니다"));
    } catch (error) { setToast(error instanceof Error ? error.message : tr("Could not update sharing", "공유 설정을 변경하지 못했습니다")); }
  }

  async function deleteDocument(document: WorkspaceDocument) {
    if (!window.confirm(tr(`Delete “${document.title}”?`, `“${document.title}” 문서를 삭제할까요?`))) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    try {
      if (session) {
        const imagePaths = Array.from(document.content.matchAll(/data-storage-path=["']([^"']+)["']/g))
          .map(match => match[1])
          .filter(path => path.startsWith(`${session.user.id}/${document.id}/`));
        if (imagePaths.length) await supabase.storage.from(DOCUMENT_IMAGE_BUCKET).remove(imagePaths);
      }
      await syncQuestdeck("delete_document", { documentId: document.id }, accessToken);
      setDocuments(current => current.filter(item => item.id !== document.id));
      setToast(tr("Document deleted", "문서를 삭제했습니다"));
    }
    catch (error) { setToast(error instanceof Error ? error.message : tr("Could not delete document", "문서를 삭제하지 못했습니다")); }
  }

  function openMilestoneEditor(milestone: Milestone | null = null) {
    if (!session) { setAuthOpen(true); return; }
    setEditingMilestone(milestone);
    setMilestoneDraftDate(milestone?.milestoneDate ?? new Date().toISOString().slice(0, 10));
    setMilestoneEditorOpen(true);
  }

  function calculateMilestoneStats(targetDate: string) {
    const activeNames = new Set(projects.filter(item => item.status !== "Archived").map(item => item.name));
    const active = cards.filter(card => activeNames.has(card.project) && !card.archived);
    const tracked = targetDate ? active.filter(card => Boolean(card.dueDate) && card.dueDate! <= targetDate) : [];
    const completedCards = tracked.filter(card => card.status === "Done").length;
    const totalCards = tracked.length;
    return {
      progress: totalCards ? Math.round((completedCards / totalCards) * 100) : 0,
      completedCards,
      totalCards,
      unscheduledCards: active.filter(card => !card.dueDate).length,
    };
  }

  async function syncMilestoneProgress(force = false) {
    const accessToken = session?.access_token;
    if (!accessToken || workspaceAccess !== "allowed" || milestones.length === 0) return;

    const recalculated = milestones.map(milestone => {
      const { progress, completedCards, totalCards } = calculateMilestoneStats(milestone.milestoneDate);
      return { ...milestone, progress, completedCards, totalCards };
    });
    const changed = recalculated.filter((milestone, index) => {
      const current = milestones[index];
      return milestone.progress !== current.progress || milestone.completedCards !== current.completedCards || milestone.totalCards !== current.totalCards;
    });
    const syncTargets = force ? recalculated : changed;

    if (changed.length > 0) {
      const updates = new Map(changed.map(milestone => [milestone.id, milestone]));
      setMilestones(current => current.map(milestone => updates.get(milestone.id) ?? milestone));
    }
    if (syncTargets.length === 0) {
      setMilestoneSyncState("synced");
      return;
    }

    const requestId = ++milestoneSyncRequest.current;
    setMilestoneSyncState("syncing");
    try {
      await Promise.all(syncTargets.map(milestone => syncQuestdeck("update_milestone", { milestone }, accessToken)));
      if (milestoneSyncRequest.current === requestId) setMilestoneSyncState("synced");
    } catch {
      if (milestoneSyncRequest.current === requestId) setMilestoneSyncState("error");
    }
  }

  const milestoneDefinitionSignature = milestones.map(milestone => `${milestone.id}:${milestone.milestoneDate}:${milestone.title}:${milestone.stage}`).join("|");

  useEffect(() => {
    if (!session?.access_token || workspaceAccess !== "allowed" || milestones.length === 0) return;
    const timer = window.setTimeout(() => void syncMilestoneProgress(), 500);
    return () => window.clearTimeout(timer);
  }, [cards, projects, milestoneDefinitionSignature, session?.access_token, workspaceAccess]);

  async function saveMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = requireSession();
    if (!accessToken) return;
    const data = new FormData(event.currentTarget);
    const milestoneDate = String(data.get("milestoneDate"));
    const automaticStats = calculateMilestoneStats(milestoneDate);
    const milestone = {
      ...(editingMilestone ? { id: editingMilestone.id } : {}),
      title: String(data.get("title")).trim(),
      milestoneDate,
      progress: automaticStats.progress,
      completedCards: automaticStats.completedCards,
      totalCards: automaticStats.totalCards,
      note: String(data.get("note")).trim(),
      color: String(data.get("color")) as Milestone["color"],
      stage: String(data.get("stage")).trim(),
    };
    try {
      const result = await syncQuestdeck<{ milestone: SupabaseMilestone }>(editingMilestone ? "update_milestone" : "create_milestone", { milestone }, accessToken);
      const saved: Milestone = { id: result.milestone.id, title: result.milestone.title, milestoneDate: result.milestone.milestone_date, progress: result.milestone.progress, completedCards: result.milestone.completed_cards, totalCards: result.milestone.total_cards, note: result.milestone.note, color: result.milestone.color, stage: result.milestone.stage };
      setMilestones(current => editingMilestone ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved]);
      setMilestoneEditorOpen(false);
      setEditingMilestone(null);
      void loadWorkspaceFeed(accessToken).catch(() => undefined);
      setToast(editingMilestone ? tr("Milestone updated", "마일스톤을 수정했습니다") : tr("Milestone created", "마일스톤을 만들었습니다"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not save milestone", "마일스톤을 저장하지 못했습니다"));
    }
  }

  async function deleteMilestone(milestone: Milestone) {
    if (!window.confirm(tr(`Permanently delete “${milestone.title}”?`, `“${milestone.title}” 마일스톤을 영구 삭제할까요?`))) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    try {
      await syncQuestdeck("delete_milestone", { milestoneId: milestone.id }, accessToken);
      setMilestones(current => current.filter(item => item.id !== milestone.id));
      setMilestoneEditorOpen(false);
      setEditingMilestone(null);
      void loadWorkspaceFeed(accessToken).catch(() => undefined);
      setToast(tr("Milestone deleted", "마일스톤을 삭제했습니다"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : tr("Could not delete milestone", "마일스톤을 삭제하지 못했습니다"));
    }
  }

  async function saveAccountName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) { setNameEditorOpen(false); setAuthOpen(true); return; }
    const name = String(new FormData(event.currentTarget).get("displayName") ?? "").trim().slice(0, 80);
    if (!name) { setToast(tr("Enter a name", "이름을 입력하세요")); return; }
    const { data, error } = await supabase.auth.updateUser({ data: { ...session.user.user_metadata, full_name: name, name } });
    if (error || !data.user) { setToast(error?.message ?? tr("Could not update name", "이름을 수정하지 못했습니다")); return; }
    setSession(current => current ? { ...current, user: data.user } : current);
    setAccount(current => ({ displayName: name, fullName: name, email: current?.email ?? session.user.email ?? "" }));
    setMembers(current => current.map(member => member.email.toLowerCase() === session.user.email?.toLowerCase() ? { ...member, name, initials: name.split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase() } : member));
    setNameEditorOpen(false);
    setProfileMenuOpen(false);
    setToast(tr("Name updated everywhere", "이름이 모든 화면에 반영되었습니다"));
  }

  const accountEmail = session?.user.email ?? account?.email ?? null;
  const sessionProfile = session?.user.user_metadata as Record<string, unknown> | undefined;
  const sessionName = [sessionProfile?.full_name, sessionProfile?.name, sessionProfile?.user_name, sessionProfile?.preferred_username].find(value => typeof value === "string" && value.trim()) as string | undefined;
  const accountName = sessionName?.trim() ?? account?.fullName ?? account?.displayName ?? accountEmail?.split("@")[0] ?? "Guest";
  const accountInitials = accountName.split(/\s+|@/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const activeWorkspace = workspaces.find(workspace => workspace.id === activeWorkspaceId && workspace.status === "Active") ?? workspaces.find(workspace => workspace.status === "Active") ?? initialWorkspaces[0];
  const activeProjects = projects.filter(item => item.status !== "Archived");
  const activeProjectNames = new Set(activeProjects.map(item => item.name));
  const activeCards = cards.filter(card => activeProjectNames.has(card.project) && !card.archived);
  const archivedCards = cards.filter(card => activeProjectNames.has(card.project) && card.archived).sort((a, b) => b.id - a.id);
  const activeOpenCards = activeCards.filter(card => card.status !== "Done");
  const activeOverdueCards = activeOpenCards.filter(card => card.dueDate && new Date(`${card.dueDate}T23:59:59`) < new Date());
  const activeAttentionCards = activeOpenCards.filter(card => card.priority >= 8 || activeOverdueCards.some(overdue => overdue.id === card.id));
  const overviewActionCards = activeCards.filter(card => card.status === "Ready" || card.status === "In progress");
  const overviewToday = startOfDay(new Date());
  const overviewWeekEnd = addDays(overviewToday, 7);
  const overviewUpcomingCards = overviewActionCards.filter(card => card.dueDate && new Date(`${card.dueDate}T12:00:00`) >= overviewToday && new Date(`${card.dueDate}T12:00:00`) <= overviewWeekEnd).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || b.priority - a.priority).slice(0, 4);
  const overviewUrgentCards = overviewActionCards.filter(card => card.priority >= 8 || (card.dueDate && new Date(`${card.dueDate}T23:59:59`) < new Date())).sort((a, b) => Number(cardDueTone(a) !== "due-overdue") - Number(cardDueTone(b) !== "due-overdue") || b.priority - a.priority || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")).slice(0, 4);
  const recentPulseEvents = [...activityEvents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3);
  const regularDocuments = documents.filter(document => !isMindmapDocument(document) && !isFlowchartDocument(document) && !isSpreadsheetDocument(document));
  const mindmapDocuments = documents.filter(isMindmapDocument).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const activeMindmapDocument = mindmapDocuments.find(document => document.id === activeMindmapDocumentId) ?? null;
  const selectedMindmapNode = mindmapNodes.find(node => node.id === selectedMindmapNodeId) ?? null;
  const sortedMilestones = milestones.map(item => ({ ...item, ...calculateMilestoneStats(item.milestoneDate) })).sort((a, b) => a.milestoneDate.localeCompare(b.milestoneDate));
  const milestoneDraftStats = calculateMilestoneStats(milestoneDraftDate);
  const milestoneToday = startOfDay(new Date());
  const nextMilestone = sortedMilestones.find(item => new Date(`${item.milestoneDate}T12:00:00`) >= milestoneToday && item.progress < 100) ?? sortedMilestones.find(item => item.progress < 100) ?? sortedMilestones[0];
  const overdueMilestones = sortedMilestones.filter(item => item.progress < 100 && new Date(`${item.milestoneDate}T23:59:59`) < milestoneToday);
  const completedMilestones = sortedMilestones.filter(item => item.progress >= 100);
  const defaultProjectName = activeProjects.find(item => item.id === defaultProjectId)?.name ?? activeProjects[0]?.name ?? "";
  const currentMember = members.find(member => member.email.toLowerCase() === accountEmail?.toLowerCase() && member.workspaceIds.includes(activeWorkspaceId)) ?? members.find(member => member.role === "Owner" && member.workspaceIds.includes(activeWorkspaceId));

  function hideCardHoverPreview() {
    if (cardHoverTimer.current !== null) window.clearTimeout(cardHoverTimer.current);
    cardHoverTimer.current = null;
    setCardHoverPreview(null);
  }

  function scheduleCardHoverPreview(card: Card, element: HTMLButtonElement, todoSummary?: { completed: number; total: number }) {
    if (draggedBoardCard) return;
    if (cardHoverTimer.current !== null) window.clearTimeout(cardHoverTimer.current);
    setCardHoverPreview(null);
    const rect = element.getBoundingClientRect();
    const previewWidth = 320;
    const previewHeight = 350;
    const gap = 12;
    let left = rect.right + gap;
    if (left + previewWidth > window.innerWidth - gap) left = rect.left - previewWidth - gap;
    left = Math.max(gap, Math.min(left, window.innerWidth - previewWidth - gap));
    const top = Math.max(gap, Math.min(rect.top, window.innerHeight - previewHeight - gap));
    cardHoverTimer.current = window.setTimeout(() => {
      setCardHoverPreview({ card, left, top, completed: todoSummary?.completed ?? 0, total: todoSummary?.total ?? 0 });
      cardHoverTimer.current = null;
    }, 900);
  }
  const unreadCount = notifications.filter(notification => !notification.read).length;
  const visibleNotifications = notifications.filter(notification => notificationFilter === "All" || !notification.read);
  const visibleProjects = projects.filter(item => (projectStatusFilter === "All" || item.status === projectStatusFilter) && `${item.name} ${item.owner}`.toLowerCase().includes(projectSearch.toLowerCase()));
  const visibleMembers = members.filter(member => memberRoleFilter === "All" || member.role === memberRoleFilter);
  const visibleActivity = activityEvents.filter(item => activityFilter === "All activity" || item.type === activityFilter);
  const weekStart = Date.now() - 7 * dayMs;
  const weeklyActivity = activityEvents.filter(item => new Date(item.createdAt).getTime() >= weekStart);
  const weeklyCardUpdates = weeklyActivity.filter(item => item.type === "Cards").length;
  const weeklyCompleted = weeklyActivity.filter(item => /completed|done/i.test(`${item.action} ${item.detail}`)).length;
  const weeklyMilestones = weeklyActivity.filter(item => item.type === "Milestones").length;
  const contributorCounts = Array.from(weeklyActivity.reduce<Map<string, { person: string; initials: string; count: number }>>((all, item) => {
    const current = all.get(item.person) ?? { person: item.person, initials: item.initials, count: 0 };
    current.count += 1;
    all.set(item.person, current);
    return all;
  }, new Map()).values()).sort((a, b) => b.count - a.count).slice(0, 3);
  const tr = (english: string, korean: string) => language === "ko" ? korean : english;
  const statusLabel = (status: Status | Project["status"]) => ({ Ready: tr("Ready", "준비"), "In progress": tr("In progress", "진행 중"), Review: tr("Review", "검토"), Done: tr("Done", "완료"), Active: tr("Active", "활성"), "On hold": tr("On hold", "보류"), Archived: tr("Archived", "보관됨") }[status]);
  const selectedRawTodos = selected ? (subTodos[selected.id] ?? []) : [];
  const selectedTodos = visibleSubTodos(selectedRawTodos);
  const completedSubTodos = selectedTodos.filter(todo => todo.done).length;
  const selectedHeroIds = selected ? heroChildIds(selectedRawTodos) : [];
  const selectedHeroChildren = cards.filter(card => selectedHeroIds.includes(card.id));
  const selectedHeroCompleted = selectedHeroChildren.filter(card => card.status === "Done").length;
  const selectedHeroParent = selected ? cards.find(card => heroChildIds(subTodos[card.id] ?? []).includes(selected.id)) ?? null : null;
  const heroCandidateCards = selected ? cards.filter(card => card.id !== selected.id && !card.archived && !selectedHeroIds.includes(card.id) && !cards.some(parent => heroChildIds(subTodos[parent.id] ?? []).includes(card.id))) : [];
  const cardTodoSummary = (card: Card) => {
    const items = subTodos[card.id] ?? [];
    const todos = visibleSubTodos(items);
    const childIds = heroChildIds(items);
    const heroChildren = cards.filter(item => childIds.includes(item.id));
    const parentHero = cards.find(item => heroChildIds(subTodos[item.id] ?? []).includes(card.id));
    return { completed: todos.filter(todo => todo.done).length, total: todos.length, isHero: hasHeroMarker(items), heroChildren: heroChildren.length, heroCompleted: heroChildren.filter(item => item.status === "Done").length, parentHero: Boolean(parentHero), parentHeroTitle: parentHero?.title };
  };
  const toggleHeroTree = (heroId: number) => setCollapsedHeroIds(current => {
    const next = new Set(current);
    next.has(heroId) ? next.delete(heroId) : next.add(heroId);
    return next;
  });
  const boardCardsForStatus = (status: Status) => {
    const statusCards = filtered.filter(card => card.status === status);
    const availableIds = new Set(statusCards.map(card => card.id));
    const parentByChild = new Map<number, number>();
    cards.forEach(parent => heroChildIds(subTodos[parent.id] ?? []).forEach(childId => parentByChild.set(childId, parent.id)));
    const ordered: Card[] = [];
    const added = new Set<number>();
    statusCards.filter(card => !parentByChild.has(card.id)).forEach(card => {
      ordered.push(card); added.add(card.id);
      if (!collapsedHeroIds.has(card.id)) heroChildIds(subTodos[card.id] ?? []).forEach(childId => {
        const child = statusCards.find(item => item.id === childId);
        if (child && availableIds.has(child.id) && !added.has(child.id)) { ordered.push(child); added.add(child.id); }
      });
    });
    statusCards.forEach(card => {
      if (added.has(card.id)) return;
      const parentId = parentByChild.get(card.id);
      if (!parentId || !collapsedHeroIds.has(parentId)) ordered.push(card);
    });
    return ordered;
  };
  const activeCardOwners = members.filter(member => member.status === "Active" && member.workspaceIds.includes(activeWorkspaceId));
  const selectedOwner = selected ? members.find(member => member.initials === selected.owner) : null;
  const selectedCollaborators = selected ? (selected.collaborators ?? []).map(initials => ({ initials, member: members.find(member => member.initials === initials) })) : [];
  const timelineDayCount = timelineScale === "2 weeks" ? 14 : timelineScale === "Month" ? 28 : 84;
  const timelineDates = useMemo(() => Array.from({ length: timelineDayCount }, (_, index) => addDays(timelineStart, index)), [timelineDayCount, timelineStart]);
  const timelineEnd = timelineDates[timelineDates.length - 1];
  const timelineMonthLabel = timelineStart.getMonth() === timelineEnd.getMonth()
    ? timelineStart.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US", { month: "long", year: "numeric" })
    : `${timelineStart.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US", { month: "short" })} – ${timelineEnd.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US", { month: "short", year: "numeric" })}`;
  const timelineHeroRelations = useMemo(() => {
    const childrenByHero = new Map<number, Card[]>();
    const parentByChild = new Map<number, { hero: Card; index: number; total: number }>();
    cards.forEach(hero => {
      const children = heroChildIds(subTodos[hero.id] ?? []).map(childId => cards.find(card => card.id === childId)).filter((card): card is Card => Boolean(card));
      if (hasHeroMarker(subTodos[hero.id] ?? []) || children.length) childrenByHero.set(hero.id, children);
      children.forEach((child, index) => parentByChild.set(child.id, { hero, index, total: children.length }));
    });
    return { childrenByHero, parentByChild };
  }, [cards, subTodos]);
  const timelineCards = useMemo(() => {
    const activeNames = new Set(activeProjects.map(item => item.name));
    const statusOrder: Record<Status, number> = { Ready: 0, "In progress": 1, Review: 2, Done: 3 };
    return cards
      .filter(card => activeNames.has(card.project) && !card.archived && (project === "All projects" || card.project === project))
      .map(card => { const endDate = card.dueDate ? new Date(`${card.dueDate}T12:00:00`) : cardDueDate(card.due); const startDate = card.startDate ? new Date(`${card.startDate}T12:00:00`) : endDate; return { card, startDate, endDate }; })
      .filter((item): item is { card: Card; startDate: Date; endDate: Date } => Boolean(item.startDate && item.endDate))
      .filter(item => item.endDate >= timelineStart && item.startDate <= timelineEnd)
      .sort((a, b) => {
        if (timelineSort === "Status") return statusOrder[a.card.status] - statusOrder[b.card.status] || a.endDate.getTime() - b.endDate.getTime();
        if (timelineSort === "Owner") return a.card.owner.localeCompare(b.card.owner) || a.endDate.getTime() - b.endDate.getTime();
        if (timelineSort === "Name") return a.card.title.localeCompare(b.card.title);
        return a.endDate.getTime() - b.endDate.getTime() || a.card.title.localeCompare(b.card.title);
      });
  }, [activeProjects, cards, project, timelineEnd, timelineSort, timelineStart]);
  const timelineGroups = useMemo(() => {
    const groups = new Map<string, typeof timelineCards>();
    timelineCards.forEach(item => groups.set(item.card.tag, [...(groups.get(item.card.tag) ?? []), item]));
    return Array.from(groups, ([discipline, items]) => ({ discipline, items }));
  }, [timelineCards]);

  function setActiveTimelineGesture(gesture: TimelineGesture | null) {
    timelineGestureRef.current = gesture;
    setTimelineGesture(gesture);
  }

  function beginTimelinePan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest(".run-bar,button,input,select,a")) return;
    const dateGrid = event.currentTarget.querySelector<HTMLElement>(".date-grid");
    if (!dateGrid) return;
    const dayWidth = Math.max(1, (dateGrid.scrollWidth - 210) / timelineDayCount);
    event.currentTarget.setPointerCapture(event.pointerId);
    timelinePanRef.current = { pointerId: event.pointerId, lastClientX: event.clientX, dayWidth };
    setTimelinePanning(true);
    setTimelineHover(null);
  }

  function updateTimelinePan(event: React.PointerEvent<HTMLDivElement>) {
    const pan = timelinePanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    const delta = event.clientX - pan.lastClientX;
    const days = Math.trunc(delta / pan.dayWidth);
    if (!days) return;
    setTimelineStart(current => addDays(current, -days));
    timelinePanRef.current = { ...pan, lastClientX: pan.lastClientX + days * pan.dayWidth };
  }

  function finishTimelinePan(event: React.PointerEvent<HTMLDivElement>) {
    const pan = timelinePanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    timelinePanRef.current = null;
    setTimelinePanning(false);
  }

  function beginTimelineGesture(event: React.PointerEvent<HTMLElement>, cardId: number, mode: TimelineGesture["mode"], startDate: Date, endDate: Date) {
    if (event.button !== 0) return;
    const track = event.currentTarget.closest(".lane-track");
    if (!track) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const normalizedStart = startOfDay(startDate);
    const normalizedEnd = startOfDay(endDate);
    timelineDidDrag.current = false;
    setTimelineHover(null);
    setDraggedTimelineCard(cardId);
    setActiveTimelineGesture({ cardId, mode, pointerId: event.pointerId, startClientX: event.clientX, dayWidth: track.getBoundingClientRect().width / timelineDayCount, originStart: normalizedStart, originEnd: normalizedEnd, currentStart: normalizedStart, currentEnd: normalizedEnd });
  }

  function updateTimelineGesture(event: React.PointerEvent<HTMLElement>) {
    const gesture = timelineGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const rawDelta = (event.clientX - gesture.startClientX) / gesture.dayWidth;
    if (Math.abs(rawDelta) > .18) timelineDidDrag.current = true;
    const deltaDays = Math.round(rawDelta);
    let currentStart = gesture.originStart;
    let currentEnd = gesture.originEnd;
    if (gesture.mode === "move") {
      const duration = Math.max(0, Math.round((gesture.originEnd.getTime() - gesture.originStart.getTime()) / dayMs));
      const earliestDelta = Math.round((timelineStart.getTime() - gesture.originStart.getTime()) / dayMs);
      const latestDelta = Math.round((addDays(timelineEnd, -duration).getTime() - gesture.originStart.getTime()) / dayMs);
      const safeDelta = Math.max(earliestDelta, Math.min(latestDelta, deltaDays));
      currentStart = addDays(gesture.originStart, safeDelta);
      currentEnd = addDays(gesture.originEnd, safeDelta);
    } else if (gesture.mode === "start") {
      const candidate = addDays(gesture.originStart, deltaDays);
      currentStart = candidate < timelineStart ? timelineStart : candidate > gesture.originEnd ? gesture.originEnd : candidate;
    } else {
      const candidate = addDays(gesture.originEnd, deltaDays);
      currentEnd = candidate > timelineEnd ? timelineEnd : candidate < gesture.originStart ? gesture.originStart : candidate;
    }
    setActiveTimelineGesture({ ...gesture, currentStart, currentEnd });
  }

  async function finishTimelineGesture(event: React.PointerEvent<HTMLElement>) {
    const gesture = timelineGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setActiveTimelineGesture(null);
    setDraggedTimelineCard(null);
    const changed = gesture.currentStart.getTime() !== gesture.originStart.getTime() || gesture.currentEnd.getTime() !== gesture.originEnd.getTime();
    if (!changed) return;
    const accessToken = requireSession();
    if (!accessToken) return;
    const previous = cards.find(card => card.id === gesture.cardId);
    if (!previous) return;
    const toInputDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    const updated = { ...previous, startDate: toInputDate(gesture.currentStart), dueDate: toInputDate(gesture.currentEnd), due: timelineDateLabel(gesture.currentEnd) };
    setCards(current => current.map(card => card.id === updated.id ? updated : card));
    setSelected(current => current?.id === updated.id ? updated : current);
    try {
      await syncQuestdeck("update_card", { card: updated }, accessToken);
      setToast(gesture.mode === "move" ? tr(`${updated.title} moved to ${updated.due}`, `${updated.title} 카드를 ${updated.due}(으)로 이동했습니다`) : gesture.mode === "start" ? tr(`Start date moved to ${timelineDateLabel(gesture.currentStart)}`, `시작일을 ${timelineDateLabel(gesture.currentStart)}(으)로 변경했습니다`) : tr(`Due date moved to ${timelineDateLabel(gesture.currentEnd)}`, `마감일을 ${timelineDateLabel(gesture.currentEnd)}(으)로 변경했습니다`));
    } catch (error) {
      setCards(current => current.map(card => card.id === previous.id ? previous : card));
      setSelected(current => current?.id === previous.id ? previous : current);
      setToast(error instanceof Error ? error.message : tr("Could not update timeline dates", "타임라인 날짜를 변경하지 못했습니다"));
    }
  }

  function cancelTimelineGesture(event?: React.PointerEvent<HTMLElement>) {
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setActiveTimelineGesture(null);
    setDraggedTimelineCard(null);
  }

  async function moveTimelineCard(cardId: number, date: Date) {
    const accessToken = requireSession();
    if (!accessToken) return;
    const previous = cards.find(card => card.id === cardId);
    if (!previous) return;
    const previousStart = previous.startDate ? new Date(`${previous.startDate}T12:00:00`) : previous.dueDate ? new Date(`${previous.dueDate}T12:00:00`) : date;
    const previousEnd = previous.dueDate ? new Date(`${previous.dueDate}T12:00:00`) : previousStart;
    const duration = Math.max(0, Math.round((previousEnd.getTime() - previousStart.getTime()) / dayMs));
    const movedEnd = addDays(date, duration);
    const startDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const dueDate = `${movedEnd.getFullYear()}-${String(movedEnd.getMonth() + 1).padStart(2, "0")}-${String(movedEnd.getDate()).padStart(2, "0")}`;
    const updated = { ...previous, startDate, due: timelineDateLabel(movedEnd), dueDate };
    setCards(current => current.map(card => card.id === cardId ? updated : card));
    setSelected(current => current?.id === cardId ? updated : current);
    setDraggedTimelineCard(null);
    try {
      await syncQuestdeck("update_card", { card: updated }, accessToken);
      setToast(tr(`${updated.title} moved to ${updated.due}`, `${updated.title} 카드를 ${updated.due}(으)로 이동했습니다`));
    } catch (error) {
      setCards(current => current.map(card => card.id === cardId ? previous : card));
      setSelected(current => current?.id === cardId ? previous : current);
      setToast(error instanceof Error ? error.message : tr("Could not move card", "카드를 이동하지 못했습니다"));
    }
  }

  async function resizeTimelineCard(cardId: number, edge: "start" | "end", date: Date) {
    const accessToken = requireSession();
    if (!accessToken) return;
    const previous = cards.find(card => card.id === cardId);
    if (!previous) return;
    const previousEnd = previous.dueDate ? new Date(`${previous.dueDate}T12:00:00`) : cardDueDate(previous.due);
    if (!previousEnd) return;
    const previousStart = previous.startDate ? new Date(`${previous.startDate}T12:00:00`) : previousEnd;
    const nextStart = edge === "start" ? (date > previousEnd ? previousEnd : date) : previousStart;
    const nextEnd = edge === "end" ? (date < previousStart ? previousStart : date) : previousEnd;
    const toInputDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    const updated = { ...previous, startDate: toInputDate(nextStart), dueDate: toInputDate(nextEnd), due: timelineDateLabel(nextEnd) };
    setCards(current => current.map(card => card.id === cardId ? updated : card));
    setSelected(current => current?.id === cardId ? updated : current);
    setDraggedTimelineCard(null);
    try {
      await syncQuestdeck("update_card", { card: updated }, accessToken);
      setToast(edge === "start" ? tr(`Start date moved to ${timelineDateLabel(nextStart)}`, `시작일을 ${timelineDateLabel(nextStart)}(으)로 변경했습니다`) : tr(`Due date moved to ${timelineDateLabel(nextEnd)}`, `마감일을 ${timelineDateLabel(nextEnd)}(으)로 변경했습니다`));
    } catch (error) {
      setCards(current => current.map(card => card.id === cardId ? previous : card));
      setSelected(current => current?.id === cardId ? previous : current);
      setToast(error instanceof Error ? error.message : tr("Could not resize timeline card", "타임라인 기간을 변경하지 못했습니다"));
    }
  }

  function showTimelineTooltip(cardId: number, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const tooltipWidth = 290;
    const tooltipHeight = 220;
    const left = Math.max(16, Math.min(window.innerWidth - tooltipWidth - 16, rect.left + rect.width / 2 - tooltipWidth / 2));
    const top = rect.bottom + tooltipHeight + 16 <= window.innerHeight ? rect.bottom + 10 : Math.max(16, rect.top - tooltipHeight - 10);
    setTimelineHover({ cardId, left, top });
  }

  if (!authReady || (session && workspaceAccess === "checking")) return <main className="private-auth-page"><section className="private-auth-card private-auth-loading"><span className="brand-mark">Q</span><div className="private-auth-spinner" /><p>{tr("Checking secure workspace access…", "안전한 워크스페이스 접근 권한을 확인하는 중…")}</p></section></main>;

  if (!session) return <main className="private-auth-page">
    <section className="private-auth-card">
      <header><span className="brand-mark">Q</span><b>Questdeck</b><select value={language} onChange={event => setLanguage(event.target.value as "en" | "ko")} aria-label="Language"><option value="en">EN</option><option value="ko">한국어</option></select></header>
      <div className="private-auth-hero"><small>{tr("PRIVATE WORKSPACE", "비공개 워크스페이스")}</small><h1>{authMode === "signin" ? tr("Sign in to continue", "계속하려면 로그인하세요") : tr("Activate your invited account", "초대받은 계정 활성화")}</h1><p>{tr("Questdeck content is available only to invited workspace members and owners.", "Questdeck 콘텐츠는 초대된 워크스페이스 멤버와 소유자만 볼 수 있습니다.")}</p></div>
      <button className="github-auth-button" type="button" onClick={() => void handleGitHubSignIn()} disabled={authBusy}><span aria-hidden="true">GH</span>{tr("Continue with GitHub", "GitHub로 계속하기")}</button>
      <div className="auth-divider"><span>{tr("or use email", "또는 이메일 사용")}</span></div>
      <form onSubmit={handleAuth}><label>{tr("Email", "이메일")}<input name="email" type="email" required autoFocus autoComplete="email" placeholder="you@example.com" /></label><label>{tr("Password", "비밀번호")}<input name="password" type="password" minLength={8} required autoComplete={authMode === "signin" ? "current-password" : "new-password"} placeholder={tr("At least 8 characters", "8자 이상")} /></label>{authMessage && <p className="auth-message">{authMessage}</p>}<button className="create-button private-auth-submit" type="submit" disabled={authBusy}>{authBusy ? tr("Please wait…", "잠시만 기다려주세요…") : authMode === "signin" ? tr("Sign in", "로그인") : tr("Create invited account", "초대 계정 만들기")}</button><button className="private-auth-mode" type="button" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthMessage(""); }}>{authMode === "signin" ? tr("Invited for the first time? Create your account", "처음 초대받으셨나요? 계정을 만드세요") : tr("I already have an account", "이미 계정이 있어요")}</button></form>
    </section>
  </main>;

  if (workspaceAccess === "admin") return <PlatformAdmin session={session} embedded={false} language={language} onToast={setToast} onSignOut={() => void supabase.auth.signOut()} />;

  if (workspaceAccess === "waiting") return <WaitingRoom session={session} language={language} pendingRequestCount={pendingRequestCount} onSignOut={() => void supabase.auth.signOut()} />;

  if (workspaceAccess === "denied") return <main className="private-auth-page"><section className="private-auth-card private-access-denied"><header><span className="brand-mark">Q</span><b>Questdeck</b></header><span className="private-lock">⌾</span><small>{tr("ACCESS RESTRICTED", "접근 제한")}</small><h1>{tr("This account is not a workspace member", "이 계정은 워크스페이스 멤버가 아닙니다")}</h1><p>{session.user.email}</p><p>{tr("Ask a workspace owner to add this email as an active member.", "워크스페이스 소유자에게 이 이메일을 활성 멤버로 추가해 달라고 요청하세요.")}</p><button className="secondary-button" onClick={() => void supabase.auth.signOut()}>{tr("Sign out", "로그아웃")}</button></section></main>;

  if (publicDocumentLoading) return <main className="shared-document-page"><section className="shared-document"><span className="brand-mark">Q</span><p>{tr("Loading shared document…", "공유 문서를 불러오는 중…")}</p></section></main>;
  if (publicDocument) return <main className="shared-document-page"><article className="shared-document"><header><button className="shared-brand" onClick={() => { window.history.replaceState({}, "", "/"); setPublicDocument(null); }}><span className="brand-mark">Q</span><b>Questdeck</b></button><span>{tr("Shared document", "공유 문서")}</span></header><small>{tr("DOCUMENT", "문서")}</small><h1>{publicDocument.title}</h1><div className="shared-document-meta">{tr("By", "작성자")} {publicDocument.ownerName || publicDocument.createdByEmail} · {new Date(publicDocument.updatedAt).toLocaleDateString(language === "ko" ? "ko-KR" : "en-US")}</div><div className="shared-document-body rich-document-content" dangerouslySetInnerHTML={{ __html: sanitizeRichText(publicDocument.content) }} /></article></main>;

  return <main className="app-shell">
    <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
      <div className="brand"><button className="brand-home" onClick={() => { setView("overview"); setMobileNavOpen(false); setWorkspaceOpen(false); }} aria-label={tr("Go to Questdeck overview", "Questdeck 개요로 이동")}><span className="brand-mark">Q</span><span>Questdeck</span></button><button className="sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">×</button></div>
      <div className="workspace-wrap"><button className={`workspace ${workspaceOpen ? "open" : ""}`} onClick={() => setWorkspaceOpen(open => !open)}><span className="workspace-icon">{activeWorkspace.initials}</span><span><small>{tr("WORKSPACE", "워크스페이스")}</small>{activeWorkspace.name}</span><b>⌄</b></button>{workspaceOpen && <div className="workspace-menu"><header><span>{tr("Your workspaces", "내 워크스페이스")}</span><button onClick={() => setWorkspaceOpen(false)}>×</button></header>{workspaces.filter(workspace => workspace.status === "Active").map(workspace => <button className={`workspace-option ${workspace.id === activeWorkspaceId ? "active" : ""}`} key={workspace.id} onClick={() => switchWorkspace(workspace)}><span>{workspace.initials}</span><div><b>{workspace.name}</b><small>{workspace.members} {tr("members", "명")}</small></div>{workspace.id === activeWorkspaceId && <i>✓</i>}</button>)}{isWorkspaceOwner && <footer><button onClick={() => { setCreateWorkspaceOpen(true); setWorkspaceOpen(false); }}>＋ {tr("Create workspace", "워크스페이스 만들기")}</button><button onClick={() => { setView("management"); setWorkspaceOpen(false); }}>⚙ {tr("Manage workspaces", "워크스페이스 관리")}</button></footer>}</div>}</div>
      <nav>
        <p className="nav-label">{tr("PLAN", "계획")}</p>
        <button className={`nav-item ${view === "overview" ? "active" : ""}`} onClick={() => setView("overview")}><span>⌂</span> {tr("Overview", "개요")}</button>
        <button className={`nav-item ${view === "quests" ? "active" : ""}`} onClick={() => setView("quests")}><span>▤</span> {tr("Production board", "프로덕션 보드")} <i>{activeOpenCards.length}</i></button>
        <button className={`nav-item ${view === "timeline" ? "active" : ""}`} onClick={() => setView("timeline")}><span>↔</span> {tr("Timeline", "타임라인")}</button>
        <button className={`nav-item ${view === "mindmap" ? "active" : ""}`} onClick={() => setView("mindmap")}><span>⌘</span> {tr("Mindmap", "마인드맵")}</button>
        <button className={`nav-item ${view === "flowchart" ? "active" : ""}`} onClick={() => setView("flowchart")}><span>⇢</span> {tr("Flowchart", "플로차트")}</button>
        <button className={`nav-item ${view === "spreadsheet" ? "active" : ""}`} onClick={() => setView("spreadsheet")}><span>▦</span> {tr("Spreadsheet", "스프레드시트")}</button>
        <button className={`nav-item ${view === "documents" ? "active" : ""}`} onClick={() => setView("documents")}><span>▧</span> {tr("Documents", "문서")} <i>{regularDocuments.length}</i></button>
        <button className={`nav-item ${view === "milestones" ? "active" : ""}`} onClick={() => setView("milestones")}><span>◎</span> {tr("Milestones", "마일스톤")}</button>
        <p className="nav-label">{tr("MANAGE", "관리")}</p>
        <button className={`nav-item ${view === "management" ? "active" : ""}`} onClick={() => setView("management")}><span>⚙</span> {tr("Workspace", "워크스페이스")}</button>
        <button className={`nav-item ${view === "projects-management" ? "active" : ""}`} onClick={() => setView("projects-management")}><span>▦</span> {tr("Projects", "프로젝트")}</button>
        <button className={`nav-item ${view === "roles" ? "active" : ""}`} onClick={() => setView("roles")}><span>♙</span> {tr("Roles & access", "역할 및 권한")}</button>
        {isWorkspaceOwner && <button className={`nav-item ${view === "waiting-list" ? "active" : ""}`} onClick={() => setView("waiting-list")}><span>◷</span> {tr("Member waiting list", "멤버 대기 명단")}</button>}
        {isPlatformAdmin && <button className={`nav-item ${view === "platform-admin" ? "active" : ""}`} onClick={() => setView("platform-admin")}><span>⌾</span> {tr("Owner administration", "소유자 관리")}</button>}
        <button className={`nav-item ${view === "account" ? "active" : ""}`} onClick={() => setView("account")}><span>◉</span> {tr("My account", "내 계정")}</button>
        <p className="nav-label">{tr("PROJECTS", "프로젝트")}</p>
        {projects.filter(item => item.status !== "Archived").map(item => <button className="nav-item" key={item.id} onClick={() => { setProject(item.name); setView("quests"); }}><span className={`dot ${item.color}`} /> {item.name}<i>{item.count}</i></button>)}
      </nav>
      <div className="sidebar-bottom"><button className="nav-item"><span>?</span> {tr("Help & shortcuts", "도움말 및 단축키")}</button><div className="profile-menu-wrap">{profileMenuOpen && <div className="profile-menu" role="menu"><button role="menuitem" onClick={() => { setView("account"); setProfileMenuOpen(false); setMobileNavOpen(false); }}>◉ <span>{tr("My account", "내 계정")}</span></button><button role="menuitem" onClick={() => { if (!session) { setAuthOpen(true); setProfileMenuOpen(false); return; } setNameEditorOpen(true); setProfileMenuOpen(false); }}>✎ <span>{tr("Edit name", "이름 수정")}</span></button><button role="menuitem" onClick={() => { setProfileMenuOpen(false); session ? void supabase.auth.signOut() : setAuthOpen(true); }}>{session ? "↪ " + tr("Sign out", "로그아웃") : "↪ " + tr("Sign in", "로그인")}</button></div>}<button className="profile profile-button" onClick={() => setProfileMenuOpen(current => !current)} aria-haspopup="menu" aria-expanded={profileMenuOpen}><span>{accountInitials}</span><div><b>{accountName}</b><small>{currentRole ?? tr("No workspace role", "워크스페이스 역할 없음")}</small></div><i>{profileMenuOpen ? "⌄" : "›"}</i></button></div></div>
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
        {notificationOpen && <section className="notification-panel"><header><div><small>{tr("WORKSPACE INBOX", "워크스페이스 받은 알림")}</small><h3>{tr("Notifications", "알림")}</h3></div><button onClick={markAllNotificationsRead} disabled={!unreadCount}>{tr("Mark all read", "모두 읽음")}</button></header><div className="notification-tabs"><button className={notificationFilter === "All" ? "active" : ""} onClick={() => setNotificationFilter("All")}>{tr("All", "전체")}</button><button className={notificationFilter === "Unread" ? "active" : ""} onClick={() => setNotificationFilter("Unread")}>{tr("Unread", "읽지 않음")} {unreadCount > 0 && <span>{unreadCount}</span>}</button><button onClick={() => session?.access_token && void loadWorkspaceFeed(session.access_token)}>{tr("Refresh", "새로고침")}</button></div><div className="notification-list">{visibleNotifications.map(item => <button className={`notification-item ${item.read ? "read" : ""}`} key={item.id} onClick={() => openNotification(item)}><span className={`notification-avatar ${item.tone}`}>{item.icon}</span><div><b>{item.title}</b><p>{item.detail}</p><small>{item.time === "Just now" ? tr("Just now", "방금") : item.time === "Yesterday" ? tr("Yesterday", "어제") : `${item.time} ${tr("ago", "전")}`}</small></div>{!item.read && <i />}</button>)}{visibleNotifications.length === 0 && <div className="notification-empty"><span>✓</span><b>{notificationFilter === "Unread" ? tr("You're all caught up", "모든 알림을 확인했습니다") : tr("No workspace notifications yet", "아직 워크스페이스 알림이 없습니다")}</b><p>{tr("Card, milestone, project, document, and member changes will appear here.", "카드, 마일스톤, 프로젝트, 문서, 멤버 변경 사항이 여기에 표시됩니다.")}</p></div>}</div><footer><button onClick={() => { setNotificationOpen(false); setView("activity"); }}>{tr("Open workspace activity", "워크스페이스 활동 열기")} →</button></footer></section>}
      </div></header>

      {view === "overview" && <div className="content">
        <div className="welcome"><div><p>{overviewToday.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US", { weekday:"long", month:"long", day:"numeric" }).toUpperCase()}</p><h1>{tr(`Good morning, ${accountName}`, `좋은 아침이에요, ${accountName}`)} <span>✦</span></h1><h2>{tr("Here’s what’s moving in your world.", "오늘 스튜디오에서 진행 중인 작업이에요.")}</h2></div><div className="team">{members.filter(member => member.status === "Active").slice(0,3).map(member => <span key={member.id}>{member.initials}</span>)}{members.filter(member => member.status === "Active").length > 3 && <span>+{members.filter(member => member.status === "Active").length - 3}</span>}</div></div>
        <div className="stats">
          <article><span className="stat-icon purple-bg">✓</span><div><small>{tr("COMPLETED", "완료")}</small><strong>{activeCards.filter(card => card.status === "Done").length}</strong><p>{tr("Across active projects", "활성 프로젝트 기준")}</p></div></article>
          <article><span className="stat-icon coral-bg">◷</span><div><small>{tr("IN PROGRESS", "진행 중")}</small><strong>{activeCards.filter(card => card.status === "In progress").length}</strong><p>{tr(`Across ${activeProjects.length} active projects`, `활성 프로젝트 ${activeProjects.length}개`)}</p></div></article>
          <article><span className="stat-icon amber-bg">!</span><div><small>{tr("NEEDS ATTENTION", "확인 필요")}</small><strong>{activeAttentionCards.length}</strong><p><b className="warn">{tr(`${activeOverdueCards.length} overdue`, `${activeOverdueCards.length}개 기한 초과`)}</b></p></div></article>
        </div>
        <div className="section-heading"><div><h3>{tr("Your hand", "내 카드")}</h3><p>{tr("Cards ready for you to play next.", "다음으로 진행할 준비가 된 카드입니다.")}</p></div><button onClick={() => setView("quests")}>{tr("View all", "전체 보기")} <span>→</span></button></div>
        <div className="card-grid hand-grid">{overviewActionCards.slice(0, 3).map(card => <QuestCard card={card} onOpen={openCard} todoSummary={cardTodoSummary(card)} key={card.id}/>)}{overviewActionCards.length === 0 && <div className="overview-hand-empty"><span>✓</span><b>{tr("No Ready or In progress cards", "준비 또는 진행 중인 카드가 없습니다")}</b><p>{tr("Review and Done cards stay off this overview.", "검토 및 완료 카드는 이 개요에 표시되지 않습니다.")}</p></div>}</div>
        <div className="overview-focus-grid">
          <section className="overview-focus-panel upcoming"><header><div><small>{tr("NEXT 7 DAYS", "향후 7일")}</small><h3>{tr("Upcoming due", "다가오는 마감")}</h3></div><span>{overviewUpcomingCards.length}</span></header><div>{overviewUpcomingCards.map(card => <button onClick={() => openCard(card)} key={card.id}><i className={card.color}/><div><b>{card.title}</b><small>{card.project} · {card.tag}</small></div><time className={cardDueTone(card)} dateTime={card.dueDate ?? undefined}>◷ {card.due}</time></button>)}{overviewUpcomingCards.length === 0 && <p className="overview-focus-empty">✓ {tr("No cards due in the next 7 days", "7일 이내 마감 카드가 없습니다")}</p>}</div></section>
          <section className="overview-focus-panel urgent"><header><div><small>{tr("QUICK ACTION", "빠른 조치")}</small><h3>{tr("Urgent cards", "긴급 카드")}</h3></div><span>{overviewUrgentCards.length}</span></header><div>{overviewUrgentCards.map(card => <button onClick={() => openCard(card)} key={card.id}><i className={card.color}/><div><b>{card.title}</b><small>{card.project} · {statusLabel(card.status)}</small></div><strong>P{card.priority}</strong>{card.dueDate && <time className={cardDueTone(card)} dateTime={card.dueDate}>◷ {card.due}</time>}</button>)}{overviewUrgentCards.length === 0 && <p className="overview-focus-empty">✓ {tr("No urgent cards need action", "빠른 조치가 필요한 긴급 카드가 없습니다")}</p>}</div></section>
        </div>
        <div className="overview-bottom">
          <section className="milestone-preview">{nextMilestone ? <><div className="mini-title"><div><small>{tr("NEXT MILESTONE", "다음 마일스톤")}</small><h3>{nextMilestone.title}</h3></div><b>{Math.max(0, Math.ceil((new Date(`${nextMilestone.milestoneDate}T12:00:00`).getTime() - milestoneToday.getTime()) / dayMs))} {tr("days", "일")}</b></div><div className="progress-track"><span className={nextMilestone.color} style={{width:`${nextMilestone.progress}%`}}/></div><p><b>{nextMilestone.completedCards} {tr("of", "/")} {nextMilestone.totalCards} {tr("cards", "카드")}</b> {tr("completed", "완료")} <span>{nextMilestone.progress}%</span></p><div className="milestone-tags"><i>{nextMilestone.stage}</i><i>{new Date(`${nextMilestone.milestoneDate}T12:00:00`).toLocaleDateString(language === "ko" ? "ko-KR" : "en-US", { month:"short", day:"numeric" })}</i><button onClick={() => setView("milestones")}>{tr("Manage", "관리")} →</button></div></> : <><div className="mini-title"><div><small>{tr("MILESTONES", "마일스톤")}</small><h3>{tr("No milestones yet", "아직 마일스톤이 없습니다")}</h3></div></div><button className="secondary-button" onClick={() => setView("milestones")}>{tr("Create one", "만들기")} →</button></>}</section>
          <section className="activity live-pulse"><div className="mini-title"><div><small><i/> {tr("LIVE PULSE", "실시간 소식")}</small><h3>{tr("Studio activity", "스튜디오 활동")}</h3></div><button onClick={() => setView("activity")} aria-label={tr("View all activity", "모든 활동 보기")}>•••</button></div><ul>{recentPulseEvents.map((item,index) => <li key={item.id}><button onClick={() => setView(item.destination)}><span className={`pulse-avatar ${["lilac","aqua","gold"][index]}`}>{item.initials}</span><p><b>{item.person}</b> {item.action} <strong>{item.target}</strong>{item.detail && <em>{item.detail}</em>}<small>{item.time === "Just now" ? tr("Just now", "방금") : item.time === "Yesterday" ? tr("Yesterday", "어제") : `${item.time} ${tr("ago", "전")}`}</small></p><span>→</span></button></li>)}{recentPulseEvents.length === 0 && <li className="live-pulse-empty"><span>◌</span><div><b>{tr("Waiting for workspace activity", "워크스페이스 활동을 기다리는 중")}</b><p>{tr("Card and milestone changes will appear here live.", "카드와 마일스톤 변경 사항이 여기에 실시간으로 표시됩니다.")}</p></div></li>}</ul><footer><span><i/> {tr("Synced with workspace activity", "워크스페이스 활동과 동기화됨")}</span><button onClick={() => session?.access_token && void loadWorkspaceFeed(session.access_token)}>↻ {tr("Refresh", "새로고침")}</button></footer></section>
        </div>
      </div>}

      {view === "activity" && <div className="content activity-content"><div className="page-title"><div><p>{tr("WORKSPACE PULSE", "워크스페이스 소식")}</p><h1>{tr("Activity", "활동")}</h1><h2>{tr("Every meaningful change across your studio, in one timeline.", "스튜디오의 모든 주요 변경 사항을 한 타임라인에서 확인하세요.")}</h2></div><div className="activity-actions"><select value={activityFilter} onChange={event => setActivityFilter(event.target.value)} aria-label={tr("Filter activity", "활동 필터")}><option value="All activity">{tr("All activity", "모든 활동")}</option><option value="Cards">{tr("Cards", "카드")}</option><option value="Milestones">{tr("Milestones", "마일스톤")}</option><option value="Projects">{tr("Projects", "프로젝트")}</option><option value="Documents">{tr("Documents", "문서")}</option><option value="Team">{tr("Team", "팀")}</option><option value="Workspace">{tr("Workspace", "워크스페이스")}</option></select><button className="secondary-button" onClick={() => session?.access_token && void loadWorkspaceFeed(session.access_token)}>{tr("Refresh activity", "활동 새로고침")}</button></div></div><div className="activity-layout"><section className="management-card activity-feed"><header><div><small>{tr("RECENT CHANGES", "최근 변경")}</small><h3>{visibleActivity.length} {tr("events", "개 활동")}</h3></div><span className="live-indicator"><i /> {tr("Synced", "동기화됨")}</span></header>{visibleActivity.length > 0 ? <><div className="activity-day"><span>{tr("LATEST", "최신")}</span></div>{visibleActivity.map(item => <article className="activity-event" key={item.id} onClick={() => setView(item.destination)}><span className={`event-avatar ${item.tone}`}>{item.initials}</span><div className="event-copy"><p><b>{item.person}</b> {item.action} <strong>{item.target}</strong></p>{item.detail && <blockquote>{item.detail}</blockquote>}<small>{item.project} · {item.time === "Just now" ? tr("Just now", "방금") : item.time === "Yesterday" ? tr("Yesterday", "어제") : `${item.time} ${tr("ago", "전")}`}</small></div><span className="event-type">{item.type}</span><button aria-label={tr(`Open ${item.target}`, `${item.target} 열기`)}>→</button></article>)}</> : <div className="activity-empty"><span>◌</span><h3>{tr("No activity yet", "아직 활동이 없습니다")}</h3><p>{tr("New workspace changes will be recorded here automatically.", "새 워크스페이스 변경 사항이 자동으로 여기에 기록됩니다.")}</p></div>}</section><aside className="activity-summary"><section className="management-card"><small>{tr("THIS WEEK", "이번 주")}</small><div className="summary-stat"><strong>{weeklyCardUpdates}</strong><span>{tr("Card changes", "카드 변경")}</span></div><div className="summary-stat"><strong>{weeklyCompleted}</strong><span>{tr("Completed", "완료")}</span></div><div className="summary-stat"><strong>{weeklyMilestones}</strong><span>{tr("Milestone changes", "마일스톤 변경")}</span></div></section><section className="management-card contributors"><small>{tr("TOP CONTRIBUTORS", "주요 기여자")}</small>{contributorCounts.map((contributor,index) => <div key={contributor.person}><span className="member-avatar">{contributor.initials}</span><p><b>{contributor.person}</b><small>{contributor.count} {tr("updates", "개 업데이트")}</small></p><strong>#{index+1}</strong></div>)}{contributorCounts.length === 0 && <p className="contributors-empty">{tr("Contributors will appear after activity is recorded.", "활동이 기록되면 기여자가 표시됩니다.")}</p>}</section></aside></div></div>}

      {view === "quests" && <div className="content board-content">
        <div className="page-title board-page-title"><div><p>{tr("PRODUCTION", "프로덕션")}</p><h1>{tr("Production board", "프로덕션 보드")}</h1><h2>{tr("Move every quest from idea to shipped.", "모든 퀘스트를 아이디어에서 출시까지 진행하세요.")}</h2></div><div className="board-header-actions"><button className="secondary-button" onClick={() => setBackupOpen(true)}>⇩ {tr("Backup", "백업")}</button><button className="create-button" onClick={() => openCreateCard()}>＋ {tr("New card", "새 카드")}</button></div></div>
        <section className="board-toolbar" aria-label={tr("Board filters and view options", "보드 필터 및 보기 옵션")}>
          <div className="board-toolbar-primary"><button className={`filter-toggle ${filtersOpen ? "active" : ""}`} onClick={() => setFiltersOpen(open => !open)}>⌁ {tr("Filters", "필터")} <b>{[project !== "All projects", priorityFilter !== "All", ownerFilter !== "All", disciplineFilter !== "All", dueFilter !== "All", Boolean(query)].filter(Boolean).length}</b></button><label><span>{tr("Sort", "정렬")}</span><select value={boardSort} onChange={event => setBoardSort(event.target.value as BoardSort)} aria-label={tr("Sort cards", "카드 정렬")}><option value="Default">{tr("Oldest added", "추가된 순")}</option><option value="Newest">{tr("Newest added", "최근 추가 순")}</option><option value="Priority">{tr("Priority: high first", "우선순위 높은 순")}</option><option value="Priority low">{tr("Priority: low first", "우선순위 낮은 순")}</option><option value="Due date">{tr("Due: soonest first", "마감 빠른 순")}</option><option value="Due date latest">{tr("Due: latest first", "마감 늦은 순")}</option><option value="Effort">{tr("Effort: high first", "작업량 높은 순")}</option><option value="Effort low">{tr("Effort: low first", "작업량 낮은 순")}</option><option value="Title">{tr("Title: A–Z", "제목: 가나다순")}</option></select></label><div className="density-control" role="group" aria-label={tr("Card density", "카드 밀도")}><button className={boardDensity === "comfortable" ? "active" : ""} onClick={() => setBoardDensity("comfortable")} aria-label={tr("Comfortable cards", "여유로운 카드")}>▤</button><button className={boardDensity === "compact" ? "active" : ""} onClick={() => setBoardDensity("compact")} aria-label={tr("Compact cards", "간결한 카드")}>☷</button></div><span className="board-result-count"><b>{filtered.length}</b> {tr(filtered.length === 1 ? "card" : "cards", "개 카드")}</span></div>
          {filtersOpen && <div className="board-filter-row"><label>{tr("Project", "프로젝트")}<select value={project} onChange={e => setProject(e.target.value)}><option value="All projects">{tr("All projects", "모든 프로젝트")}</option>{activeProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select></label><label>{tr("Priority", "우선순위")}<select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value as typeof priorityFilter)}><option value="All">{tr("Any priority", "모든 우선순위")}</option><option value="Critical">{tr("Critical · 8–10", "긴급 · 8–10")}</option><option value="High">{tr("High · 5–7", "높음 · 5–7")}</option><option value="Normal">{tr("Normal · 1–4", "보통 · 1–4")}</option></select></label><label>{tr("Owner", "담당자")}<select value={ownerFilter} onChange={event => setOwnerFilter(event.target.value)}><option value="All">{tr("Any owner", "모든 담당자")}</option>{activeCardOwners.map(member => <option value={member.initials} key={member.id}>{member.name}</option>)}</select></label><label>{tr("Discipline", "분야")}<select value={disciplineFilter} onChange={event => setDisciplineFilter(event.target.value)}><option value="All">{tr("Any discipline", "모든 분야")}</option>{productionDisciplines.map(item => <option value={item.name} key={item.id}>{item.name}</option>)}</select></label><label>{tr("Due", "마감")}<select value={dueFilter} onChange={event => setDueFilter(event.target.value as typeof dueFilter)}><option value="All">{tr("Any date", "모든 날짜")}</option><option value="Overdue">{tr("Overdue", "기한 지남")}</option><option value="Today">{tr("Due today", "오늘 마감")}</option><option value="This week">{tr("Next 7 days", "7일 이내")}</option><option value="No date">{tr("No due date", "마감일 없음")}</option></select></label><button onClick={() => { setProject("All projects"); setPriorityFilter("All"); setOwnerFilter("All"); setDisciplineFilter("All"); setDueFilter("All"); setBoardSort("Default"); setQuery(""); }}>{tr("Reset", "초기화")}</button><button className="archived-folder-button" onClick={() => setArchiveOpen(true)}>▣ {tr("Archived", "보관함")} <b>{archivedCards.length}</b></button></div>}
        </section>
        <div className={`board board-density-${boardDensity}`}>
          {(["Ready", "In progress", "Review", "Done"] as Status[]).map((status, index) => <section className={`board-column ${boardDropStatus === status ? "board-drop-target" : ""}`} key={status} onDragEnter={event => { event.preventDefault(); if (draggedBoardCard) { setBoardDropStatus(status); setBoardDropAction(null); } }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (draggedBoardCard) { setBoardDropStatus(status); setBoardDropAction(null); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setBoardDropStatus(current => current === status ? null : current); }} onDrop={event => { event.preventDefault(); const cardId = Number(event.dataTransfer.getData("text/questdeck-board-card") || draggedBoardCard); if (cardId) void moveBoardCard(cardId, status); }}>
            <header><span className={`status-dot s${index}`}/><h3>{columnNames[status] || statusLabel(status)}</h3><b>{filtered.filter(c => c.status === status).length}</b><div className="column-menu-wrap"><button className={`column-menu-trigger ${activeColumnMenu === status ? "active" : ""}`} onClick={() => setActiveColumnMenu(current => current === status ? null : status)} aria-label={`${columnNames[status] || statusLabel(status)} ${tr("options", "옵션")}`} aria-expanded={activeColumnMenu === status}>•••</button>{activeColumnMenu === status && <div className="column-menu" role="menu"><button role="menuitem" onClick={() => openCreateCard(status)}>＋ <span>{tr("Add card here", "여기에 카드 추가")}</span></button><button role="menuitem" onClick={() => { setEditColumn(status); setActiveColumnMenu(null); }}>✎ <span>{tr("Rename column", "열 이름 변경")}</span></button>{columnNames[status] && <button role="menuitem" onClick={() => resetColumnName(status)}>↺ <span>{tr("Reset name", "기본 이름 복원")}</span></button>}</div>}</div></header>
            <form className="quick-card-form" onSubmit={event => quickAddCard(event, status)}><span>＋</span><input value={quickCardTitles[status] ?? ""} onChange={event => setQuickCardTitles(current => ({ ...current, [status]: event.target.value }))} placeholder={tr("Quick add a card…", "빠르게 카드 추가…")} aria-label={tr(`Quick add to ${statusLabel(status)}`, `${statusLabel(status)}에 빠른 카드 추가`)} maxLength={120}/><button type="submit" disabled={!quickCardTitles[status]?.trim()}>{tr("Add", "추가")}</button></form>
            <div className="column-cards">{boardCardsForStatus(status).map(card => { const summary = cardTodoSummary(card); const heroExpanded = !collapsedHeroIds.has(card.id); return <QuestCard card={card} onOpen={openCard} compact={boardDensity === "compact"} heroExpanded={heroExpanded} heroTreeLabel={heroExpanded ? tr("Hide sub-cards", "하위 카드 숨기기") : tr("Show sub-cards", "하위 카드 보기")} onToggleHero={summary.isHero && summary.heroChildren ? () => toggleHeroTree(card.id) : undefined} draggable dragging={draggedBoardCard === card.id} onPreviewStart={scheduleCardHoverPreview} onPreviewEnd={hideCardHoverPreview} onDragStart={event => { hideCardHoverPreview(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/questdeck-board-card", String(card.id)); setDraggedBoardCard(card.id); setBoardDropStatus(status); setBoardDropAction(null); }} onDragEnd={() => { setDraggedBoardCard(null); setBoardDropStatus(null); setBoardDropAction(null); }} todoSummary={summary} key={card.id}/>; })}</div>
            {boardDropStatus === status && draggedBoardCard && <div className="board-drop-hint">{tr(`Drop in ${statusLabel(status)}`, `${statusLabel(status)}에 놓기`)}</div>}
          </section>)}
        </div>
        {draggedBoardCard && <div className="board-card-actions" role="group" aria-label={tr("Card archive and delete actions", "카드 보관 및 삭제 작업")}><div className={boardDropAction === "archive" ? "active" : ""} onDragEnter={event => { event.preventDefault(); setBoardDropStatus(null); setBoardDropAction("archive"); }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setBoardDropAction("archive"); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setBoardDropAction(null); }} onDrop={event => { event.preventDefault(); const cardId = Number(event.dataTransfer.getData("text/questdeck-board-card") || draggedBoardCard); const card = cards.find(item => item.id === cardId); if (card) void setCardArchived(card, true); }}>▣ <span><b>{tr("Archive", "보관")}</b><small>{tr("Move to the recoverable folder", "복원 가능한 보관함으로 이동")}</small></span></div><div className={`delete-zone ${boardDropAction === "delete" ? "active" : ""}`} onDragEnter={event => { event.preventDefault(); setBoardDropStatus(null); setBoardDropAction("delete"); }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setBoardDropAction("delete"); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setBoardDropAction(null); }} onDrop={event => { event.preventDefault(); const cardId = Number(event.dataTransfer.getData("text/questdeck-board-card") || draggedBoardCard); const card = cards.find(item => item.id === cardId); if (card) void deleteCard(card); }}>× <span><b>{tr("Delete", "삭제")}</b><small>{tr("Permanently remove after confirmation", "확인 후 영구 삭제")}</small></span></div></div>}
      </div>}

      {view === "timeline" && <div className="content schedule-content">
        <div className="page-title timeline-title"><div><p>{tr("PRODUCTION SCHEDULE", "프로덕션 일정")}</p><h1>{tr("Timeline", "타임라인")}</h1><h2>{tr("Plan the same cards shown on your Production Board.", "프로덕션 보드의 동일한 카드를 일정으로 계획하세요.")}</h2></div><div className="timeline-controls"><button onClick={() => setTimelineStart(current => addDays(current, -timelineDayCount))} aria-label={tr("Previous period", "이전 기간")}>‹</button><button className="today-button" onClick={() => setTimelineStart(addDays(timelineReferenceDate, -Math.floor(timelineDayCount / 2)))}>◎ {tr("Back to today", "오늘로 돌아가기")}</button><button onClick={() => setTimelineStart(current => addDays(current, timelineDayCount))} aria-label={tr("Next period", "다음 기간")}>›</button><select value={timelineScale} onChange={event => setTimelineScale(event.target.value as typeof timelineScale)} aria-label={tr("Timeline scale", "타임라인 범위")}><option value="2 weeks">{tr("2 weeks", "2주")}</option><option value="Month">{tr("Month", "월")}</option><option value="Quarter">{tr("Quarter", "분기")}</option></select></div></div>
        <div className="timeline-toolbar"><label>{tr("Project", "프로젝트")}<select value={project} onChange={event => setProject(event.target.value)}><option value="All projects">{tr("All projects", "모든 프로젝트")}</option>{activeProjects.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label><label>{tr("Sort", "정렬")}<select value={timelineSort} onChange={event => setTimelineSort(event.target.value as typeof timelineSort)}><option value="Due date">{tr("Due date", "마감일")}</option><option value="Status">{tr("Status", "상태")}</option><option value="Owner">{tr("Owner", "담당자")}</option><option value="Name">{tr("Name", "이름")}</option></select></label><label className="timeline-height-control">{tr("Row height", "행 높이")}<span><input type="range" min="88" max="220" step="4" value={timelineRowHeight} onChange={event => setTimelineRowHeight(Number(event.target.value))} aria-label={tr("Timeline row height", "타임라인 행 높이")} /><output>{timelineRowHeight}px</output></span></label><div className="timeline-status-summary" aria-label={tr("Timeline status totals", "타임라인 상태별 카드 수")}>{(["Ready", "In progress", "Review", "Done"] as Status[]).map(status => <span className={`status-${status.toLowerCase().replace(" ", "-")}`} key={status}><i />{statusLabel(status)} <b>{timelineCards.filter(item => item.card.status === status).length}</b></span>)}</div><span><b>{timelineCards.length}</b> {tr("scheduled cards", "개 일정 카드")}</span>{project !== "All projects" && <button onClick={() => setProject("All projects")}>× {tr("Clear project", "프로젝트 필터 해제")}</button>}</div>
        <section className="schedule-shell" style={{"--timeline-row-height":`${timelineRowHeight}px`} as CSSProperties}>
          <header className="schedule-month"><div className="lane-corner"><span>{tr("BOARD CARDS", "보드 카드")}</span><b>{timelineMonthLabel}</b></div><div className="month-band"><span>{project === "All projects" ? tr("All active projects", "모든 활성 프로젝트") : project}</span><i>{timelinePanning ? tr("Release to stop browsing", "놓으면 탐색을 멈춥니다") : tr("Drag empty space to browse dates", "빈 공간을 끌어 날짜 탐색")}</i></div></header>
          <div className={`schedule-scroll timeline-pan-surface ${timelinePanning ? "is-panning" : ""}`} onPointerDown={beginTimelinePan} onPointerMove={updateTimelinePan} onPointerUp={finishTimelinePan} onPointerCancel={finishTimelinePan} aria-label={tr("Timeline table. Drag empty space left or right to browse dates.", "타임라인 표. 빈 공간을 좌우로 끌어 날짜를 탐색하세요.")}>
            <div className="date-grid" style={{gridTemplateColumns:`210px repeat(${timelineDayCount},minmax(58px,1fr))`}}><div className="date-label-spacer"/>{timelineDates.map(date => { const today = date.getTime() === timelineReferenceDate.getTime(); const weekend = date.getDay() === 0 || date.getDay() === 6; return <div className={`date-cell ${today ? "today" : ""} ${weekend ? "weekend" : ""}`} key={date.toISOString()}><small>{date.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US", { weekday: "short" })}</small><b>{date.getDate()}</b></div>})}</div>
            <div className="schedule-body">
              {timelineReferenceDate >= timelineStart && timelineReferenceDate <= timelineEnd && <div className="today-line" style={{left:`calc(210px + ((100% - 210px) / ${timelineDayCount} * ${Math.floor((timelineReferenceDate.getTime() - timelineStart.getTime()) / dayMs) + .5}))`}} aria-hidden="true"><span>{tr("Today", "오늘")}</span></div>}
              {timelineGroups.map(({discipline,items}) => {
                const groupHeight = Math.max(timelineRowHeight, items.length * 62 + 18);
                return <div className="schedule-row discipline-row" key={discipline} style={{minHeight:groupHeight}}>
                  <div className="lane-label"><span className={`lane-swatch ${items[0]?.card.color ?? "violet"}`}/><div><b>{discipline}</b><small>{items.length} {tr(items.length === 1 ? "card" : "cards", "개 카드")}</small></div></div>
                  <div className="lane-track discipline-track" style={{gridTemplateColumns:`repeat(${timelineDayCount},minmax(58px,1fr))`, gridTemplateRows:`repeat(${items.length},54px)`, "--timeline-columns":timelineDayCount} as CSSProperties}>
                    {timelineDates.map((dropDate,index) => <div className={`timeline-drop-zone ${draggedTimelineCard ? "drag-active" : ""}`} style={{gridColumn:index + 1,gridRow:`1 / ${items.length + 1}`}} key={dropDate.toISOString()} onDragOver={event => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => {
                      event.preventDefault();
                      const cardId = Number(event.dataTransfer.getData("text/questdeck-card") || draggedTimelineCard);
                      if (cardId) void moveTimelineCard(cardId, dropDate);
                    }} />)}
                    {items.map(({card,startDate,endDate},itemIndex) => {
                      const activeGesture = timelineGesture?.cardId === card.id ? timelineGesture : null;
                      const displayStart = activeGesture?.currentStart ?? startDate;
                      const displayEnd = activeGesture?.currentEnd ?? endDate;
                      const visibleStart = displayStart < timelineStart ? timelineStart : displayStart;
                      const visibleEnd = displayEnd > timelineEnd ? timelineEnd : displayEnd;
                      const start = Math.max(0, Math.floor((visibleStart.getTime() - timelineStart.getTime()) / dayMs));
                      const span = Math.max(1, Math.floor((visibleEnd.getTime() - visibleStart.getTime()) / dayMs) + 1);
                      const todos = visibleSubTodos(subTodos[card.id] ?? []);
                      const completed = todos.filter(todo => todo.done).length;
                      const heroChildren = timelineHeroRelations.childrenByHero.get(card.id) ?? [];
                      const heroCompleted = heroChildren.filter(child => child.status === "Done").length;
                      const heroParent = timelineHeroRelations.parentByChild.get(card.id);
                      const isHero = timelineHeroRelations.childrenByHero.has(card.id);
                      const progress = card.status === "Done" ? 100 : isHero && heroChildren.length ? Math.round(heroCompleted / heroChildren.length * 100) : todos.length ? Math.round(completed / todos.length * 100) : 0;
                      return <button onPointerDown={event => { if (!(event.target as HTMLElement).closest(".timeline-resize-handle")) beginTimelineGesture(event, card.id, "move", startDate, endDate); }} onPointerMove={updateTimelineGesture} onPointerUp={event => void finishTimelineGesture(event)} onPointerCancel={cancelTimelineGesture} onMouseEnter={event => { if (!timelineGestureRef.current) showTimelineTooltip(card.id, event.currentTarget); }} onMouseLeave={() => setTimelineHover(null)} onFocus={event => showTimelineTooltip(card.id, event.currentTarget)} onBlur={() => setTimelineHover(null)} className={`run-bar grouped-run-bar ${card.color} timeline-priority-${priorityTone(card.priority)} ${isHero ? "timeline-hero-bar" : heroParent ? "timeline-sub-card-bar" : ""} ${activeGesture ? `gesture-active gesture-${activeGesture.mode}` : ""}`} style={{gridColumn:`${start + 1} / span ${span}`,gridRow:itemIndex + 1}} onClick={event => { if (timelineDidDrag.current) { timelineDidDrag.current = false; event.preventDefault(); return; } openCard(card); }} aria-label={tr(`${isHero ? "Hero card" : heroParent ? "Sub-card" : "Card"}: ${card.title}; drag the middle to move or an edge to resize`, `${isHero ? "Hero 카드" : heroParent ? "하위 카드" : "카드"}: ${card.title}; 가운데를 끌어 이동하거나 가장자리를 끌어 기간 변경`)} key={card.id}>
                        <span className="timeline-resize-handle start-handle" onPointerDown={event => beginTimelineGesture(event, card.id, "start", startDate, endDate)} onPointerMove={updateTimelineGesture} onPointerUp={event => void finishTimelineGesture(event)} onPointerCancel={cancelTimelineGesture} onClick={event => event.stopPropagation()} title={tr("Drag to adjust start date", "시작일을 변경하려면 끌기")} aria-hidden="true" />
                        {isHero && <><b className="timeline-journey-badge hero-badge">★ <span>HERO</span><em>{heroCompleted}/{heroChildren.length}</em></b>{heroChildren.length > 0 && <span className="timeline-hero-steps" aria-hidden="true" style={{gridTemplateColumns:`repeat(${heroChildren.length},minmax(3px,1fr))`}}>{heroChildren.map(child => <em className={child.status === "Done" ? "done" : child.status === "In progress" || child.status === "Review" ? "active" : ""} key={child.id}/>)}</span>}</>}
                        {heroParent && <b className="timeline-journey-badge sub-card-badge">↳ <span>{tr("SUB", "하위")}</span><em>{heroParent.index + 1}/{heroParent.total}</em></b>}
                        <b className={`run-priority ${priorityTone(card.priority)}`}>P{card.priority}</b><b className={`run-status status-${card.status.toLowerCase().replace(" ", "-")}`}>{statusLabel(card.status)}</b><span className="run-card-title">{card.title}</span>{todos.length > 0 && <small className="run-subtasks">☑ {completed}/{todos.length}</small>}<small>{timelineDateLabel(displayStart)} → {timelineDateLabel(displayEnd)}</small>{activeGesture && <span className="timeline-gesture-readout">{activeGesture.mode === "move" ? tr("Move", "이동") : activeGesture.mode === "start" ? tr("Start", "시작") : tr("Due", "마감")} · {timelineDateLabel(displayStart)} → {timelineDateLabel(displayEnd)}</span>}
                        <span className="timeline-resize-handle end-handle" onPointerDown={event => beginTimelineGesture(event, card.id, "end", startDate, endDate)} onPointerMove={updateTimelineGesture} onPointerUp={event => void finishTimelineGesture(event)} onPointerCancel={cancelTimelineGesture} onClick={event => event.stopPropagation()} title={tr("Drag to adjust due date", "마감일을 변경하려면 끌기")} aria-hidden="true" />
                        <i className="timeline-bar-progress" style={{width:`${progress}%`}}/>
                      </button>;
                    })}
                  </div>
                </div>;
              })}
              {timelineCards.length === 0 && <div className="timeline-empty"><span>◇</span><div><b>{tr("No scheduled cards in this period", "이 기간에 예정된 카드가 없습니다")}</b><small>{tr("Choose another project or move to a different date range.", "다른 프로젝트를 선택하거나 날짜 범위를 이동하세요.")}</small></div></div>}
            </div>
          </div>
          <footer className="timeline-legend"><span><i className="legend-dot status-in-progress"/> {tr("In progress", "진행 중")}</span><span><i className="legend-dot status-review"/> {tr("Review", "검토")}</span><span><i className="legend-dot status-done"/> {tr("Done", "완료")}</span><span><i className="timeline-legend-hero">★</i> {tr("Hero card", "Hero 카드")}</span><span><i className="timeline-legend-sub">↳</i> {tr("Sub-card", "하위 카드")}</span><span>☑ {tr("Sub-task progress", "하위 작업 진행률")}</span><p>{tr("Drag a card onto another day to reschedule it", "카드를 다른 날짜로 끌어 일정을 변경하세요")}</p></footer>
        </section>
        {timelineHover && (() => { const card = cards.find(item => item.id === timelineHover.cardId); if (!card) return null; const todos = visibleSubTodos(subTodos[card.id] ?? []); const completed = todos.filter(todo => todo.done).length; const start = card.startDate ? timelineDateLabel(new Date(`${card.startDate}T12:00:00`)) : card.due; const heroChildren = timelineHeroRelations.childrenByHero.get(card.id); const heroParent = timelineHeroRelations.parentByChild.get(card.id); const heroCompleted = heroChildren?.filter(child => child.status === "Done").length ?? 0; return <aside className="timeline-floating-tooltip" role="tooltip" style={{left:timelineHover.left,top:timelineHover.top}}>{heroChildren && <div className="timeline-tooltip-journey hero"><strong>★ {tr("Hero card", "Hero 카드")}</strong><strong>{heroCompleted}/{heroChildren.length} {tr("sub-cards done", "하위 카드 완료")}</strong></div>}{heroParent && <div className="timeline-tooltip-journey sub"><strong>↳ {tr("Sub-card", "하위 카드")} {heroParent.index + 1}/{heroParent.total}</strong><strong>{tr("Hero", "Hero")}: {heroParent.hero.title}</strong></div>}<b>{card.title}</b><p>{card.description}</p><div><strong>{card.project}</strong><strong>{statusLabel(card.status)}</strong></div><div><strong>◉ {card.owner}</strong><strong>↔ {start} → {card.due}</strong><strong>◆ {card.points}</strong></div>{todos.length > 0 && <footer><b>{tr("Sub-tasks", "하위 작업")} {completed}/{todos.length}</b><span>{todos.slice(0,2).map(todo => `${todo.done ? "✓" : "○"} ${todo.text}`).join(" · ")}</span></footer>}</aside> })()}
      </div>}

      {view === "mindmap" && <div className="content mindmap-content">
        <div className="page-title mindmap-title"><div><p>{tr("VISUAL THINKING", "비주얼 사고")}</p><h1>{tr("Mindmap studio", "마인드맵 스튜디오")}</h1><h2>{tr("Keep separate canvases for different topics, then turn ideas into production cards.", "주제별 캔버스를 나누고 아이디어를 프로덕션 카드로 전환하세요.")}</h2></div><div className="mindmap-title-actions"><span className={`mindmap-save-state ${mindmapSaveState}`}><i />{mindmapSaveState === "saving" ? tr("Saving…", "저장 중…") : mindmapSaveState === "error" ? tr("Save failed", "저장 실패") : tr("Saved privately", "비공개 저장됨")}</span><button className="secondary-button" disabled={Boolean(session) && !currentPermissions?.edit_cards} onClick={() => void createMindmap()}>＋ {tr("New map", "새 맵")}</button><button className="create-button" disabled={Boolean(session) && !currentPermissions?.edit_cards} onClick={() => addMindmapNode()}>＋ {tr("New idea", "새 아이디어")}</button></div></div>
        <section className="mindmap-shell">
          <header className="mindmap-toolbar"><div><button onClick={() => zoomMindmap(mindmapViewport.zoom * .85)} aria-label={tr("Zoom out", "축소")}>−</button><output>{Math.round(mindmapViewport.zoom * 100)}%</output><button onClick={() => zoomMindmap(mindmapViewport.zoom * 1.15)} aria-label={tr("Zoom in", "확대")}>＋</button><button className="mindmap-fit-button" onClick={fitMindmap}>⌗ {tr("Fit map", "전체 보기")}</button></div><p>{linkingMindmapNodeId ? tr("Choose another node’s link button to connect it", "연결할 다른 노드의 연결 버튼을 누르세요") : tr("Drag empty space to pan · Scroll to zoom · Double-click to add", "빈 공간 드래그: 이동 · 스크롤: 확대/축소 · 더블클릭: 추가")}</p><button className="mindmap-save-button" disabled={!mindmapDirty && mindmapSaveState !== "error"} onClick={() => void saveMindmap()}>✓ {tr("Save now", "지금 저장")}</button></header>
          <div className="mindmap-workspace">
            <aside className="mindmap-library"><header><div><small>{tr("YOUR MAPS", "내 마인드맵")}</small><b>{mindmapDocuments.length} {tr(mindmapDocuments.length === 1 ? "map" : "maps", "개")}</b></div><button onClick={() => void createMindmap()} disabled={Boolean(session) && !currentPermissions?.edit_cards}>＋</button></header><div>{mindmapDocuments.map(document => { const parsed = parseMindmap(document.content); return <button className={document.id === activeMindmapDocumentId ? "active" : ""} onClick={() => void switchMindmap(document)} key={document.id}><span>{document.title.slice(0,1).toUpperCase()}</span><div><b>{document.title}</b><small>{parsed?.nodes.length ?? 0} {tr("ideas", "개 아이디어")}</small></div>{document.id === activeMindmapDocumentId && <i>✓</i>}</button>; })}{mindmapDocuments.length === 0 && <p>{tr("Your first map will be saved when you make a change.", "내용을 변경하면 첫 마인드맵이 저장됩니다.")}</p>}</div>{activeMindmapDocument && <footer><label>{tr("Map name", "맵 이름")}<input value={mindmapTitle} maxLength={120} onChange={event => { setMindmapTitle(event.target.value); markMindmapDirty(); }} /></label><button onClick={() => void deleteMindmap(activeMindmapDocument)}>× {tr("Delete map", "맵 삭제")}</button></footer>}</aside>
            <div ref={mindmapCanvasRef} className={`mindmap-canvas ${mindmapGestureRef.current?.mode === "pan" ? "is-panning" : ""}`} onPointerDown={beginMindmapPan} onPointerMove={moveMindmapPointer} onPointerUp={finishMindmapPointer} onPointerCancel={finishMindmapPointer} onWheel={handleMindmapWheel} onClick={event => { if (!(event.target as HTMLElement).closest(".mindmap-node") && !mindmapDidMoveRef.current) setSelectedMindmapNodeId(null); }} onDoubleClick={event => { if (!(event.target as HTMLElement).closest(".mindmap-node")) addMindmapNode(event.clientX, event.clientY); }} aria-label={tr("Infinite mindmap canvas", "무한 마인드맵 캔버스")}>
              <div className="mindmap-world" style={{transform:`translate(${mindmapViewport.x}px, ${mindmapViewport.y}px) scale(${mindmapViewport.zoom})`}}>
                {mindmapEdges.map(edge => { const from = mindmapNodes.find(node => node.id === edge.from); const to = mindmapNodes.find(node => node.id === edge.to); if (!from || !to) return null; const x1 = from.x + 110; const y1 = from.y + 65; const x2 = to.x + 110; const y2 = to.y + 65; const distance = Math.hypot(x2 - x1, y2 - y1); const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI; return <div className="mindmap-edge" style={{left:x1,top:y1,width:distance,transform:`rotate(${angle}deg)`}} key={edge.id}><i /></div>; })}
                {mindmapNodes.map(node => <article className={`mindmap-node ${node.color} ${node.imagePath ? "with-image" : ""} ${selectedMindmapNodeId === node.id ? "selected" : ""} ${linkingMindmapNodeId === node.id ? "linking" : ""}`} style={{left:node.x,top:node.y}} onPointerDown={event => beginMindmapNodeDrag(event, node)} onClick={() => { if (!mindmapDidMoveRef.current) setSelectedMindmapNodeId(node.id); }} tabIndex={0} key={node.id}><header><i /><span>{node.title.slice(0,1).toUpperCase()}</span><button onClick={event => { event.stopPropagation(); connectMindmapNode(node.id); }} disabled={Boolean(session) && !currentPermissions?.edit_cards} aria-label={linkingMindmapNodeId ? tr(`Connect to ${node.title}`, `${node.title}에 연결`) : tr(`Start a connection from ${node.title}`, `${node.title}에서 연결 시작`)}>{linkingMindmapNodeId === node.id ? "×" : "↗"}</button></header>{node.imagePath && mindmapImageUrls[node.imagePath] && <img src={mindmapImageUrls[node.imagePath]} alt="" draggable={false} />}<h3>{node.title}</h3><p>{node.note}</p><footer><span>{mindmapEdges.filter(edge => edge.from === node.id || edge.to === node.id).length} {tr("links", "개 연결")}</span>{node.imagePath && <span>▧ {tr("image", "이미지")}</span>}<b>⋮⋮</b></footer></article>)}
              </div>
              {mindmapNodes.length === 0 && <button className="mindmap-empty" onClick={() => addMindmapNode()}>＋ <b>{tr("Create your first idea", "첫 아이디어 만들기")}</b><span>{tr("Your canvas has room for anything.", "캔버스에는 무엇이든 펼칠 수 있습니다.")}</span></button>}
            </div>
            <aside className={`mindmap-inspector ${selectedMindmapNode ? "open" : ""}`}>{selectedMindmapNode ? <><header><div><small>{tr("SELECTED IDEA", "선택한 아이디어")}</small><b>{tr("Node details", "노드 상세")}</b></div><button onClick={() => setSelectedMindmapNodeId(null)}>×</button></header>{selectedMindmapNode.imagePath && mindmapImageUrls[selectedMindmapNode.imagePath] && <figure><img src={mindmapImageUrls[selectedMindmapNode.imagePath]} alt={selectedMindmapNode.title} /><button onClick={() => void removeMindmapImage(selectedMindmapNode)}>× {tr("Remove image", "이미지 삭제")}</button></figure>}<label>{tr("Title", "제목")}<input value={selectedMindmapNode.title} maxLength={100} disabled={Boolean(session) && !currentPermissions?.edit_cards} onChange={event => updateMindmapNode(selectedMindmapNode.id, { title: event.target.value })} /></label><label>{tr("Thought or note", "생각 또는 메모")}<textarea value={selectedMindmapNode.note} maxLength={400} disabled={Boolean(session) && !currentPermissions?.edit_cards} onChange={event => updateMindmapNode(selectedMindmapNode.id, { note: event.target.value })} /></label><fieldset><legend>{tr("Color", "색상")}</legend>{(["violet","mint","coral","blue","amber"] as MindmapNode["color"][]).map(color => <button className={color === selectedMindmapNode.color ? "active" : ""} onClick={() => updateMindmapNode(selectedMindmapNode.id, { color })} aria-label={color} disabled={Boolean(session) && !currentPermissions?.edit_cards} key={color}><i className={color} /></button>)}</fieldset><div className="mindmap-node-tools"><button onClick={() => mindmapImageInputRef.current?.click()} disabled={mindmapImageUploading || Boolean(session) && !currentPermissions?.edit_cards}>▧ {mindmapImageUploading ? tr("Uploading…", "업로드 중…") : selectedMindmapNode.imagePath ? tr("Replace image", "이미지 교체") : tr("Attach image", "이미지 첨부")}</button><button onClick={() => createCardFromMindmap(selectedMindmapNode)} disabled={Boolean(session) && !currentPermissions?.edit_cards}>▤ {tr("Create card", "카드 만들기")}</button></div><div className="mindmap-inspector-actions"><button className={linkingMindmapNodeId === selectedMindmapNode.id ? "active" : ""} onClick={() => connectMindmapNode(selectedMindmapNode.id)}>↗ {linkingMindmapNodeId === selectedMindmapNode.id ? tr("Cancel connection", "연결 취소") : tr("Connect idea", "아이디어 연결")}</button><button className="danger-button" onClick={() => deleteMindmapNode(selectedMindmapNode.id)}>× {tr("Delete", "삭제")}</button></div><footer><small>{tr("Shortcuts", "단축키")}</small><span><kbd>⌘</kbd><kbd>↵</kbd> {tr("new idea", "새 아이디어")}</span><span><kbd>⌫</kbd> {tr("delete selected", "선택 삭제")}</span><span><kbd>⌘</kbd><kbd>0</kbd> {tr("fit map", "전체 보기")}</span></footer></> : <div className="mindmap-inspector-empty"><span>⌘</span><b>{tr("Select an idea", "아이디어 선택")}</b><p>{tr("Click a node to edit it, attach an image, or create a production card.", "노드를 선택하여 수정하거나 이미지를 첨부하고 프로덕션 카드를 만드세요.")}</p></div>}</aside><input ref={mindmapImageInputRef} className="mindmap-image-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadMindmapImage} />
          </div>
        </section>
      </div>}

      {view === "flowchart" && <FlowchartStudio documents={documents} setDocuments={setDocuments} session={session} activeWorkspaceId={activeWorkspaceId} accountName={accountName} accountEmail={accountEmail ?? ""} canEdit={Boolean(session && currentPermissions?.edit_cards)} language={language} setToast={setToast} onCreateCard={(title, description) => openCreateCard("Ready", { title, description })} />}

      {view === "spreadsheet" && <SpreadsheetStudio documents={documents} setDocuments={setDocuments} session={session} activeWorkspaceId={activeWorkspaceId} accountName={accountName} accountEmail={accountEmail ?? ""} canEdit={Boolean(session && currentPermissions?.edit_cards)} language={language} setToast={setToast} onCreateCard={(title, description) => openCreateCard("Ready", { title, description })} />}

      {view === "documents" && <div className="content documents-content"><div className="page-title"><div><p>{tr("KNOWLEDGE BASE", "지식 공유")}</p><h1>{tr("Documents", "문서")}</h1><h2>{tr("Create rich team documents with autosave, discussion, and shareable links.", "자동 저장, 토론, 공유 링크를 지원하는 팀 문서를 만드세요.")}</h2></div><button className="create-button" disabled={Boolean(session) && !currentPermissions?.edit_cards} onClick={() => void createBlankDocument()}>＋ {tr("New document", "새 문서")}</button></div>{!session ? <section className="documents-signin"><span>▧</span><h3>{tr("Sign in to manage documents", "문서를 관리하려면 로그인하세요")}</h3><p>{tr("Published document links remain available to anyone you share them with.", "공개 문서 링크는 공유받은 누구나 열 수 있습니다.")}</p><button className="create-button" onClick={() => setAuthOpen(true)}>{tr("Sign in", "로그인")}</button></section> : <section className="document-grid">{regularDocuments.map(document => <article className="document-card" key={document.id}><header><span>▧</span><div><small>{document.isPublished ? tr("PUBLISHED", "공개") : tr("PRIVATE", "비공개")}</small><h3>{document.title}</h3></div><i className={document.isPublished ? "published" : ""}/></header><p>{richTextExcerpt(document.content).slice(0,180) || tr("Empty document", "빈 문서")}</p><small>{tr("Updated", "업데이트")} {new Date(document.updatedAt).toLocaleDateString(language === "ko" ? "ko-KR" : "en-US")} · {document.ownerName || document.createdByEmail}</small><footer><button onClick={() => openDocumentEditor(document)}>✎ {tr("Edit", "수정")}</button>{document.isPublished ? <><button onClick={() => void setDocumentPublished(document, true, true)}>↗ {tr("Copy link", "링크 복사")}</button><button onClick={() => void setDocumentPublished(document, false)}>◌ {tr("Unpublish", "비공개")}</button></> : <button onClick={() => void setDocumentPublished(document, true, true)}>↗ {tr("Publish & copy", "공개 및 복사")}</button>}<button className="document-delete" onClick={() => void deleteDocument(document)}>×</button></footer></article>)}{regularDocuments.length === 0 && <div className="documents-empty"><span>◇</span><h3>{tr("No documents yet", "아직 문서가 없습니다")}</h3><p>{tr("Create a production brief, meeting note, or team guide.", "프로덕션 브리프, 회의록 또는 팀 가이드를 만들어보세요.")}</p></div>}</section>}</div>}

      {view === "milestones" && <div className="content milestones-content">
        <div className="page-title"><div><p>{tr("ROADMAP", "로드맵")}</p><h1>{tr("Milestones", "마일스톤")}</h1><h2>{tr("Create delivery targets, track progress, and keep the whole studio aligned.", "출시 목표를 만들고 진행 상황을 추적하여 스튜디오 전체의 방향을 맞추세요.")}</h2></div><div className="milestone-page-actions"><span className={`milestone-sync-status ${milestoneSyncState}`} aria-live="polite"><i />{milestoneSyncState === "syncing" ? tr("Updating progress…", "진행률 업데이트 중…") : milestoneSyncState === "error" ? tr("Progress sync failed", "진행률 동기화 실패") : tr("Progress is live", "진행률 자동 업데이트")}</span><button className="secondary-button" disabled={milestoneSyncState === "syncing" || Boolean(session) && !currentPermissions?.edit_cards} onClick={() => void syncMilestoneProgress(true)}>↻ {tr("Recalculate", "다시 계산")}</button><button className="create-button" disabled={Boolean(session) && !currentPermissions?.edit_cards} onClick={() => openMilestoneEditor()}>＋ {tr("New milestone", "새 마일스톤")}</button></div></div>
        <div className="milestone-summary"><article><span>◆</span><div><small>{tr("TOTAL", "전체")}</small><b>{sortedMilestones.length}</b></div></article><article><span>✓</span><div><small>{tr("COMPLETED", "완료")}</small><b>{completedMilestones.length}</b></div></article><article className={overdueMilestones.length ? "warning" : ""}><span>!</span><div><small>{tr("OVERDUE", "기한 초과")}</small><b>{overdueMilestones.length}</b></div></article></div>
        <div className="timeline milestone-management-list">
          {sortedMilestones.map((milestone, index) => { const date = new Date(`${milestone.milestoneDate}T12:00:00`); const dayDelta = Math.ceil((date.getTime() - milestoneToday.getTime()) / dayMs); const timing = milestone.progress >= 100 ? tr("Completed", "완료") : dayDelta < 0 ? tr(`${Math.abs(dayDelta)} days overdue`, `${Math.abs(dayDelta)}일 기한 초과`) : dayDelta === 0 ? tr("Due today", "오늘 마감") : tr(`${dayDelta} days left`, `${dayDelta}일 남음`); return <article className={`milestone-row ${dayDelta < 0 && milestone.progress < 100 ? "overdue" : ""}`} key={milestone.id}><div className="date-token"><small>{date.getFullYear()}</small><b>{date.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US", { month:"short", day:"numeric" }).toUpperCase()}</b></div><span className={`timeline-node ${milestone.color}`}>{milestone.progress >= 100 ? "✓" : index + 1}</span><div className="milestone-card"><div className="milestone-card-head"><div><small>{milestone.stage}</small><h3>{milestone.title}</h3><p>{milestone.note || tr("No description", "설명 없음")}</p></div><div className="milestone-card-controls"><b>{milestone.progress}%</b><button onClick={() => openMilestoneEditor(milestone)} disabled={Boolean(session) && !currentPermissions?.edit_cards} aria-label={tr(`Edit ${milestone.title}`, `${milestone.title} 수정`)}>✎</button><button className="milestone-delete-button" onClick={() => void deleteMilestone(milestone)} disabled={Boolean(session) && !currentPermissions?.edit_cards} aria-label={tr(`Delete ${milestone.title}`, `${milestone.title} 삭제`)}>×</button></div></div><div className="progress-track"><span className={milestone.color} style={{width:`${milestone.progress}%`}}/></div><footer><span><b>{milestone.completedCards}</b> / {milestone.totalCards} {tr("cards", "카드")}</span><span className={dayDelta < 0 && milestone.progress < 100 ? "overdue-label" : ""}>{timing}</span></footer></div></article>})}
          {sortedMilestones.length === 0 && <div className="empty-projects milestone-empty"><span>◇</span><h3>{tr("No milestones yet", "아직 마일스톤이 없습니다")}</h3><p>{tr("Create your first delivery target to start the roadmap.", "첫 번째 출시 목표를 만들어 로드맵을 시작하세요.")}</p><button className="create-button" onClick={() => openMilestoneEditor()}>＋ {tr("New milestone", "새 마일스톤")}</button></div>}
        </div>
      </div>}

      {view === "platform-admin" && isPlatformAdmin && <PlatformAdmin session={session} language={language} onToast={setToast} />}

      {view === "waiting-list" && isWorkspaceOwner && <OwnerWaitingList session={session} language={language} activeWorkspaceId={activeWorkspaceId} disciplines={disciplines} onToast={setToast} />}

      {view === "management" && <div className="content manage-content">
        <div className="page-title"><div><p>{tr("WORKSPACE ADMIN", "워크스페이스 관리")}</p><h1>{tr("Manage", "관리")} {studioName}</h1><h2>{tr("Control your team, permissions, and workspace defaults.", "팀, 권한, 워크스페이스 기본값을 관리하세요.")}</h2></div><button className="create-button" disabled={!isWorkspaceOwner} onClick={() => setInviteOpen(true)}>＋ {tr("Add member", "멤버 추가")}</button></div>
        <div className="management-grid">
          <section className="management-card team-management"><header><div><small>TEAM & ACCESS</small><h3>{memberRoleFilter === "All" ? members.length : visibleMembers.length} {memberRoleFilter === "All" ? tr("workspace members", "명의 워크스페이스 멤버") : `${memberRoleFilter} ${tr("members", "멤버")}`}</h3>{memberRoleFilter !== "All" && <button className="role-filter" onClick={() => setMemberRoleFilter("All")}>× {tr("Clear filter", "필터 해제")}</button>}</div><button className="healthy-pill" onClick={() => setView("roles")}>{tr("View roles", "역할 보기")} →</button></header>{!isWorkspaceOwner ? <div className="access-denied"><b>{tr("Workspace access is owner-managed", "워크스페이스 권한은 소유자가 관리합니다")}</b><p>{tr("You can work with this team, but only an Owner can add people or change their workspace assignments.", "팀과 함께 작업할 수 있지만 멤버 추가와 워크스페이스 배정 변경은 소유자만 할 수 있습니다.")}</p></div> : <div className="member-list">{visibleMembers.map(member => <div className="member-row" key={member.id}><span className="member-avatar">{member.initials}</span><div className="member-identity"><b>{member.name}</b><small>{member.email}</small><label className="discipline-control"><span>{tr("Primary discipline", "주요 분야")}</span><select value={member.discipline} onChange={event => void updateMemberDiscipline(member, event.target.value)}>{disciplines.map(discipline => <option key={discipline}>{discipline}</option>)}</select></label><small className="workspace-membership-summary">{member.workspaceIds.length} {tr(member.workspaceIds.length === 1 ? "workspace" : "workspaces", "개 워크스페이스")}</small></div><span className={`member-status ${member.status.toLowerCase()}`}>{member.status}</span><span className="member-role">{member.role}</span><button className="row-menu" onClick={() => setEditMember(member)} aria-label={`Edit ${member.name}`}>✎</button></div>)}</div>}</section>
          <aside className="management-side"><section className="management-card workspace-profile-card"><small>{tr("WORKSPACE PROFILE", "워크스페이스 프로필")}</small><div className="workspace-profile-summary"><span>{activeWorkspace.initials}</span><div><b>{activeWorkspace.name}</b><small>{activeWorkspace.members} {tr("members", "명")} · {activeProjects.length} {tr("active projects", "개 활성 프로젝트")}</small></div><i>{tr("Active", "활성")}</i></div><label>{tr("Workspace name", "워크스페이스 이름")}<input disabled={!isWorkspaceOwner} value={studioName} onChange={event => setStudioName(event.target.value)} /></label><label>{tr("Default project", "기본 프로젝트")}<select disabled={!isWorkspaceOwner} value={defaultProjectId} onChange={event => setDefaultProjectId(event.target.value)}>{activeProjects.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select>{activeProjects.length === 0 && <small className="field-help">{tr("Create or restore a project to choose a default.", "기본 프로젝트를 선택하려면 프로젝트를 만들거나 복원하세요.")}</small>}</label><label className="toggle-row"><span><b>{tr("Weekly production digest", "주간 프로덕션 요약")}</b><small>{tr("Monday summary for the team", "매주 월요일 팀 요약")}</small></span><input disabled={!isWorkspaceOwner} type="checkbox" checked={weeklyDigest} onChange={event => setWeeklyDigest(event.target.checked)} /></label><button className="secondary-button full-button" disabled={!isWorkspaceOwner} onClick={saveWorkspaceSettings}>{tr("Save profile", "프로필 저장")}</button><p className="local-note">{tr("Only Owners can change workspace profile preferences. They are saved on this device.", "워크스페이스 프로필 설정은 소유자만 변경할 수 있으며 현재 기기에 저장됩니다.")}</p></section><section className="management-card discipline-manager-card"><header><div><small>{tr("PRIMARY DISCIPLINES", "주요 분야")}</small><h3>{tr("Manage disciplines", "분야 관리")}</h3></div><span>{disciplines.length}</span></header><form className="discipline-add-form" onSubmit={addDiscipline}><input value={newDiscipline} onChange={event => setNewDiscipline(event.target.value)} placeholder={tr("New discipline", "새 분야")} aria-label={tr("New discipline name", "새 분야 이름")} /><button type="submit" disabled={!newDiscipline.trim() || (Boolean(session) && !currentPermissions?.workspace_settings)}>＋ {tr("Add", "추가")}</button></form><div className="discipline-list">{disciplines.map(name => editingDiscipline === name ? <form className="discipline-edit-row" key={name} onSubmit={event => { event.preventDefault(); void renameDiscipline(name); }}><input value={editedDiscipline} onChange={event => setEditedDiscipline(event.target.value)} autoFocus aria-label={tr(`Rename ${name}`, `${name} 이름 변경`)} /><button type="submit">{tr("Save", "저장")}</button><button type="button" onClick={() => setEditingDiscipline(null)}>×</button></form> : <article key={name}><span>{name.slice(0,1).toUpperCase()}</span><div><b>{name}</b><small>{members.filter(member => member.discipline === name).length} {tr("members", "명")}</small></div><button onClick={() => { setEditingDiscipline(name); setEditedDiscipline(name); }} disabled={name === "General" || (Boolean(session) && !currentPermissions?.workspace_settings)} aria-label={tr(`Edit ${name}`, `${name} 수정`)}>✎</button><button className="discipline-delete" onClick={() => void deleteDiscipline(name)} disabled={name === "General" || (Boolean(session) && !currentPermissions?.workspace_settings)} aria-label={tr(`Delete ${name}`, `${name} 삭제`)}>×</button></article>)}</div><p className="local-note">{tr("Renaming or deleting updates every assigned member. General cannot be deleted.", "이름 변경이나 삭제 시 배정된 모든 멤버가 업데이트됩니다. General은 삭제할 수 없습니다.")}</p></section><section className="management-card workspace-directory-card"><header><div><small>{tr("YOUR WORKSPACES", "내 워크스페이스")}</small><h3>{tr("Manage workspaces", "워크스페이스 관리")}</h3></div><button onClick={() => setCreateWorkspaceOpen(true)} disabled={!isWorkspaceOwner}>＋ {tr("New", "추가")}</button></header><div className="workspace-admin-list">{workspaces.map(workspace => <article className={workspace.status === "Archived" ? "archived" : ""} key={workspace.id}><span>{workspace.initials}</span><div><b>{workspace.name}</b><small>{workspace.members} {tr("members", "명")} · {tr(workspace.status, workspace.status === "Active" ? "활성" : "보관됨")}</small></div><div className="workspace-admin-actions"><button disabled={!isWorkspaceOwner} onClick={() => void setWorkspaceStatus(workspace, workspace.status === "Active" ? "Archived" : "Active")}>{workspace.status === "Active" ? tr("Archive", "보관") : tr("Restore", "복원")}</button><button className="delete-workspace-button" disabled={workspaces.length <= 1 || !isWorkspaceOwner} onClick={() => void deleteWorkspace(workspace)}>{tr("Delete", "삭제")}</button></div></article>)}</div><p className="workspace-safety-note">{tr("Archived workspaces can be restored. Permanent deletion is limited to workspace owners.", "보관된 워크스페이스는 복원할 수 있습니다. 영구 삭제는 워크스페이스 소유자만 가능합니다.")}</p></section></aside>
        </div>
      </div>}

      {view === "projects-management" && <div className="content projects-admin-content"><div className="page-title"><div><p>{tr("PORTFOLIO", "포트폴리오")}</p><h1>{tr("Manage projects", "프로젝트 관리")}</h1><h2>{tr("Create, organize, and monitor every stream of studio work.", "스튜디오의 모든 작업을 만들고 정리하고 모니터링하세요.")}</h2></div><button className="create-button" disabled={Boolean(session) && !currentPermissions?.workspace_settings} onClick={() => setCreateProjectOpen(true)}>＋ {tr("New project", "새 프로젝트")}</button></div><div className="project-admin-toolbar"><div>{["All","Active","On hold","Archived"].map(status => <button className={projectStatusFilter === status ? "active" : ""} onClick={() => setProjectStatusFilter(status)} key={status}>{status === "All" ? tr("All", "전체") : statusLabel(status as Project["status"])}<span>{status === "All" ? projects.length : projects.filter(item => item.status === status).length}</span></button>)}</div><label>⌕ <input value={projectSearch} onChange={event => setProjectSearch(event.target.value)} placeholder={tr("Search projects…", "프로젝트 검색…")} /></label></div><section className="project-admin-list">{visibleProjects.map(item => <article className="project-admin-card" key={item.id}><span className={`project-color ${item.color}`} /><div className="project-main"><header><div><small>{statusLabel(item.status)}</small><h3>{item.name}</h3></div><button onClick={() => setEditProject(item)} aria-label={`Edit ${item.name}`}>✎</button></header><p><span className="member-avatar">{item.owner.split(/\s+/).map(part => part[0]).join("")}</span> {tr("Led by", "담당")} {item.owner}</p><div className="project-progress"><div><span style={{width:`${item.progress}%`}} /></div><b>{item.progress}%</b></div><footer><span><b>{item.count}</b> {tr("cards", "카드")}</span><span>{tr("Updated", "업데이트")} {item.updated}</span></footer></div><aside>{item.status !== "Archived" && <button onClick={() => { setProject(item.name); setView("quests"); }}>{tr("Open board", "보드 열기")} →</button>}<button onClick={() => setEditProject(item)}>✎ {tr("Edit project", "프로젝트 수정")}</button><button onClick={() => void toggleProjectArchive(item)}>{item.status === "Archived" ? tr("Restore project", "프로젝트 복원") : tr("Archive project", "프로젝트 보관")}</button>{item.status === "Archived" && <button className="project-delete-button" disabled={Boolean(session) && !currentPermissions?.workspace_settings} onClick={() => void deleteArchivedProject(item)}>× {tr("Delete permanently", "영구 삭제")}</button>}</aside></article>)}</section>{visibleProjects.length === 0 && <div className="empty-projects"><span>◇</span><h3>{tr("No projects here", "프로젝트가 없습니다")}</h3><p>{tr("Change the filter or create a new project.", "필터를 변경하거나 새 프로젝트를 만드세요.")}</p></div>}</div>}

      {view === "roles" && <div className="content roles-content"><div className="page-title"><div><p>{tr("PERMISSIONS", "권한")}</p><h1>{tr("Roles & access", "역할 및 권한")}</h1><h2>{tr("Choose what each teammate can see, change, and manage.", "각 팀원이 보고 변경하고 관리할 수 있는 항목을 설정하세요.")}</h2></div><button className="secondary-button" disabled={!isWorkspaceOwner} onClick={() => { setView("management"); setInviteOpen(true); }}>＋ {tr("Assign a role", "역할 지정")}</button></div><div className="role-cards">{roleDefinitions.map(role => { const roleCount = members.filter(member => member.role === role.name).length; return <article className="role-card" key={role.name}><span className={`role-icon ${role.color}`}>{role.name[0]}</span><div><small>{roleCount} {tr(roleCount === 1 ? "PERSON" : "PEOPLE", "명")}</small><h3>{role.name}</h3><p>{role.description}</p></div><button onClick={() => { setMemberRoleFilter(role.name); setView("management"); }}>{tr("View members", "멤버 보기")} →</button></article>; })}</div><section className="management-card permission-matrix"><header><div><small>{tr("ACCESS MATRIX", "권한 매트릭스")}</small><h3>{tr("Role permissions", "역할 권한")}</h3></div><span>{isWorkspaceOwner ? tr("Click a permission to change it", "권한을 클릭하여 변경하세요") : `${tr("Changes apply across", "적용 대상")} ${activeWorkspace.name}`}</span></header><div className="matrix-row matrix-head"><b>{tr("Capability", "기능")}</b>{roleDefinitions.map(role => <b key={role.name}>{role.name}</b>)}</div>{permissionRows.map(permission => <div className="matrix-row" key={permission.key}><span>{tr(permission.english,permission.korean)}</span>{roleDefinitions.map(role => <button className={`permission-toggle ${role.permissions[permission.key] ? "allowed" : "denied"}`} disabled={role.name === "Owner" || permission.key === "manage_members" || !isWorkspaceOwner} onClick={() => void toggleRolePermission(role.name, permission.key)} aria-label={`${role.name}: ${permission.english}`} key={role.name}>{role.permissions[permission.key] ? "✓" : "—"}</button>)}</div>)}</section></div>}

      {view === "account" && <div className="content account-content">
        <div className="page-title"><div><p>{tr("PERSONAL SETTINGS", "개인 설정")}</p><h1>{tr("My account", "내 계정")}</h1><h2>{tr("Your identity, preferences, and active access.", "계정 정보, 환경설정, 접근 권한을 관리하세요.")}</h2></div><button className="secondary-button signout-link" onClick={() => session ? void supabase.auth.signOut() : setAuthOpen(true)}>{session ? tr("Sign out", "로그아웃") : tr("Sign in", "로그인")}</button></div>
        <div className="account-grid"><section className="management-card account-hero"><div className="account-avatar">{accountInitials}</div><div><small>{session ? tr("SIGNED IN WITH SUPABASE", "SUPABASE로 로그인됨") : tr("SIGN IN TO EDIT", "수정하려면 로그인하세요")}</small><h2>{accountName}</h2><p>{accountEmail ?? tr("Secure workspace account", "안전한 워크스페이스 계정")}</p><span className="verified-badge">{session ? "✓ " + tr("Verified identity", "인증된 계정") : tr("Read-only access", "읽기 전용")}</span></div><button className="account-edit-name" onClick={() => session ? setNameEditorOpen(true) : setAuthOpen(true)}>✎ {tr("Edit name", "이름 수정")}</button></section><section className="management-card account-details"><small>{tr("ACCOUNT DETAILS", "계정 정보")}</small><div className="detail-line"><span>{tr("Email", "이메일")}</span><b>{accountEmail ?? tr("Not signed in", "로그인하지 않음")}</b></div><div className="detail-line"><span>{tr("Workspace role", "워크스페이스 역할")}</span><b>{currentMember?.role ?? "Owner"}</b></div><div className="detail-line discipline-detail"><span>{tr("Primary discipline", "주요 분야")}</span>{currentMember ? <select value={currentMember.discipline} onChange={event => void updateMemberDiscipline(currentMember, event.target.value)}>{disciplines.map(discipline => <option key={discipline}>{discipline}</option>)}</select> : <b>Production</b>}</div><div className="detail-line"><span>{tr("Access", "접근 권한")}</span><b>{session ? tr("All projects", "모든 프로젝트") : tr("View only", "보기 전용")}</b></div></section><section className="management-card account-preferences"><small>NOTIFICATIONS</small><label className="toggle-row"><span><b>Assigned card updates</b><small>Changes to cards you own</small></span><input type="checkbox" defaultChecked /></label><label className="toggle-row"><span><b>Milestone reminders</b><small>Three days before deadlines</small></span><input type="checkbox" defaultChecked /></label><label className="toggle-row"><span><b>Studio activity</b><small>Daily collaboration summary</small></span><input type="checkbox" /></label></section><section className="management-card sessions-card"><small>SECURITY</small><h3>{session ? tr("Active session", "활성 세션") : tr("No active session", "활성 세션 없음")}</h3><p>{session ? tr("Signed in through Supabase · Current browser", "Supabase로 로그인 · 현재 브라우저") : tr("Sign in to create and edit shared cards.", "공유 카드를 만들고 수정하려면 로그인하세요.")}</p><span className="healthy-pill">{session ? tr("Protected", "보호됨") : tr("Read only", "읽기 전용")}</span></section></div>
      </div>}
    </section>
    {createOpen && <div className="modal-backdrop" onMouseDown={() => setCreateOpen(false)}><section className="modal create-modal card-form-modal card-planner-modal" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Create a card"><header className="card-planner-header"><span className="card-planner-icon">＋</span><div><small>{tr("NEW QUEST", "새 퀘스트")}</small><h2>{tr("Create a production card", "프로덕션 카드 만들기")}</h2><p>{tr("Define the work, assign it, and set its place in the schedule.", "작업을 정의하고 담당자와 일정을 설정하세요.")}</p></div><button onClick={() => setCreateOpen(false)} aria-label="Close">×</button></header><form onSubmit={createCard}>
      <section className="card-form-section card-form-essentials"><div className="card-form-section-title"><span>1</span><div><b>{tr("The work", "작업 내용")}</b><small>{tr("Give the team a clear outcome.", "팀이 이해할 수 있는 명확한 결과를 적으세요.")}</small></div></div><label>{tr("Card title", "카드 제목")}<input name="title" required autoFocus value={createDraftTitle} onChange={event => setCreateDraftTitle(event.target.value)} placeholder={tr("What needs to happen?", "어떤 작업이 필요한가요?")}/></label><label>{tr("Description", "설명")}<textarea name="description" value={createDraftDescription} onChange={event => setCreateDraftDescription(event.target.value)} placeholder={tr("Add context, goals, or acceptance notes…", "배경, 목표 또는 완료 조건을 입력하세요…")}/></label></section>
      <div className="card-form-columns"><section className="card-form-section"><div className="card-form-section-title"><span>2</span><div><b>{tr("Assignment", "배정")}</b><small>{tr("Place the card with the right team.", "알맞은 팀과 담당자에게 배정하세요.")}</small></div></div><label className="discipline-field">{tr("Production discipline", "프로덕션 분야")}<span><select name="tag">{productionDisciplines.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}</select><button type="button" onClick={() => setDisciplineManagerOpen(true)}>⚙ {tr("Manage", "관리")}</button></span></label><div className="card-form-pair"><label>{tr("Project", "프로젝트")}<select name="project" defaultValue={defaultProjectName}>{activeProjects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select></label><label>{tr("Column", "열")}<select value={createStatus} onChange={event => setCreateStatus(event.target.value as Status)}>{productionStages.map(status => <option value={status} key={status}>{columnNames[status] || statusLabel(status)}</option>)}</select></label></div><label>{tr("Primary owner", "주 담당자")}<select value={createOwner} onChange={event => { setCreateOwner(event.target.value); setCreateCollaborators(current => current.filter(initials => initials !== event.target.value)); }}>{activeCardOwners.map(member => <option value={member.initials} key={member.id}>{member.name} · {member.discipline}</option>)}</select></label><CoworkerPicker members={activeCardOwners} owner={createOwner} selected={createCollaborators} onChange={setCreateCollaborators} label={tr("Co-workers", "공동 담당자")} hint={tr("Select everyone helping with this card.", "이 카드를 함께 작업할 멤버를 선택하세요.")} /></section>
      <section className="card-form-section"><div className="card-form-section-title"><span>3</span><div><b>{tr("Plan", "계획")}</b><small>{tr("Set timing, effort, and urgency.", "일정, 작업량, 우선순위를 설정하세요.")}</small></div></div><div className="card-form-pair"><label className="date-field">{tr("Start date", "시작일")}<span><input type="date" value={createStartDate} max={createDueDate || undefined} onChange={event => setCreateStartDate(event.target.value)}/>{createStartDate && <button type="button" onClick={() => setCreateStartDate("")} aria-label={tr("Clear start date", "시작일 삭제")}>×</button>}</span></label><label className="date-field">{tr("Due date", "마감일")}<span><input type="date" value={createDueDate} min={createStartDate || undefined} onChange={event => setCreateDueDate(event.target.value)}/>{createDueDate && <button type="button" onClick={() => setCreateDueDate("")} aria-label={tr("Clear due date", "마감일 삭제")}>×</button>}</span></label></div><label className="range-field card-range"><span><i>◆</i><b>{tr("Effort", "작업량")}</b><strong>{createEffort}<small>/10</small></strong></span><input type="range" min="1" max="10" value={createEffort} style={{"--range-progress":`${(createEffort - 1) / 9 * 100}%`} as CSSProperties} onChange={event => setCreateEffort(Number(event.target.value))}/><em>{tr("Quick", "간단")}</em><em>{tr("Large", "큼")}</em></label><label className={`range-field card-range priority-range ${priorityTone(createPriority)}`}><span><i>!</i><b>{tr("Priority", "우선순위")}</b><strong>{createPriority}<small>/10</small></strong></span><input type="range" min="1" max="10" value={createPriority} style={{"--range-progress":`${(createPriority - 1) / 9 * 100}%`} as CSSProperties} onChange={event => setCreatePriority(Number(event.target.value))}/><em>{tr("Normal", "보통")}</em><em>{createPriority >= 8 ? tr("Critical", "긴급") : createPriority >= 5 ? tr("High", "높음") : tr("Normal", "보통")}</em></label></section></div>
      <footer className="card-planner-footer"><p><span>✓</span>{tr("Changes save to the shared workspace.", "변경 사항은 공유 워크스페이스에 저장됩니다.")}</p><div><button type="button" onClick={() => setCreateOpen(false)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">＋ {tr("Create card", "카드 만들기")}</button></div></footer>
    </form></section></div>}

    {editColumn && <div className="modal-backdrop" onMouseDown={() => setEditColumn(null)}><section className="modal create-modal column-edit-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Rename column", "열 이름 변경")}><header><div><small>{tr("BOARD SETTINGS", "보드 설정")}</small><h2>{tr("Rename column", "열 이름 변경")}</h2></div><button onClick={() => setEditColumn(null)} aria-label="Close">×</button></header><form onSubmit={renameColumn}><label>{tr("Column name", "열 이름")}<input name="name" required autoFocus defaultValue={columnNames[editColumn] || statusLabel(editColumn)} maxLength={30} /></label><p className="form-help">{tr("This changes the label on this device; cards still keep their workflow stage.", "이 기기에서 표시되는 이름만 변경되며 카드의 작업 단계는 유지됩니다.")}</p><footer><button type="button" onClick={() => setEditColumn(null)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Save name", "이름 저장")}</button></footer></form></section></div>}

    {inviteOpen && <div className="modal-backdrop" onMouseDown={() => setInviteOpen(false)}><section className="modal create-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add a workspace member"><header><div><small>{tr("TEAM ACCESS", "팀 권한")}</small><h2>{tr("Add a member", "멤버 추가")}</h2></div><button onClick={() => setInviteOpen(false)} aria-label="Close">×</button></header><form onSubmit={inviteMember}><label>{tr("Name", "이름")}<input name="name" placeholder={tr("Teammate name", "팀원 이름")} /></label><label>{tr("Email", "이메일")}<input name="email" type="email" required autoFocus placeholder="name@studio.com" /></label><label>{tr("Primary discipline", "주요 분야")}<select name="discipline" defaultValue="General">{disciplines.map(discipline => <option key={discipline}>{discipline}</option>)}</select></label><label>{tr("Workspace role", "워크스페이스 역할")}<select name="role"><option>Member</option><option>Team Leader</option><option>Admin</option><option>Guest</option></select></label><fieldset className="workspace-assignment-fieldset"><legend>{tr("Workspace access", "워크스페이스 접근")}</legend><p>{tr("Choose every workspace this person can see and use.", "이 멤버가 보고 사용할 수 있는 모든 워크스페이스를 선택하세요.")}</p><div>{workspaces.filter(workspace => workspace.status === "Active").map(workspace => <label key={workspace.id}><input type="checkbox" name="workspaceIds" value={workspace.id} defaultChecked={workspace.id === activeWorkspaceId} /><span>{workspace.initials}</span><b>{workspace.name}</b></label>)}</div></fieldset><div className="invite-note"><b>{tr("Access preview", "권한 미리보기")}</b><p>{tr("This email is added to workspace access. When that person signs in with the same email, their assigned role becomes active.", "이 이메일을 워크스페이스 권한에 추가합니다. 해당 사용자가 같은 이메일로 로그인하면 지정된 역할이 활성화됩니다.")}</p></div><footer><button type="button" onClick={() => setInviteOpen(false)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Add member", "멤버 추가")}</button></footer></form></section></div>}

    {createWorkspaceOpen && <div className="modal-backdrop" onMouseDown={() => setCreateWorkspaceOpen(false)}><section className="modal create-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Create workspace"><header><div><small>{tr("NEW SPACE", "새 공간")}</small><h2>{tr("Create a workspace", "워크스페이스 만들기")}</h2></div><button onClick={() => setCreateWorkspaceOpen(false)} aria-label="Close">×</button></header><form onSubmit={createWorkspace}><label>{tr("Workspace name", "워크스페이스 이름")}<input name="name" required autoFocus placeholder={tr("Your studio or team", "스튜디오 또는 팀 이름")} /></label><div className="invite-note"><b>{tr("A fresh deck", "새로운 덱")}</b><p>{tr("Your new workspace starts with its own members, projects, and production settings.", "새 워크스페이스는 독립적인 멤버, 프로젝트, 프로덕션 설정으로 시작합니다.")}</p></div><footer><button type="button" onClick={() => setCreateWorkspaceOpen(false)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Create workspace", "워크스페이스 만들기")}</button></footer></form></section></div>}

    {createProjectOpen && <div className="modal-backdrop" onMouseDown={() => setCreateProjectOpen(false)}><section className="modal create-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Create project"><header><div><small>{tr("NEW PROJECT", "새 프로젝트")}</small><h2>{tr("Start a project", "프로젝트 시작")}</h2></div><button onClick={() => setCreateProjectOpen(false)} aria-label="Close">×</button></header><form onSubmit={createProject}><label>{tr("Project name", "프로젝트 이름")}<input name="name" required autoFocus placeholder={tr("Project name", "프로젝트 이름")} /></label><label>{tr("Project lead", "프로젝트 리드")}<select name="owner">{members.filter(member => member.status === "Active").map(member => <option key={member.id}>{member.name}</option>)}</select></label><label>{tr("Starting template", "시작 템플릿")}<select><option>{tr("Game production", "게임 프로덕션")}</option><option>{tr("Marketing campaign", "마케팅 캠페인")}</option><option>{tr("Studio operations", "스튜디오 운영")}</option><option>{tr("Blank project", "빈 프로젝트")}</option></select></label><footer><button type="button" onClick={() => setCreateProjectOpen(false)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Create project", "프로젝트 만들기")}</button></footer></form></section></div>}

    {editProject && <div className="modal-backdrop" onMouseDown={() => setEditProject(null)}><section className="modal create-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Edit project", "프로젝트 수정")}><header><div><small>{tr("PROJECT SETTINGS", "프로젝트 설정")}</small><h2>{tr("Edit project", "프로젝트 수정")}</h2></div><button onClick={() => setEditProject(null)} aria-label="Close">×</button></header><form onSubmit={saveProjectEdits}><label>{tr("Project name", "프로젝트 이름")}<input name="name" required autoFocus defaultValue={editProject.name} /></label><div className="form-row"><label>{tr("Project lead", "프로젝트 리드")}<select name="owner" defaultValue={editProject.owner}>{members.filter(member => member.status === "Active").map(member => <option key={member.id}>{member.name}</option>)}</select></label><label>{tr("Status", "상태")}<select name="status" defaultValue={editProject.status}><option>Active</option><option>On hold</option><option>Archived</option></select></label></div><div className="form-row"><label>{tr("Progress", "진행률")}<input name="progress" type="number" min="0" max="100" defaultValue={editProject.progress} /></label><label>{tr("Color", "색상")}<select name="color" defaultValue={editProject.color}><option value="purple">Purple</option><option value="yellow">Yellow</option><option value="blue">Blue</option></select></label></div><footer><button type="button" onClick={() => setEditProject(null)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Save project", "프로젝트 저장")}</button></footer></form></section></div>}

    {archiveOpen && <div className="modal-backdrop" onMouseDown={() => setArchiveOpen(false)}><section className="modal create-modal archive-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Archived cards", "보관된 카드")}><header><div><small>{tr("RECOVERABLE FOLDER", "복원 가능한 보관함")}</small><h2>{tr("Archived cards", "보관된 카드")} <span>{archivedCards.length}</span></h2></div><button onClick={() => setArchiveOpen(false)} aria-label="Close">×</button></header><p className="archive-help">{tr("Archived cards stay out of the board, timeline, totals, and milestones until you restore them.", "보관된 카드는 복원할 때까지 보드, 타임라인, 집계 및 마일스톤에서 제외됩니다.")}</p><div className="archive-card-list">{archivedCards.map(card => <article key={card.id}><i className={card.color}/><div><small>{card.project} · {statusLabel(card.status)}</small><b>{card.title}</b><span>{card.tag} · {tr("Due", "마감")} {card.due}</span></div><button className="archive-restore-button" onClick={() => void setCardArchived(card, false)}>↺ {tr("Restore", "복원")}</button><button className="archive-delete-button" onClick={() => void deleteCard(card)} aria-label={tr(`Delete ${card.title}`, `${card.title} 삭제`)}>×</button></article>)}{archivedCards.length === 0 && <div className="archive-empty"><span>▣</span><b>{tr("Your archive is empty", "보관함이 비어 있습니다")}</b><p>{tr("Drag a board card to Archive and it will appear here.", "보드 카드를 보관 영역으로 끌면 여기에 표시됩니다.")}</p></div>}</div></section></div>}
    {backupOpen && <div className="modal-backdrop" onMouseDown={() => setBackupOpen(false)}><section className="modal create-modal backup-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Workspace backup", "워크스페이스 백업")}><header><div><small>{tr("WORKSPACE SAFETY", "워크스페이스 안전 관리")}</small><h2>{tr("Full backup & restore", "전체 백업 및 복원")}</h2></div><button onClick={() => setBackupOpen(false)} aria-label="Close">×</button></header><p>{tr("Download one private, portable copy of all Questdeck workspace data. Attached document images are embedded in the file too.", "Questdeck 워크스페이스의 모든 데이터를 하나의 비공개 휴대용 파일로 다운로드하세요. 문서 첨부 이미지도 파일에 포함됩니다.")}</p><div className="backup-coverage"><span>{tr("Cards & subtasks", "카드 및 하위 작업")}</span><span>{tr("Projects & milestones", "프로젝트 및 마일스톤")}</span><span>{tr("Members & roles", "멤버 및 역할")}</span><span>{tr("Documents & images", "문서 및 이미지")}</span><span>{tr("Workspace settings", "워크스페이스 설정")}</span></div><div className="backup-options"><article><span>⇩</span><div><b>{tr("Download all workspace data", "모든 워크스페이스 데이터 다운로드")}</b><small>{tr(`${cards.length} cards · ${projects.length} projects · ${documents.length} documents`, `카드 ${cards.length}개 · 프로젝트 ${projects.length}개 · 문서 ${documents.length}개`)}</small></div><button className="create-button" disabled={backupBusy} onClick={() => void downloadWorkspaceBackup()}>{backupBusy ? tr("Preparing…", "준비 중…") : tr("Download all", "전체 다운로드")}</button></article><article><span>↺</span><div><b>{tr("Restore a board backup", "보드 백업 복원")}</b><small>{tr("Imports cards and subtasks from existing Questdeck board backups without deleting newer cards.", "기존 Questdeck 보드 백업에서 카드와 하위 작업을 가져오며 새 카드는 삭제하지 않습니다.")}</small></div><button className="secondary-button" disabled={backupBusy} onClick={() => backupInputRef.current?.click()}>{backupBusy ? tr("Working…", "작업 중…") : tr("Choose file", "파일 선택")}</button><input ref={backupInputRef} type="file" accept="application/json,.json" onChange={event => void restoreBoardBackup(event)} /></article></div><footer><small>✓ {tr("No passwords or sign-in tokens are included", "비밀번호나 로그인 토큰은 포함되지 않습니다")}</small><button onClick={() => setBackupOpen(false)}>{tr("Done", "완료")}</button></footer></section></div>}

    {milestoneEditorOpen && <div className="modal-backdrop" onMouseDown={() => { setMilestoneEditorOpen(false); setEditingMilestone(null); }}><section className="modal create-modal milestone-editor-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={editingMilestone ? tr("Edit milestone", "마일스톤 수정") : tr("Create milestone", "마일스톤 만들기")}><header><div><small>{tr("ROADMAP TARGET", "로드맵 목표")}</small><h2>{editingMilestone ? tr("Edit milestone", "마일스톤 수정") : tr("New milestone", "새 마일스톤")}</h2></div><button onClick={() => { setMilestoneEditorOpen(false); setEditingMilestone(null); }} aria-label="Close">×</button></header><form onSubmit={saveMilestone}><label>{tr("Milestone title", "마일스톤 제목")}<input name="title" required autoFocus maxLength={200} defaultValue={editingMilestone?.title ?? ""} placeholder={tr("What are you shipping?", "어떤 목표를 출시하나요?")} /></label><div className="form-row"><label>{tr("Target date", "목표 날짜")}<input name="milestoneDate" type="date" required value={milestoneDraftDate} onChange={event => setMilestoneDraftDate(event.target.value)} /></label><label>{tr("Stage", "단계")}<input name="stage" required maxLength={80} list="milestone-stage-presets" defaultValue={editingMilestone?.stage ?? "UP NEXT"} placeholder={tr("Type any stage", "원하는 단계를 입력하세요")} /><datalist id="milestone-stage-presets"><option value="UP NEXT" /><option value="PRODUCTION" /><option value="REVIEW" /><option value="RELEASE" /><option value="COMPLETE" /></datalist><small className="field-help">{tr("Choose a suggestion or type your own stage.", "추천 단계를 선택하거나 직접 입력할 수 있습니다.")}</small></label></div><label>{tr("Description", "설명")}<textarea name="note" maxLength={1000} defaultValue={editingMilestone?.note ?? ""} placeholder={tr("Define the delivery target and success criteria…", "출시 목표와 성공 조건을 입력하세요…")} /></label><section className="milestone-auto-panel" aria-live="polite"><header><span>✦</span><div><b>{tr("Automatic progress", "자동 진행률")}</b><small>{tr("Active-project cards due by this target date", "이 목표일까지 마감되는 활성 프로젝트 카드")}</small></div></header><div><article><small>{tr("PROGRESS", "진행률")}</small><b>{milestoneDraftStats.progress}%</b></article><article><small>{tr("COMPLETED", "완료")}</small><b>{milestoneDraftStats.completedCards}</b></article><article><small>{tr("TOTAL CARDS", "전체 카드")}</small><b>{milestoneDraftStats.totalCards}</b></article></div><p>{milestoneDraftStats.unscheduledCards > 0 ? tr(`${milestoneDraftStats.unscheduledCards} cards without a due date are not included.`, `마감일이 없는 카드 ${milestoneDraftStats.unscheduledCards}개는 포함되지 않습니다.`) : tr("Every active card has a due date and is eligible for tracking.", "모든 활성 카드에 마감일이 있어 자동 추적할 수 있습니다.")}</p></section><fieldset className="milestone-color-picker"><legend>{tr("Milestone color", "마일스톤 색상")}</legend>{(["violet", "mint", "coral", "blue", "amber", "rose"] as Milestone["color"][]).map(color => <label key={color}><input type="radio" name="color" value={color} defaultChecked={(editingMilestone?.color ?? "violet") === color} /><span className={`milestone-color-swatch ${color}`} /><b>{tr(({violet:"Violet",mint:"Mint",coral:"Coral",blue:"Blue",amber:"Amber",rose:"Rose"})[color], ({violet:"보라",mint:"민트",coral:"코랄",blue:"파랑",amber:"호박",rose:"장미"})[color])}</b></label>)}</fieldset><footer className="milestone-editor-footer">{editingMilestone ? <button className="danger-button" type="button" onClick={() => void deleteMilestone(editingMilestone)}>{tr("Delete milestone", "마일스톤 삭제")}</button> : <span />}<div><button type="button" onClick={() => { setMilestoneEditorOpen(false); setEditingMilestone(null); }}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{editingMilestone ? tr("Save changes", "변경 저장") : tr("Create milestone", "마일스톤 만들기")}</button></div></footer></form></section></div>}

    {editMember && <div className="modal-backdrop" onMouseDown={() => setEditMember(null)}><section className="modal create-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Edit member", "멤버 수정")}><header><div><small>{tr("MEMBER ACCESS", "멤버 권한")}</small><h2>{tr("Edit member", "멤버 수정")}</h2></div><button onClick={() => setEditMember(null)} aria-label="Close">×</button></header><form onSubmit={saveMemberEdits}><label>{tr("Name", "이름")}<input name="name" required autoFocus defaultValue={editMember.name} /></label><label>{tr("Email", "이메일")}<input name="email" type="email" required defaultValue={editMember.email} /></label><div className="form-row"><label>{tr("Primary discipline", "주요 분야")}<select name="discipline" required defaultValue={editMember.discipline}>{disciplines.map(discipline => <option key={discipline}>{discipline}</option>)}</select></label><label>{tr("Status", "상태")}<select name="status" defaultValue={editMember.status}><option>Active</option><option>Invited</option></select></label></div><label>{tr("Workspace role", "워크스페이스 역할")}<select name="role" defaultValue={editMember.role} disabled={editMember.role === "Owner"}><option>Owner</option><option>Admin</option><option>Team Leader</option><option>Member</option><option>Guest</option></select>{editMember.role === "Owner" && <input type="hidden" name="role" value="Owner" />}</label><fieldset className="workspace-assignment-fieldset" disabled={editMember.role === "Owner"}><legend>{tr("Workspace access", "워크스페이스 접근")}</legend><p>{editMember.role === "Owner" ? tr("Owners keep access to every workspace.", "소유자는 모든 워크스페이스 접근 권한을 유지합니다.") : tr("This person will only see the selected workspaces.", "이 멤버는 선택한 워크스페이스만 볼 수 있습니다.")}</p><div>{workspaces.map(workspace => <label key={workspace.id}><input type="checkbox" name="workspaceIds" value={workspace.id} defaultChecked={editMember.role === "Owner" || editMember.workspaceIds.includes(workspace.id)} /><span>{workspace.initials}</span><b>{workspace.name}</b></label>)}</div></fieldset><footer className="member-edit-footer">{editMember.role !== "Owner" ? <button className="danger-button" type="button" onClick={() => void removeMember(editMember)}>{tr("Remove member", "멤버 삭제")}</button> : <span />}<div><button type="button" onClick={() => setEditMember(null)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Save member", "멤버 저장")}</button></div></footer></form></section></div>}

    {selected && !editCardOpen && <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><section className="modal detail-modal" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={selected.title}><div className={`detail-banner ${selected.color}`}><span>{selected.tag}</span><b className={`priority-detail ${priorityTone(selected.priority)}`}>P{selected.priority}</b><b>{selected.points}</b></div><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button><div className="detail-content"><div className="detail-title-row"><div><small>{selected.project.toUpperCase()}</small><h2>{selected.title}</h2></div><button className="edit-card-button" onClick={() => openCardEditor(selected)}>✎ {tr("Edit card", "카드 수정")}</button></div><p>{selected.description}</p><div className="detail-grid"><div><small>{tr("PRIMARY OWNER", "주 담당자")}</small><b><span className="avatar">{selected.owner}</span> {selectedOwner?.name ?? tr("Unassigned", "담당자 없음")}</b></div><div><small>{tr("DUE", "마감")}</small><b>◷ {selected.due}</b></div><div><small>{tr("PRIORITY", "우선순위")}</small><b className={`priority-text ${priorityTone(selected.priority)}`}>P{selected.priority}</b></div></div><section className="detail-coworkers"><header><small>{tr("CO-WORKERS", "공동 담당자")}</small><b>{selectedCollaborators.length}</b></header>{selectedCollaborators.length > 0 ? <div>{selectedCollaborators.map(({ initials, member }) => <span key={initials}><i>{initials}</i><b>{member?.name ?? initials}</b><small>{member?.discipline ?? tr("Workspace member", "워크스페이스 멤버")}</small></span>)}</div> : <p>{tr("No co-workers assigned to this card.", "이 카드에 지정된 공동 담당자가 없습니다.")}</p>}</section><label>{tr("Status", "상태")}<select value={selected.status} onChange={e => updateStatus(selected, e.target.value as Status)}>{productionStages.map(s => <option value={s} key={s}>{statusLabel(s)}</option>)}</select></label><div className="subtodo-section"><header><div><small>{tr("SUB-TASKS", "하위 작업")}</small><b>{completedSubTodos}/{selectedTodos.length}</b></div>{selectedTodos.length > 0 && <div className="subtodo-progress"><span style={{width:`${Math.round((completedSubTodos / selectedTodos.length) * 100)}%`}} /></div>}</header><div className="subtodo-list">{selectedTodos.map(todo => <div className={`subtodo-row ${todo.done ? "done" : ""}`} key={todo.id}><button className="subtodo-check" onClick={() => toggleSubTodo(selected.id, todo.id)} aria-label={todo.done ? tr("Mark incomplete", "미완료로 표시") : tr("Mark complete", "완료로 표시")}>{todo.done ? "✓" : ""}</button><span>{todo.text}</span><button className="subtodo-remove" onClick={() => removeSubTodo(selected.id, todo.id)} aria-label={tr("Remove sub-task", "하위 작업 삭제")}>×</button></div>)}{selectedTodos.length === 0 && <p className="subtodo-empty">{tr("No sub-tasks yet. Break this card into smaller steps.", "아직 하위 작업이 없습니다. 카드를 더 작은 단계로 나눠보세요.")}</p>}</div><form className="subtodo-form" onSubmit={addSubTodo}><input name="subTodo" placeholder={tr("Add a sub-task…", "하위 작업 추가…")} aria-label={tr("New sub-task", "새 하위 작업")} /><button type="submit">＋ {tr("Add", "추가")}</button></form></div></div></section></div>}
    {selected && !editCardOpen && <button className={`hero-panel-toggle ${hasHeroMarker(selectedRawTodos) ? "active" : ""}`} onClick={() => setHeroPanelOpen(open => !open)} aria-expanded={heroPanelOpen}>★ {hasHeroMarker(selectedRawTodos) ? tr("Hero journey", "Hero 여정") : tr("Hero & sub-cards", "Hero 및 하위 카드")}</button>}
    {selected && !editCardOpen && heroPanelOpen && <aside className="hero-card-panel" aria-label={tr("Hero card and sub-cards", "Hero 카드 및 하위 카드")}><header><div><small>{tr("HERO JOURNEY", "HERO 여정")}</small><h3>{selected.title}</h3></div><button onClick={() => setHeroPanelOpen(false)} aria-label={tr("Close Hero panel", "Hero 패널 닫기")}>×</button></header>{selectedHeroParent && <button className="hero-parent-link" onClick={() => setSelected(selectedHeroParent)}><span>↰</span><div><small>{tr("PART OF HERO", "상위 HERO")}</small><b>{selectedHeroParent.title}</b></div></button>}{!hasHeroMarker(selectedRawTodos) ? <section className="hero-promotion"><span>★</span><h4>{tr("Turn this into a Hero Card", "이 카드를 Hero 카드로 전환")}</h4><p>{tr("Bundle related production cards and track their combined progress from one place.", "관련 프로덕션 카드를 묶고 한곳에서 전체 진행률을 확인하세요.")}</p><button className="create-button" onClick={promoteSelectedToHero}>★ {tr("Make Hero Card", "Hero 카드 만들기")}</button></section> : <><section className="hero-progress-card"><div><span>★</span><div><small>{tr("HERO PROGRESS", "HERO 진행률")}</small><b>{selectedHeroCompleted} / {selectedHeroChildren.length} {tr("cards done", "개 카드 완료")}</b></div></div><strong>{selectedHeroChildren.length ? Math.round(selectedHeroCompleted / selectedHeroChildren.length * 100) : 0}%</strong><div><i style={{width:`${selectedHeroChildren.length ? selectedHeroCompleted / selectedHeroChildren.length * 100 : 0}%`}} /></div><footer><span>◆ {selectedHeroChildren.reduce((sum, card) => sum + card.points, 0)} {tr("total effort", "총 작업량")}</span><span>{selectedHeroChildren.filter(card => card.status === "In progress" || card.status === "Review").length} {tr("active", "진행 중")}</span></footer></section><section className="hero-child-section"><header><div><small>{tr("SUB-CARDS", "하위 카드")}</small><b>{selectedHeroChildren.length}</b></div></header><div className="hero-child-list">{selectedHeroChildren.map(child => <article key={child.id}><button onClick={() => setSelected(child)}><span className={`hero-child-status status-${child.status.toLowerCase().replace(" ", "-")}`}/><div><b>{child.title}</b><small><span className="avatar">{child.owner}</span> P{child.priority} · ◆ {child.points} · {statusLabel(child.status)}</small></div></button><button className="hero-unlink" onClick={() => unlinkHeroChild(selected.id, child.id)} aria-label={tr(`Unlink ${child.title}`, `${child.title} 연결 해제`)}>×</button></article>)}{selectedHeroChildren.length === 0 && <p>{tr("No sub-cards yet. Create one or start a Journey below.", "아직 하위 카드가 없습니다. 새로 만들거나 아래에서 여정을 시작하세요.")}</p>}</div><form className="hero-quick-create" onSubmit={createHeroChild}><input value={heroChildTitle} onChange={event => setHeroChildTitle(event.target.value)} placeholder={tr("New sub-card title…", "새 하위 카드 제목…")} /><button type="submit" disabled={!heroChildTitle.trim()}>＋ {tr("Create", "만들기")}</button></form>{heroCandidateCards.length > 0 && <form className="hero-link-existing" onSubmit={linkExistingHeroChild}><select name="heroChildId" defaultValue=""><option value="" disabled>{tr("Link an existing card…", "기존 카드 연결…")}</option>{heroCandidateCards.map(card => <option value={card.id} key={card.id}>{card.title} · {statusLabel(card.status)}</option>)}</select><button type="submit">↳ {tr("Link", "연결")}</button></form>}</section><section className="journey-templates"><header><small>{tr("JOURNEY TEMPLATES", "여정 템플릿")}</small><b>{tr("Create a full production sequence", "전체 제작 단계를 한 번에 생성")}</b></header>{journeyTemplates.map(template => <button onClick={() => startHeroJourney(template)} key={template.id}><span>✦</span><div><b>{tr(template.name, template.nameKo)}</b><small>{tr(template.steps.join(" → "), template.stepsKo.join(" → "))}</small></div><i>＋{template.steps.length}</i></button>)}</section></>}</aside>}
    {selected && editCardOpen && <div className="modal-backdrop" onMouseDown={() => setEditCardOpen(false)}><section className="modal create-modal edit-card-modal card-form-modal card-planner-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Edit card", "카드 수정")}><header className="card-planner-header"><span className={`card-planner-icon ${selected.color}`}>✎</span><div><small>{tr("CARD DETAILS", "카드 정보")}</small><h2>{tr("Edit production card", "프로덕션 카드 수정")}</h2><p>{selected.project} · {statusLabel(selected.status)}</p></div><button onClick={() => setEditCardOpen(false)} aria-label="Close">×</button></header><form onSubmit={saveCardEdits}>
      <section className="card-form-section card-form-essentials"><div className="card-form-section-title"><span>1</span><div><b>{tr("The work", "작업 내용")}</b><small>{tr("Keep the outcome clear and actionable.", "명확하고 실행 가능한 작업으로 정리하세요.")}</small></div></div><label>{tr("Card title", "카드 제목")}<input name="title" required autoFocus defaultValue={selected.title} /></label><label>{tr("Description", "설명")}<textarea name="description" defaultValue={selected.description} /></label></section>
      <div className="card-form-columns"><section className="card-form-section"><div className="card-form-section-title"><span>2</span><div><b>{tr("Assignment", "배정")}</b><small>{tr("Move the card to the right team.", "알맞은 팀과 담당자에게 이동하세요.")}</small></div></div><label className="discipline-field">{tr("Production discipline", "프로덕션 분야")}<span><select name="tag" defaultValue={selected.tag}>{productionDisciplines.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}</select><button type="button" onClick={() => setDisciplineManagerOpen(true)}>⚙ {tr("Manage", "관리")}</button></span></label><div className="card-form-pair"><label>{tr("Project", "프로젝트")}<select name="project" defaultValue={selected.project}>{activeProjects.map(projectItem => <option key={projectItem.id} value={projectItem.name}>{projectItem.name}</option>)}</select></label><label>{tr("Column", "열")}<select name="status" defaultValue={selected.status}>{productionStages.map(status => <option value={status} key={status}>{statusLabel(status)}</option>)}</select></label></div><label>{tr("Primary owner", "주 담당자")}<select value={editOwner} onChange={event => { setEditOwner(event.target.value); setEditCollaborators(current => current.filter(initials => initials !== event.target.value)); }}>{!activeCardOwners.some(member => member.initials === editOwner) && <option value={editOwner}>{editOwner} · {tr("Unavailable member", "사용할 수 없는 멤버")}</option>}{activeCardOwners.map(member => <option value={member.initials} key={member.id}>{member.name} · {member.discipline}</option>)}</select></label><CoworkerPicker members={activeCardOwners} owner={editOwner} selected={editCollaborators} onChange={setEditCollaborators} label={tr("Co-workers", "공동 담당자")} hint={tr("Add or remove people collaborating on this card.", "이 카드를 함께 작업할 멤버를 추가하거나 제거하세요.")} /></section>
      <section className="card-form-section"><div className="card-form-section-title"><span>3</span><div><b>{tr("Plan", "계획")}</b><small>{tr("Refine timing, effort, and urgency.", "일정, 작업량, 우선순위를 조정하세요.")}</small></div></div><div className="card-form-pair"><label className="date-field">{tr("Start date", "시작일")}<span><input type="date" value={editStartDate} max={editDueDate || undefined} onChange={event => setEditStartDate(event.target.value)}/>{editStartDate && <button type="button" onClick={() => setEditStartDate("")} aria-label={tr("Clear start date", "시작일 삭제")}>×</button>}</span></label><label className="date-field">{tr("Due date", "마감일")}<span><input type="date" value={editDueDate} min={editStartDate || undefined} onChange={event => setEditDueDate(event.target.value)}/>{editDueDate && <button type="button" onClick={() => setEditDueDate("")} aria-label={tr("Clear due date", "마감일 삭제")}>×</button>}</span></label></div><label className="range-field card-range"><span><i>◆</i><b>{tr("Effort", "작업량")}</b><strong>{editEffort}<small>/10</small></strong></span><input type="range" min="1" max="10" value={editEffort} style={{"--range-progress":`${(editEffort - 1) / 9 * 100}%`} as CSSProperties} onChange={event => setEditEffort(Number(event.target.value))}/><em>{tr("Quick", "간단")}</em><em>{tr("Large", "큼")}</em></label><label className={`range-field card-range priority-range ${priorityTone(editPriority)}`}><span><i>!</i><b>{tr("Priority", "우선순위")}</b><strong>{editPriority}<small>/10</small></strong></span><input type="range" min="1" max="10" value={editPriority} style={{"--range-progress":`${(editPriority - 1) / 9 * 100}%`} as CSSProperties} onChange={event => setEditPriority(Number(event.target.value))}/><em>{tr("Normal", "보통")}</em><em>{editPriority >= 8 ? tr("Critical", "긴급") : editPriority >= 5 ? tr("High", "높음") : tr("Normal", "보통")}</em></label></section></div>
      <footer className="card-planner-footer card-editor-footer"><button className="danger-button" type="button" onClick={() => void deleteCard(selected)}>× {tr("Delete card", "카드 삭제")}</button><div><button type="button" onClick={() => setEditCardOpen(false)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">✓ {tr("Save changes", "변경 사항 저장")}</button></div></footer>
    </form></section></div>}
    {disciplineManagerOpen && <div className="modal-backdrop discipline-manager-backdrop" onMouseDown={() => setDisciplineManagerOpen(false)}><section className="modal create-modal production-discipline-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Manage production disciplines", "프로덕션 분야 관리")}><header><div><small>{tr("CARD SETTINGS", "카드 설정")}</small><h2>{tr("Production disciplines", "프로덕션 분야")}</h2></div><button onClick={() => setDisciplineManagerOpen(false)} aria-label="Close">×</button></header><form className="production-discipline-add" onSubmit={addProductionDiscipline}><input value={newProductionDiscipline} onChange={event => setNewProductionDiscipline(event.target.value)} placeholder={tr("New discipline", "새 분야")}/><button className="create-button" type="submit">＋ {tr("Add", "추가")}</button></form><div className="production-discipline-list">{productionDisciplines.map(item => editingProductionDiscipline?.id === item.id ? <form key={item.id} onSubmit={renameProductionDiscipline}><input name="name" defaultValue={item.name} autoFocus/><button type="submit">{tr("Save", "저장")}</button><button type="button" onClick={() => setEditingProductionDiscipline(null)}>×</button></form> : <article key={item.id}><i className={item.color}/><b>{item.name}</b><small>{cards.filter(card => card.tag === item.name).length} {tr("cards", "개 카드")}</small><button type="button" disabled={item.name === "General"} onClick={() => setEditingProductionDiscipline(item)}>✎</button><button type="button" className="danger-button" disabled={item.name === "General"} onClick={() => void deleteProductionDiscipline(item)}>×</button></article>)}</div><p className="form-help">{tr("Renaming updates every card. Deleting moves cards to General.", "이름 변경은 모든 카드에 반영됩니다. 삭제한 분야의 카드는 General로 이동합니다.")}</p></section></div>}
    {nameEditorOpen && session && <div className="modal-backdrop" onMouseDown={() => setNameEditorOpen(false)}><section className="modal create-modal name-editor-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Edit name", "이름 수정")}><header><div><small>{tr("PROFILE", "프로필")}</small><h2>{tr("Edit your name", "이름 수정")}</h2></div><button onClick={() => setNameEditorOpen(false)} aria-label="Close">×</button></header><form onSubmit={saveAccountName}><label>{tr("Display name", "표시 이름")}<input name="displayName" required autoFocus maxLength={80} defaultValue={accountName} placeholder={tr("Your name", "이름")}/></label><p className="form-help">{tr("This name appears in your greeting, account page, and profile menu.", "이 이름은 인사말, 계정 페이지, 프로필 메뉴에 표시됩니다.")}</p><footer><button type="button" onClick={() => setNameEditorOpen(false)}>{tr("Cancel", "취소")}</button><button className="create-button" type="submit">{tr("Save name", "이름 저장")}</button></footer></form></section></div>}
    {authOpen && <div className="modal-backdrop" onMouseDown={() => setAuthOpen(false)}><section className="modal create-modal auth-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr("Questdeck account", "Questdeck 계정")}><header><div><small>QUESTDECK ACCOUNT</small><h2>{authMode === "signin" ? tr("Welcome back", "다시 오신 것을 환영합니다") : tr("Create your account", "계정 만들기")}</h2></div><button onClick={() => setAuthOpen(false)} aria-label="Close">×</button></header><button className="github-auth-button" type="button" onClick={() => void handleGitHubSignIn()} disabled={authBusy}><span aria-hidden="true">GH</span>{tr("Continue with GitHub", "GitHub로 계속하기")}</button><div className="auth-divider"><span>{tr("or use email", "또는 이메일 사용")}</span></div><form onSubmit={handleAuth}><label>{tr("Email", "이메일")}<input name="email" type="email" required autoFocus autoComplete="email" placeholder="you@example.com" /></label><label>{tr("Password", "비밀번호")}<input name="password" type="password" minLength={8} required autoComplete={authMode === "signin" ? "current-password" : "new-password"} placeholder={tr("At least 8 characters", "8자 이상")} /></label>{authMessage && <p className="auth-message">{authMessage}</p>}<footer className="auth-footer"><button type="button" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthMessage(""); }}>{authMode === "signin" ? tr("Create account", "계정 만들기") : tr("I already have an account", "이미 계정이 있어요")}</button><button className="create-button" type="submit" disabled={authBusy}>{authBusy ? tr("Please wait…", "잠시만 기다려주세요…") : authMode === "signin" ? tr("Sign in", "로그인") : tr("Sign up", "가입하기")}</button></footer></form></section></div>}
    {documentEditorOpen && editingDocument && <div className="document-studio" role="dialog" aria-modal="true" aria-label={tr("Document editor", "문서 편집기")}><header className="document-studio-topbar"><button className="document-back" onClick={() => void saveDocumentDraft(true)} aria-label={tr("Back to documents", "문서 목록으로 돌아가기")}>←</button><span className="brand-mark">Q</span><div><input value={documentDraftTitle} maxLength={200} onChange={event => { setDocumentDraftTitle(event.target.value); setDocumentDirty(true); setDocumentSaveState("unsaved"); }} aria-label={tr("Document title", "문서 제목")} /><small className={documentSaveState}>{documentSaveState === "saving" ? tr("Saving…", "저장 중…") : documentSaveState === "unsaved" ? tr("Unsaved changes", "저장되지 않은 변경") : `✓ ${tr("Saved to workspace", "워크스페이스에 저장됨")}`}</small></div><button className={`document-publish-state ${editingDocument.isPublished ? "published" : ""}`} onClick={() => void setDocumentPublished({ ...editingDocument, title: documentDraftTitle.trim() || tr("Untitled document", "제목 없는 문서"), content: sanitizeRichText(documentDraftContent) }, !editingDocument.isPublished)}>{editingDocument.isPublished ? `● ${tr("Published", "공개됨")}` : `○ ${tr("Private", "비공개")}`}</button><button className={`document-comment-toggle ${documentCommentsOpen ? "active" : ""}`} onClick={() => setDocumentCommentsOpen(open => !open)}>◌ {documentComments.length}</button><button className="create-button document-done" onClick={() => void saveDocumentDraft(true)}>✓ {tr("Done", "완료")}</button></header><div className="document-studio-toolbar" role="toolbar" aria-label={tr("Document formatting", "문서 서식")}><select defaultValue="p" onChange={event => formatDocument("formatBlock", event.target.value)} aria-label={tr("Text style", "텍스트 스타일")}><option value="p">{tr("Normal text", "본문")}</option><option value="h1">{tr("Heading 1", "제목 1")}</option><option value="h2">{tr("Heading 2", "제목 2")}</option><option value="h3">{tr("Heading 3", "제목 3")}</option><option value="blockquote">{tr("Quote", "인용")}</option></select><span/><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => formatDocument("bold")} aria-label={tr("Bold", "굵게")}><b>B</b></button><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => formatDocument("italic")} aria-label={tr("Italic", "기울임")}><i>I</i></button><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => formatDocument("underline")} aria-label={tr("Underline", "밑줄")}><u>U</u></button><span/><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => formatDocument("insertUnorderedList")} aria-label={tr("Bullet list", "글머리 기호")}>• ≡</button><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => formatDocument("insertOrderedList")} aria-label={tr("Numbered list", "번호 목록")}>1. ≡</button><button type="button" onMouseDown={event => event.preventDefault()} onClick={addDocumentLink} aria-label={tr("Add link", "링크 추가")}>↗</button><button type="button" onMouseDown={event => event.preventDefault()} onClick={insertDocumentTable} aria-label={tr("Insert table", "표 삽입")}>▦</button><span/><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => formatDocument("undo")} aria-label={tr("Undo", "실행 취소")}>↶</button><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => formatDocument("redo")} aria-label={tr("Redo", "다시 실행")}>↷</button></div><main className={`document-studio-main ${documentCommentsOpen ? "with-comments" : ""}`}><section className="document-canvas-wrap"><form className="document-canvas" onSubmit={saveDocument}><div ref={documentEditorRef} className="document-rich-editor rich-document-content" contentEditable suppressContentEditableWarning data-placeholder={tr("Start writing your document…", "문서 작성을 시작하세요…")} onInput={updateDocumentContent} dangerouslySetInnerHTML={documentEditorHtmlRef.current} /><footer><span>{richTextExcerpt(documentDraftContent).split(/\s+/).filter(Boolean).length} {tr("words", "단어")}</span><button type="submit">{tr("Save now", "지금 저장")}</button></footer></form></section>{documentCommentsOpen && <aside className="document-comments"><header><div><small>{tr("DISCUSSION", "토론")}</small><h3>{tr("Document comments", "문서 댓글")}</h3></div><button onClick={() => setDocumentCommentsOpen(false)}>×</button></header><div className="document-comment-list">{documentComments.map(comment => <article key={comment.id}><span>{comment.authorName.split(/\s+/).map(part => part[0]).join("").slice(0,2).toUpperCase()}</span><div><header><b>{comment.authorName || comment.authorEmail}</b><small>{new Date(comment.createdAt).toLocaleString(language === "ko" ? "ko-KR" : "en-US", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })}</small></header><p>{comment.body}</p></div>{comment.userId === session?.user.id && <button onClick={() => void deleteDocumentComment(comment)} aria-label={tr("Delete comment", "댓글 삭제")}>×</button>}</article>)}{documentComments.length === 0 && <div className="document-comments-empty"><span>◌</span><b>{tr("No comments yet", "아직 댓글이 없습니다")}</b><p>{tr("Start a discussion about this document.", "이 문서에 대한 토론을 시작하세요.")}</p></div>}</div><form onSubmit={addDocumentComment}><textarea name="comment" maxLength={1200} required placeholder={tr("Add a comment…", "댓글 추가…")} /><button className="create-button" type="submit">＋ {tr("Comment", "댓글")}</button></form></aside>}</main></div>}
    {documentEditorOpen && editingDocument && <div className="document-image-attach"><button type="button" onClick={() => documentImageInputRef.current?.click()} disabled={documentImageUploading || documentExportBusy} aria-label={tr("Attach image", "이미지 첨부")}>{documentImageUploading ? "…" : "▧"}<span>{documentImageUploading ? tr("Uploading…", "업로드 중…") : tr("Attach image", "이미지 첨부")}</span></button><div className="document-export-control"><button type="button" onClick={() => setDocumentExportOpen(open => !open)} disabled={documentExportBusy} aria-expanded={documentExportOpen} aria-label={tr("Export document", "문서 내보내기")}>{documentExportBusy ? "…" : "⇩"}<span>{documentExportBusy ? tr("Preparing…", "준비 중…") : tr("Export", "내보내기")}</span></button>{documentExportOpen && <div className="document-export-menu"><button type="button" onClick={() => void exportDocument("doc")}><b>W</b><span>{tr("Word document", "Word 문서")}<small>.doc</small></span></button><button type="button" onClick={() => void exportDocument("html")}><b>⌘</b><span>{tr("Web document", "웹 문서")}<small>.html</small></span></button><button type="button" onClick={() => void printDocument()}><b>▤</b><span>{tr("Print or save PDF", "인쇄 또는 PDF 저장")}<small>{tr("Uses your print dialog", "인쇄 창 사용")}</small></span></button></div>}</div><input ref={documentImageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadDocumentImage}/></div>}
    {documentEditorOpen && editingDocument && <aside className="document-editor-assist" aria-label={tr("Table tools and keyboard shortcuts", "표 도구 및 키보드 단축키")}><div className="document-table-assist"><button type="button" className={documentTableMenuOpen ? "active" : ""} onMouseDown={event => { event.preventDefault(); rememberDocumentSelection(); }} onClick={() => setDocumentTableMenuOpen(open => !open)}>▦ <span>{tr("Table", "표")}</span></button>{documentTableMenuOpen && <section className="document-table-picker"><header><b>{tr("Insert a table", "표 삽입")}</b><span>{documentTableSize.rows} × {documentTableSize.columns}</span></header><div>{Array.from({length:25},(_,index) => { const row=Math.floor(index/5)+1; const column=index%5+1; const active=row<=documentTableSize.rows&&column<=documentTableSize.columns; return <button type="button" className={active ? "active" : ""} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setDocumentTableSize({rows:row,columns:column})} onFocus={() => setDocumentTableSize({rows:row,columns:column})} onClick={() => insertDocumentTable(row,column)} aria-label={tr(`Insert ${row} by ${column} table`, `${row}행 ${column}열 표 삽입`)} key={`${row}-${column}`} />;})}</div><small>{tr("Hover to choose rows and columns", "행과 열 개수를 선택하세요")}</small></section>}</div><div className="document-cell-actions"><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => mutateDocumentTable("add-row")} title={tr("Add row below", "아래에 행 추가")}>＋R</button><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => mutateDocumentTable("add-column")} title={tr("Add column right", "오른쪽에 열 추가")}>＋C</button><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => mutateDocumentTable("delete-row")} title={tr("Delete row", "행 삭제")}>−R</button><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => mutateDocumentTable("delete-column")} title={tr("Delete column", "열 삭제")}>−C</button></div><details className="document-shortcuts"><summary>⌨ <span>{tr("Shortcuts", "단축키")}</span></summary><div><b>{tr("Editor shortcuts", "편집기 단축키")}</b><p><kbd>Ctrl/⌘ B</kbd>{tr("Bold", "굵게")}</p><p><kbd>Ctrl/⌘ I</kbd>{tr("Italic", "기울임")}</p><p><kbd>Ctrl/⌘ U</kbd>{tr("Underline", "밑줄")}</p><p><kbd>Ctrl/⌘ Z</kbd>{tr("Undo", "실행 취소")}</p><p><kbd>Ctrl/⌘ Y</kbd>{tr("Redo", "다시 실행")}</p><p><kbd>Ctrl/⌘ S</kbd>{tr("Save now", "지금 저장")}</p><p><kbd>Tab</kbd>{tr("Next cell / indent", "다음 셀 / 들여쓰기")}</p><p><kbd>Shift Tab</kbd>{tr("Previous cell / outdent", "이전 셀 / 내어쓰기")}</p><p><kbd>Ctrl/⌘ Shift 7</kbd>{tr("Numbered list", "번호 목록")}</p><p><kbd>Ctrl/⌘ Shift 8</kbd>{tr("Bullet list", "글머리 기호")}</p></div></details></aside>}
    {cardHoverPreview && <aside className="card-hover-preview" style={{ left: cardHoverPreview.left, top: cardHoverPreview.top } as CSSProperties} role="tooltip" aria-label={tr("Card preview", "카드 미리보기")}>
      <header className={`card-accent ${cardHoverPreview.card.color}`}><span>{cardHoverPreview.card.tag}</span><b className={`priority-badge ${priorityTone(cardHoverPreview.card.priority)}`}>P{cardHoverPreview.card.priority}</b></header>
      <div className="card-hover-preview-body"><div className="card-hover-kicker"><span>{cardHoverPreview.card.project}</span><b className={`preview-status status-${cardHoverPreview.card.status.toLowerCase().replace(" ", "-")}`}>{statusLabel(cardHoverPreview.card.status)}</b></div><h3>{cardHoverPreview.card.title}</h3><p>{cardHoverPreview.card.description || tr("No description yet.", "아직 설명이 없습니다.")}</p><div className="card-hover-facts"><div><small>{tr("OWNER", "담당자")}</small><b><span className="avatar">{cardHoverPreview.card.owner}</span>{members.find(member => member.initials === cardHoverPreview.card.owner)?.name ?? tr("Unassigned", "담당자 없음")}</b></div><div><small>{tr("SCHEDULE", "일정")}</small><b>◷ {cardHoverPreview.card.startDate ? `${dueLabelFromInput(cardHoverPreview.card.startDate)} → ` : ""}{cardHoverPreview.card.due}</b></div><div><small>{tr("EFFORT", "작업량")}</small><b>{cardHoverPreview.card.points}/10</b></div><div><small>{tr("PRIORITY", "우선순위")}</small><b className={`priority-text ${priorityTone(cardHoverPreview.card.priority)}`}>P{cardHoverPreview.card.priority}</b></div></div><div className="card-hover-coworkers"><small>{tr("CO-WORKERS", "공동 담당자")}</small>{(cardHoverPreview.card.collaborators?.length ?? 0) > 0 ? <div>{(cardHoverPreview.card.collaborators ?? []).map(initials => <span key={initials}><i>{initials}</i><b>{members.find(member => member.initials === initials)?.name ?? initials}</b></span>)}</div> : <p>{tr("No co-workers assigned", "지정된 공동 담당자 없음")}</p>}</div>{cardHoverPreview.total > 0 && <div className="card-hover-subtasks"><span><i style={{ width: `${(cardHoverPreview.completed / cardHoverPreview.total) * 100}%` }} /></span><b>☑ {cardHoverPreview.completed}/{cardHoverPreview.total} {tr("subtasks", "하위 작업")}</b></div>}<footer>{tr("Click to open full card", "클릭하면 전체 카드를 엽니다")}</footer></div>
    </aside>}
    {toast && <div className="toast">✓ {toast}</div>}
  </main>;
}
