"use client";

import { ChangeEvent, Dispatch, PointerEvent as ReactPointerEvent, SetStateAction, WheelEvent as ReactWheelEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

export type FlowchartDocument = { id: number; title: string; content: string; createdByEmail: string; ownerName: string; isPublished: boolean; shareSlug: string; createdAt: string; updatedAt: string };
type FlowShape = "start" | "process" | "decision" | "data";
type FlowColor = "violet" | "mint" | "coral" | "blue" | "amber";
type FlowNode = { id: string; title: string; note: string; x: number; y: number; shape: FlowShape; color: FlowColor; imagePath?: string };
type FlowEdge = { id: string; from: string; to: string; label: string };
type FlowData = { version: 1; nodes: FlowNode[]; edges: FlowEdge[] };
type Viewport = { x: number; y: number; zoom: number };
type Gesture = { mode: "pan" | "node"; pointerId: number; startX: number; startY: number; originX: number; originY: number; nodeId?: string };

type Props = {
  documents: FlowchartDocument[];
  setDocuments: Dispatch<SetStateAction<FlowchartDocument[]>>;
  session: Session | null;
  activeWorkspaceId: string;
  accountName: string;
  accountEmail: string;
  canEdit: boolean;
  language: "en" | "ko";
  setToast: (message: string) => void;
  onCreateCard: (title: string, description: string) => void;
};

const SUPABASE_URL = "https://duddukvihvuoqawsoqus.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_TcigjkGnxplktO6uSngk8w_UETJmWR6";
const IMAGE_BUCKET = "questdeck-document-images";
const FLOWCHART_PREFIX = "__questdeck_flowchart_v1__:";
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const imagePathPattern = /^(?:[a-zA-Z0-9_-]+\/)?[0-9a-f-]{36}\/\d+\/[a-zA-Z0-9._-]+$/i;
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

export function isFlowchartDocument(document: FlowchartDocument) { return document.content.startsWith(FLOWCHART_PREFIX); }
function serialize(nodes: FlowNode[], edges: FlowEdge[]) { return `${FLOWCHART_PREFIX}${JSON.stringify({ version: 1, nodes, edges } satisfies FlowData)}`; }
function parse(content: string): FlowData | null {
  if (!content.startsWith(FLOWCHART_PREFIX)) return null;
  try {
    const value = JSON.parse(content.slice(FLOWCHART_PREFIX.length)) as Partial<FlowData>;
    if (value.version !== 1 || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null;
    return { version: 1, nodes: value.nodes as FlowNode[], edges: value.edges as FlowEdge[] };
  } catch { return null; }
}

function mapDocument(document: { id: number; title: string; content: string; created_by_email: string; owner_name: string; is_published: boolean; share_slug: string; created_at: string; updated_at: string }): FlowchartDocument {
  return { id: document.id, title: document.title, content: document.content, createdByEmail: document.created_by_email, ownerName: document.owner_name, isPublished: document.is_published, shareSlug: document.share_slug, createdAt: document.created_at, updatedAt: document.updated_at };
}

const starterNodes: FlowNode[] = [
  { id: "start", title: "Start", note: "Where the flow begins", x: 0, y: 80, shape: "start", color: "violet" },
  { id: "plan", title: "Plan the work", note: "Define the next action", x: 300, y: 80, shape: "process", color: "blue" },
  { id: "review", title: "Ready to ship?", note: "Choose the next path", x: 600, y: 80, shape: "decision", color: "amber" },
];
const starterEdges: FlowEdge[] = [
  { id: "start-plan", from: "start", to: "plan", label: "Next" },
  { id: "plan-review", from: "plan", to: "review", label: "Review" },
];

export default function FlowchartStudio({ documents, setDocuments, session, activeWorkspaceId, accountName, accountEmail, canEdit, language, setToast, onCreateCard }: Props) {
  const tr = (english: string, korean: string) => language === "ko" ? korean : english;
  const maps = useMemo(() => documents.filter(isFlowchartDocument).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [documents]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [title, setTitle] = useState(tr("New flowchart", "새 플로차트"));
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 260, y: 190, zoom: 1 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [imageUploading, setImageUploading] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const revisionRef = useRef(0);
  const saveRequestRef = useRef(0);
  const loadedIdRef = useRef<number | null>(null);

  const activeDocument = maps.find(document => document.id === activeId) ?? null;
  const selectedNode = nodes.find(node => node.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find(edge => edge.id === selectedEdgeId) ?? null;

  useEffect(() => {
    if (activeId && maps.some(document => document.id === activeId)) return;
    setActiveId(maps[0]?.id ?? null);
  }, [maps, activeId]);

  useEffect(() => {
    if (!activeDocument || loadedIdRef.current === activeDocument.id) return;
    const parsed = parse(activeDocument.content);
    loadedIdRef.current = activeDocument.id;
    setTitle(activeDocument.title);
    setNodes(parsed?.nodes ?? []);
    setEdges(parsed?.edges ?? []);
    setSelectedNodeId(parsed?.nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setConnectingFrom(null);
    setDirty(false);
    setSaveState("saved");
    setViewport({ x: 260, y: 190, zoom: 1 });
  }, [activeDocument]);

  useEffect(() => {
    const paths = Array.from(new Set(nodes.map(node => node.imagePath).filter((path): path is string => Boolean(path) && imagePathPattern.test(path!))));
    if (!paths.length) { setImageUrls({}); return; }
    let cancelled = false;
    void supabase.storage.from(IMAGE_BUCKET).createSignedUrls(paths, 3600).then(({ data }) => {
      if (cancelled) return;
      setImageUrls(Object.fromEntries((data ?? []).filter(item => item.signedUrl).map(item => [item.path, item.signedUrl])));
    });
    return () => { cancelled = true; };
  }, [nodes.map(node => node.imagePath ?? "").join("|")]);

  useEffect(() => {
    if (!dirty || !session || !canEdit) return;
    const timer = window.setTimeout(() => void save(), 850);
    return () => window.clearTimeout(timer);
  }, [dirty, nodes, edges, title, session, canEdit]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(document.activeElement === document.body || canvasRef.current?.contains(document.activeElement))) return;
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); addNode("process"); }
      if ((event.metaKey || event.ctrlKey) && event.key === "0") { event.preventDefault(); fit(); }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedNodeId) { event.preventDefault(); removeNode(selectedNodeId); }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedEdgeId) { event.preventDefault(); removeEdge(selectedEdgeId); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNodeId, selectedEdgeId, nodes, edges]);

  function markDirty() {
    revisionRef.current += 1;
    setDirty(true);
    setSaveState("saving");
  }

  async function sync<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    if (!session) throw new Error(tr("Sign in to manage flowcharts", "플로차트를 관리하려면 로그인하세요"));
    const response = await fetch("/api/questdeck-sync", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action, workspaceId: activeWorkspaceId, ...payload }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : tr("Flowchart sync failed", "플로차트 동기화에 실패했습니다"));
    return data as T;
  }

  async function save(): Promise<FlowchartDocument | null> {
    if (!session || !canEdit) return null;
    const revision = revisionRef.current;
    const request = ++saveRequestRef.current;
    const existing = documents.find(document => document.id === activeId && isFlowchartDocument(document));
    setSaveState("saving");
    try {
      const draft = existing
        ? { ...existing, title: title.trim() || tr("Untitled flowchart", "제목 없는 플로차트"), content: serialize(nodes, edges), isPublished: false }
        : { title: title.trim() || tr("Untitled flowchart", "제목 없는 플로차트"), content: serialize(nodes, edges), createdByEmail: accountEmail, ownerName: accountName, isPublished: false };
      const result = await sync<{ document: Parameters<typeof mapDocument>[0] }>(existing ? "update_document" : "create_document", { document: draft });
      if (saveRequestRef.current !== request) return null;
      const saved = mapDocument(result.document);
      setDocuments(current => existing ? current.map(item => item.id === saved.id ? saved : item) : [saved, ...current]);
      if (!existing) { loadedIdRef.current = saved.id; setActiveId(saved.id); }
      if (revisionRef.current === revision) { setDirty(false); setSaveState("saved"); } else setSaveState("saving");
      return saved;
    } catch (error) {
      if (saveRequestRef.current === request) setSaveState("error");
      setToast(error instanceof Error ? error.message : tr("Could not save flowchart", "플로차트를 저장하지 못했습니다"));
      return null;
    }
  }

  async function createChart() {
    if (!session || !canEdit) { setToast(tr("You need edit access to create a flowchart", "플로차트를 만들려면 편집 권한이 필요합니다")); return; }
    if (dirty && !await save()) return;
    const nextTitle = tr(`Flowchart ${maps.length + 1}`, `플로차트 ${maps.length + 1}`);
    try {
      const result = await sync<{ document: Parameters<typeof mapDocument>[0] }>("create_document", { document: { title: nextTitle, content: serialize(starterNodes, starterEdges), createdByEmail: accountEmail, ownerName: accountName, isPublished: false } });
      const saved = mapDocument(result.document);
      loadedIdRef.current = saved.id;
      setDocuments(current => [saved, ...current]);
      setActiveId(saved.id); setTitle(saved.title); setNodes(starterNodes); setEdges(starterEdges); setSelectedNodeId("start"); setSelectedEdgeId(null); setDirty(false); setSaveState("saved"); setViewport({ x: 190, y: 180, zoom: 1 });
    } catch (error) { setToast(error instanceof Error ? error.message : tr("Could not create flowchart", "플로차트를 만들지 못했습니다")); }
  }

  async function switchChart(document: FlowchartDocument) {
    if (document.id === activeId) return;
    if (dirty && !await save()) return;
    loadedIdRef.current = null;
    setActiveId(document.id);
  }

  async function deleteChart(document: FlowchartDocument) {
    if (!window.confirm(tr(`Delete “${document.title}” and its attached images?`, `“${document.title}”과(와) 첨부 이미지를 삭제할까요?`))) return;
    try {
      const parsed = parse(document.content);
      const paths = Array.from(new Set((parsed?.nodes ?? []).map(node => node.imagePath).filter((path): path is string => Boolean(path) && imagePathPattern.test(path!))));
      if (paths.length) await supabase.storage.from(IMAGE_BUCKET).remove(paths);
      await sync("delete_document", { documentId: document.id });
      const remaining = documents.filter(item => item.id !== document.id);
      const next = remaining.find(isFlowchartDocument);
      setDocuments(remaining); loadedIdRef.current = null; setActiveId(next?.id ?? null);
      if (!next) { setTitle(tr("New flowchart", "새 플로차트")); setNodes([]); setEdges([]); setSelectedNodeId(null); }
      setToast(tr("Flowchart deleted", "플로차트를 삭제했습니다"));
    } catch (error) { setToast(error instanceof Error ? error.message : tr("Could not delete flowchart", "플로차트를 삭제하지 못했습니다")); }
  }

  function addNode(shape: FlowShape) {
    if (!canEdit) return;
    const id = `step-${Date.now()}`;
    const label = shape === "start" ? tr("Start / End", "시작 / 종료") : shape === "decision" ? tr("Decision", "결정") : shape === "data" ? tr("Input / Output", "입력 / 출력") : tr("New step", "새 단계");
    const node: FlowNode = { id, title: label, note: "", x: (420 - viewport.x) / viewport.zoom, y: (260 - viewport.y) / viewport.zoom, shape, color: shape === "decision" ? "amber" : shape === "start" ? "violet" : shape === "data" ? "mint" : "blue" };
    setNodes(current => [...current, node]); setSelectedNodeId(id); setSelectedEdgeId(null); markDirty();
  }

  function updateNode(id: string, patch: Partial<FlowNode>) { setNodes(current => current.map(node => node.id === id ? { ...node, ...patch } : node)); markDirty(); }
  function updateEdge(id: string, patch: Partial<FlowEdge>) { setEdges(current => current.map(edge => edge.id === id ? { ...edge, ...patch } : edge)); markDirty(); }

  function removeNode(id: string) {
    const node = nodes.find(item => item.id === id);
    if (!node || !window.confirm(tr(`Delete “${node.title}” and its connections?`, `“${node.title}” 단계와 연결을 삭제할까요?`))) return;
    setNodes(current => current.filter(item => item.id !== id)); setEdges(current => current.filter(edge => edge.from !== id && edge.to !== id)); setSelectedNodeId(null); setConnectingFrom(current => current === id ? null : current); markDirty();
  }
  function removeEdge(id: string) { setEdges(current => current.filter(edge => edge.id !== id)); setSelectedEdgeId(null); markDirty(); }

  function chooseNode(id: string) {
    if (connectingFrom && connectingFrom !== id) {
      if (!edges.some(edge => edge.from === connectingFrom && edge.to === id)) setEdges(current => [...current, { id: `edge-${Date.now()}`, from: connectingFrom, to: id, label: tr("Next", "다음") }]);
      setConnectingFrom(null); setSelectedNodeId(id); markDirty(); return;
    }
    setSelectedNodeId(id); setSelectedEdgeId(null);
  }

  function startNodeDrag(event: ReactPointerEvent<HTMLDivElement>, node: FlowNode) {
    if (!canEdit || (event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = { mode: "node", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y, nodeId: node.id };
    chooseNode(node.id);
  }
  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".flow-node,.flow-edge")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = { mode: "pan", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: viewport.x, originY: viewport.y };
    setSelectedEdgeId(null);
  }
  function movePointer(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.mode === "pan") setViewport(current => ({ ...current, x: gesture.originX + event.clientX - gesture.startX, y: gesture.originY + event.clientY - gesture.startY }));
    else if (gesture.nodeId) setNodes(current => current.map(node => node.id === gesture.nodeId ? { ...node, x: gesture.originX + (event.clientX - gesture.startX) / viewport.zoom, y: gesture.originY + (event.clientY - gesture.startY) / viewport.zoom } : node));
  }
  function endPointer(event: ReactPointerEvent<HTMLDivElement>) { if (gestureRef.current?.pointerId === event.pointerId) { if (gestureRef.current.mode === "node") markDirty(); gestureRef.current = null; } }
  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const nextZoom = Math.min(1.8, Math.max(.45, viewport.zoom * (event.deltaY > 0 ? .9 : 1.1)));
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    setViewport({ x: x - (x - viewport.x) * nextZoom / viewport.zoom, y: y - (y - viewport.y) * nextZoom / viewport.zoom, zoom: nextZoom });
  }
  function zoom(nextZoom: number) {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const bounded = Math.min(1.8, Math.max(.45, nextZoom)); const x = rect.width / 2, y = rect.height / 2;
    setViewport({ x: x - (x - viewport.x) * bounded / viewport.zoom, y: y - (y - viewport.y) * bounded / viewport.zoom, zoom: bounded });
  }
  function fit() {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect || !nodes.length) return;
    const minX = Math.min(...nodes.map(node => node.x)), minY = Math.min(...nodes.map(node => node.y));
    const maxX = Math.max(...nodes.map(node => node.x + 210)), maxY = Math.max(...nodes.map(node => node.y + 120));
    const nextZoom = Math.min(1.25, Math.max(.5, Math.min((rect.width - 120) / (maxX - minX), (rect.height - 120) / (maxY - minY))));
    setViewport({ x: (rect.width - (maxX - minX) * nextZoom) / 2 - minX * nextZoom, y: (rect.height - (maxY - minY) * nextZoom) / 2 - minY * nextZoom, zoom: nextZoom });
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !selectedNode || !session || !canEdit) return;
    if (!imageTypes.has(file.type)) { setToast(tr("Choose a JPG, PNG, WebP, or GIF image", "JPG, PNG, WebP 또는 GIF 이미지를 선택하세요")); return; }
    if (file.size > 10 * 1024 * 1024) { setToast(tr("Image must be smaller than 10 MB", "이미지는 10MB보다 작아야 합니다")); return; }
    setImageUploading(true);
    try {
      const chartDocument = activeDocument ?? await save(); if (!chartDocument) throw new Error(tr("Save the flowchart before attaching an image", "이미지를 첨부하기 전에 플로차트를 저장하세요"));
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-90) || "image";
      const path = `${activeWorkspaceId}/${session.user.id}/${chartDocument.id}/flowchart-${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false }); if (error) throw error;
      if (selectedNode.imagePath) await supabase.storage.from(IMAGE_BUCKET).remove([selectedNode.imagePath]);
      setImageUrls(current => ({ ...current, [path]: URL.createObjectURL(file) })); updateNode(selectedNode.id, { imagePath: path }); setToast(tr("Image attached privately", "이미지를 비공개로 첨부했습니다"));
    } catch (error) { setToast(error instanceof Error ? error.message : tr("Could not attach image", "이미지를 첨부하지 못했습니다")); }
    finally { setImageUploading(false); }
  }

  async function removeImage(node: FlowNode) {
    if (!node.imagePath) return;
    const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([node.imagePath]); if (error) { setToast(error.message); return; }
    setImageUrls(current => { const next = { ...current }; delete next[node.imagePath!]; return next; }); updateNode(node.id, { imagePath: undefined });
  }

  return <div className="content flowchart-content">
    <div className="page-title flowchart-title"><div><p>{tr("PROCESS DESIGN", "프로세스 디자인")}</p><h1>{tr("Flowchart studio", "플로차트 스튜디오")}</h1><h2>{tr("Map decisions and production steps, then turn any step into a card.", "결정과 제작 단계를 구성하고 원하는 단계를 카드로 전환하세요.")}</h2></div><div className="flowchart-title-actions"><span className={`flowchart-save-state ${saveState}`}><i />{saveState === "saving" ? tr("Saving…", "저장 중…") : saveState === "error" ? tr("Save failed", "저장 실패") : tr("Saved privately", "비공개 저장됨")}</span><button className="secondary-button" disabled={!canEdit} onClick={() => void createChart()}>＋ {tr("New chart", "새 차트")}</button><button className="create-button" disabled={!canEdit} onClick={() => addNode("process")}>＋ {tr("New step", "새 단계")}</button></div></div>
    {!session ? <section className="flowchart-signin"><span>⇢</span><h3>{tr("Sign in to use flowcharts", "플로차트를 사용하려면 로그인하세요")}</h3><p>{tr("Flowcharts and images are stored privately inside your assigned workspace.", "플로차트와 이미지는 배정된 워크스페이스 안에 비공개로 저장됩니다.")}</p></section> : <section className="flowchart-shell">
      <aside className="flowchart-library"><header><div><small>{tr("FLOWCHARTS", "플로차트")}</small><b>{maps.length}</b></div><button disabled={!canEdit} onClick={() => void createChart()}>＋</button></header><div>{maps.map(document => <button className={document.id === activeId ? "active" : ""} onClick={() => void switchChart(document)} key={document.id}><span>⇢</span><div><b>{document.title}</b><small>{new Date(document.updatedAt).toLocaleDateString(language === "ko" ? "ko-KR" : "en-US")}</small></div><i onClick={event => { event.stopPropagation(); if (canEdit) void deleteChart(document); }}>×</i></button>)}{!maps.length && <p>{tr("Create your first flowchart to begin.", "첫 플로차트를 만들어 시작하세요.")}</p>}</div></aside>
      <div className="flowchart-workspace">
        <header className="flowchart-toolbar"><div className="flowchart-shapes"><button disabled={!canEdit} onClick={() => addNode("start")}><i className="start" />{tr("Start / End", "시작 / 종료")}</button><button disabled={!canEdit} onClick={() => addNode("process")}><i className="process" />{tr("Process", "프로세스")}</button><button disabled={!canEdit} onClick={() => addNode("decision")}><i className="decision" />{tr("Decision", "결정")}</button><button disabled={!canEdit} onClick={() => addNode("data")}><i className="data" />{tr("Data", "데이터")}</button></div><div className="flowchart-zoom"><button onClick={() => zoom(viewport.zoom * .85)}>−</button><output>{Math.round(viewport.zoom * 100)}%</output><button onClick={() => zoom(viewport.zoom * 1.15)}>＋</button><button onClick={fit}>⌗ {tr("Fit", "전체")}</button></div></header>
        <div className={`flowchart-canvas ${connectingFrom ? "connecting" : ""}`} ref={canvasRef} onPointerDown={startPan} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onWheel={onWheel}>
          <div className="flowchart-world" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
            {edges.map(edge => { const from = nodes.find(node => node.id === edge.from), to = nodes.find(node => node.id === edge.to); if (!from || !to) return null; const x1 = from.x + 105, y1 = from.y + 57, x2 = to.x + 105, y2 = to.y + 57, distance = Math.hypot(x2 - x1, y2 - y1), angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI; return <button className={`flow-edge ${selectedEdgeId === edge.id ? "selected" : ""}`} style={{ left: x1, top: y1, width: distance, transform: `rotate(${angle}deg)` }} onClick={event => { event.stopPropagation(); setSelectedEdgeId(edge.id); setSelectedNodeId(null); }} key={edge.id}><span>{edge.label || tr("Path", "경로")}</span></button>; })}
            {nodes.map(node => <div className={`flow-node ${node.shape} ${node.color} ${selectedNodeId === node.id ? "selected" : ""}`} style={{ left: node.x, top: node.y }} onPointerDown={event => startNodeDrag(event, node)} onClick={event => { event.stopPropagation(); chooseNode(node.id); }} key={node.id}><div className="flow-node-shape"><small>{node.shape === "start" ? tr("START / END", "시작 / 종료") : node.shape === "decision" ? tr("DECISION", "결정") : node.shape === "data" ? tr("INPUT / OUTPUT", "입력 / 출력") : tr("PROCESS", "프로세스")}</small><b>{node.title}</b>{node.note && <p>{node.note}</p>}{node.imagePath && imageUrls[node.imagePath] && <img src={imageUrls[node.imagePath]} alt="" />}</div><button className={connectingFrom === node.id ? "active" : ""} title={tr("Connect step", "단계 연결")} onClick={event => { event.stopPropagation(); setConnectingFrom(current => current === node.id ? null : node.id); setSelectedNodeId(node.id); }}>＋</button></div>)}
          </div>
          {!nodes.length && <div className="flowchart-empty"><span>⇢</span><b>{tr("A blank canvas is ready", "빈 캔버스가 준비되었습니다")}</b><p>{tr("Add a start, process, decision, or data shape above.", "위에서 시작, 프로세스, 결정 또는 데이터 도형을 추가하세요.")}</p></div>}
          {connectingFrom && <div className="flowchart-connect-hint">↗ {tr("Click another step to connect it", "연결할 다른 단계를 클릭하세요")}</div>}
        </div>
      </div>
      <aside className={`flowchart-inspector ${selectedNode || selectedEdge ? "open" : ""}`}>{selectedNode ? <><header><div><small>{tr("SELECTED STEP", "선택한 단계")}</small><b>{tr("Step details", "단계 상세")}</b></div><button onClick={() => setSelectedNodeId(null)}>×</button></header>{selectedNode.imagePath && imageUrls[selectedNode.imagePath] && <figure><img src={imageUrls[selectedNode.imagePath]} alt={selectedNode.title} /><button onClick={() => void removeImage(selectedNode)}>× {tr("Remove image", "이미지 삭제")}</button></figure>}<label>{tr("Title", "제목")}<input value={selectedNode.title} maxLength={100} disabled={!canEdit} onChange={event => updateNode(selectedNode.id, { title: event.target.value })} /></label><label>{tr("Description", "설명")}<textarea value={selectedNode.note} maxLength={400} disabled={!canEdit} onChange={event => updateNode(selectedNode.id, { note: event.target.value })} /></label><label>{tr("Shape", "도형")}<select value={selectedNode.shape} disabled={!canEdit} onChange={event => updateNode(selectedNode.id, { shape: event.target.value as FlowShape })}><option value="start">{tr("Start / End", "시작 / 종료")}</option><option value="process">{tr("Process", "프로세스")}</option><option value="decision">{tr("Decision", "결정")}</option><option value="data">{tr("Input / Output", "입력 / 출력")}</option></select></label><fieldset><legend>{tr("Color", "색상")}</legend>{(["violet", "mint", "coral", "blue", "amber"] as FlowColor[]).map(color => <button className={color === selectedNode.color ? "active" : ""} disabled={!canEdit} onClick={() => updateNode(selectedNode.id, { color })} aria-label={color} key={color}><i className={color} /></button>)}</fieldset><div className="flowchart-node-tools"><button disabled={!canEdit || imageUploading} onClick={() => imageInputRef.current?.click()}>▧ {imageUploading ? tr("Uploading…", "업로드 중…") : selectedNode.imagePath ? tr("Replace image", "이미지 교체") : tr("Attach image", "이미지 첨부")}</button><button disabled={!canEdit} onClick={() => onCreateCard(selectedNode.title, selectedNode.note)}>▤ {tr("Create card", "카드 만들기")}</button></div><button className={`flowchart-connect-button ${connectingFrom === selectedNode.id ? "active" : ""}`} disabled={!canEdit} onClick={() => setConnectingFrom(current => current === selectedNode.id ? null : selectedNode.id)}>↗ {connectingFrom === selectedNode.id ? tr("Cancel connection", "연결 취소") : tr("Connect this step", "이 단계 연결")}</button><button className="danger-button" disabled={!canEdit} onClick={() => removeNode(selectedNode.id)}>× {tr("Delete step", "단계 삭제")}</button></> : selectedEdge ? <><header><div><small>{tr("SELECTED PATH", "선택한 경로")}</small><b>{tr("Connection details", "연결 상세")}</b></div><button onClick={() => setSelectedEdgeId(null)}>×</button></header><label>{tr("Path label", "경로 이름")}<input value={selectedEdge.label} maxLength={60} disabled={!canEdit} placeholder={tr("Yes, No, Next…", "예, 아니요, 다음…")} onChange={event => updateEdge(selectedEdge.id, { label: event.target.value })} /></label><div className="flowchart-path-summary"><span>{nodes.find(node => node.id === selectedEdge.from)?.title}</span><b>→</b><span>{nodes.find(node => node.id === selectedEdge.to)?.title}</span></div><button className="danger-button" disabled={!canEdit} onClick={() => removeEdge(selectedEdge.id)}>× {tr("Delete connection", "연결 삭제")}</button></> : <div className="flowchart-inspector-empty"><span>⇢</span><b>{tr("Select a step or path", "단계 또는 경로 선택")}</b><p>{tr("Edit its details, connect it, attach an image, or create a production card.", "상세 내용을 수정하고 연결하거나 이미지를 첨부하고 프로덕션 카드를 만드세요.")}</p></div>}</aside>
      <input ref={imageInputRef} className="flowchart-image-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadImage} />
    </section>}
  </div>;
}
