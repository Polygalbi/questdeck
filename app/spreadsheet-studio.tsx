"use client";

import { ChangeEvent, Dispatch, KeyboardEvent as ReactKeyboardEvent, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";

export type SpreadsheetDocument = { id: number; title: string; content: string; createdByEmail: string; ownerName: string; isPublished: boolean; shareSlug: string; createdAt: string; updatedAt: string };
type CellAlign = "left" | "center" | "right";
type CellBorder = "none" | "thin" | "strong";
type CellStyle = { fill?: string; text?: string; bold?: boolean; align?: CellAlign; border?: CellBorder };
type SheetData = { version: 1; rowCount: number; columnCount: number; cells: Record<string, string>; frozenRows: number; styles: Record<string, CellStyle>; columnWidths: Record<string, number>; rowHeights: Record<string, number> };
type Props = {
  documents: SpreadsheetDocument[];
  setDocuments: Dispatch<SetStateAction<SpreadsheetDocument[]>>;
  session: Session | null;
  activeWorkspaceId: string;
  accountName: string;
  accountEmail: string;
  canEdit: boolean;
  language: "en" | "ko";
  setToast: (message: string) => void;
  onCreateCard: (title: string, description: string) => void;
};

const SPREADSHEET_PREFIX = "__questdeck_spreadsheet_v1__:";
const starter: SheetData = {
  version: 1,
  rowCount: 18,
  columnCount: 7,
  frozenRows: 1,
  styles: {
    A1: { fill: "#e5f4ed", text: "#236b53", bold: true }, B1: { fill: "#e5f4ed", text: "#236b53", bold: true }, C1: { fill: "#e5f4ed", text: "#236b53", bold: true }, D1: { fill: "#e5f4ed", text: "#236b53", bold: true, align: "center" }, E1: { fill: "#e5f4ed", text: "#236b53", bold: true, align: "center" }, F1: { fill: "#e5f4ed", text: "#236b53", bold: true, align: "center" }, G1: { fill: "#e5f4ed", text: "#236b53", bold: true, align: "center" },
  },
  columnWidths: { A: 190, B: 145, C: 130 },
  rowHeights: {},
  cells: {
    A1: "Task", B1: "Owner", C1: "Status", D1: "Priority", E1: "Start", F1: "Due", G1: "Effort",
    A2: "Define the game loop", B2: "Producer", C2: "In progress", D2: "8", E2: "2026-08-20", F2: "2026-08-24", G2: "5",
    A3: "Review combat prototype", B3: "Game Design", C3: "Ready", D3: "7", E3: "2026-08-22", F3: "2026-08-28", G3: "3",
    A4: "Total effort", G4: "=SUM(G2:G3)",
  },
};

export function isSpreadsheetDocument(document: SpreadsheetDocument) { return document.content.startsWith(SPREADSHEET_PREFIX); }
function serialize(data: SheetData) { return `${SPREADSHEET_PREFIX}${JSON.stringify(data)}`; }
function parse(content: string): SheetData | null {
  if (!content.startsWith(SPREADSHEET_PREFIX)) return null;
  try {
    const value = JSON.parse(content.slice(SPREADSHEET_PREFIX.length)) as Partial<SheetData>;
    if (value.version !== 1 || typeof value.cells !== "object") return null;
    return { version: 1, rowCount: Math.min(200, Math.max(5, Number(value.rowCount) || 18)), columnCount: Math.min(26, Math.max(3, Number(value.columnCount) || 7)), frozenRows: Math.min(5, Math.max(0, Number(value.frozenRows) || 0)), cells: value.cells as Record<string, string>, styles: value.styles && typeof value.styles === "object" ? value.styles as Record<string, CellStyle> : {}, columnWidths: value.columnWidths && typeof value.columnWidths === "object" ? value.columnWidths as Record<string, number> : {}, rowHeights: value.rowHeights && typeof value.rowHeights === "object" ? value.rowHeights as Record<string, number> : {} };
  } catch { return null; }
}
function mapDocument(document: { id: number; title: string; content: string; created_by_email: string; owner_name: string; is_published: boolean; share_slug: string; created_at: string; updated_at: string }): SpreadsheetDocument {
  return { id: document.id, title: document.title, content: document.content, createdByEmail: document.created_by_email, ownerName: document.owner_name, isPublished: document.is_published, shareSlug: document.share_slug, createdAt: document.created_at, updatedAt: document.updated_at };
}
function columnName(index: number) { return String.fromCharCode(65 + index); }
function cellId(row: number, column: number) { return `${columnName(column)}${row + 1}`; }
function parseCellId(id: string) { const match = id.match(/^([A-Z])(\d+)$/); return match ? { column: match[1].charCodeAt(0) - 65, row: Number(match[2]) - 1 } : null; }
function csvEscape(value: string) { return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value; }
function parseCsv(value: string) {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted && character === '"' && value[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === ",") { row.push(cell); cell = ""; }
    else if (!quoted && (character === "\n" || character === "\r")) { if (character === "\r" && value[index + 1] === "\n") index += 1; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function evaluateCell(id: string, cells: Record<string, string>, stack = new Set<string>()): string {
  const source = cells[id] ?? "";
  if (!source.startsWith("=")) return source;
  if (stack.has(id)) return "#CYCLE!";
  const nextStack = new Set(stack).add(id);
  try {
    let expression = source.slice(1).toUpperCase();
    expression = expression.replace(/(SUM|AVERAGE|AVG|COUNT)\(([A-Z]\d+):([A-Z]\d+)\)/g, (_match, operation: string, start: string, end: string) => {
      const first = parseCellId(start), last = parseCellId(end); if (!first || !last) return "0";
      const values: number[] = [];
      for (let row = Math.min(first.row, last.row); row <= Math.max(first.row, last.row); row += 1) for (let column = Math.min(first.column, last.column); column <= Math.max(first.column, last.column); column += 1) {
        const number = Number(evaluateCell(cellId(row, column), cells, nextStack)); if (Number.isFinite(number)) values.push(number);
      }
      if (operation === "COUNT") return String(values.length);
      const sum = values.reduce((total, value) => total + value, 0);
      return String(operation === "SUM" ? sum : values.length ? sum / values.length : 0);
    });
    expression = expression.replace(/\b[A-Z]\d+\b/g, reference => { const number = Number(evaluateCell(reference, cells, nextStack)); return Number.isFinite(number) ? String(number) : "0"; });
    if (!/^[\d+\-*/().\s]+$/.test(expression)) return "#VALUE!";
    const result = Function(`"use strict"; return (${expression})`)() as unknown;
    return typeof result === "number" && Number.isFinite(result) ? String(Math.round(result * 10000) / 10000) : "#VALUE!";
  } catch { return "#ERROR!"; }
}

export default function SpreadsheetStudio({ documents, setDocuments, session, activeWorkspaceId, accountName, accountEmail, canEdit, language, setToast, onCreateCard }: Props) {
  const tr = (english: string, korean: string) => language === "ko" ? korean : english;
  const sheets = useMemo(() => documents.filter(isSpreadsheetDocument).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [documents]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [title, setTitle] = useState(tr("New spreadsheet", "새 스프레드시트"));
  const [data, setData] = useState<SheetData>({ ...starter, cells: {} });
  const [selectedCell, setSelectedCell] = useState("A1");
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const importInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const loadedIdRef = useRef<number | null>(null);
  const revisionRef = useRef(0);
  const saveRequestRef = useRef(0);
  const activeDocument = sheets.find(document => document.id === activeId) ?? null;
  const selectedPosition = parseCellId(selectedCell) ?? { row: 0, column: 0 };
  const selectedStyle = data.styles[selectedCell] ?? {};
  const selectedColumn = columnName(selectedPosition.column);
  const selectedColumnWidth = data.columnWidths[selectedColumn] ?? 126;
  const selectedRowHeight = data.rowHeights[String(selectedPosition.row + 1)] ?? 34;

  useEffect(() => { if (!activeId || !sheets.some(sheet => sheet.id === activeId)) setActiveId(sheets[0]?.id ?? null); }, [sheets, activeId]);
  useEffect(() => {
    if (!activeDocument || loadedIdRef.current === activeDocument.id) return;
    loadedIdRef.current = activeDocument.id; const parsed = parse(activeDocument.content);
    setTitle(activeDocument.title); setData(parsed ?? { ...starter, cells: {} }); setSelectedCell("A1"); setDirty(false); setSaveState("saved");
  }, [activeDocument]);
  useEffect(() => { if (!dirty || !session || !canEdit) return; const timer = window.setTimeout(() => void save(), 850); return () => window.clearTimeout(timer); }, [dirty, data, title, session, canEdit]);

  function markDirty() { revisionRef.current += 1; setDirty(true); setSaveState("saving"); }
  async function sync<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    if (!session) throw new Error(tr("Sign in to manage spreadsheets", "스프레드시트를 관리하려면 로그인하세요"));
    const response = await fetch("/api/questdeck-sync", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action, workspaceId: activeWorkspaceId, ...payload }) });
    const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : tr("Spreadsheet sync failed", "스프레드시트 동기화에 실패했습니다")); return result as T;
  }
  async function save(): Promise<SpreadsheetDocument | null> {
    if (!session || !canEdit) return null;
    const revision = revisionRef.current, request = ++saveRequestRef.current;
    const existing = documents.find(document => document.id === activeId && isSpreadsheetDocument(document)); setSaveState("saving");
    try {
      const draft = existing ? { ...existing, title: title.trim() || tr("Untitled spreadsheet", "제목 없는 스프레드시트"), content: serialize(data), isPublished: false } : { title: title.trim() || tr("Untitled spreadsheet", "제목 없는 스프레드시트"), content: serialize(data), createdByEmail: accountEmail, ownerName: accountName, isPublished: false };
      const result = await sync<{ document: Parameters<typeof mapDocument>[0] }>(existing ? "update_document" : "create_document", { document: draft }); if (saveRequestRef.current !== request) return null;
      const saved = mapDocument(result.document); setDocuments(current => existing ? current.map(item => item.id === saved.id ? saved : item) : [saved, ...current]);
      if (!existing) { loadedIdRef.current = saved.id; setActiveId(saved.id); }
      if (revisionRef.current === revision) { setDirty(false); setSaveState("saved"); } else setSaveState("saving"); return saved;
    } catch (error) { if (saveRequestRef.current === request) setSaveState("error"); setToast(error instanceof Error ? error.message : tr("Could not save spreadsheet", "스프레드시트를 저장하지 못했습니다")); return null; }
  }
  async function createSheet() {
    if (!session || !canEdit) { setToast(tr("You need edit access to create a spreadsheet", "스프레드시트를 만들려면 편집 권한이 필요합니다")); return; }
    if (dirty && !await save()) return;
    const nextTitle = tr(`Spreadsheet ${sheets.length + 1}`, `스프레드시트 ${sheets.length + 1}`);
    try {
      const result = await sync<{ document: Parameters<typeof mapDocument>[0] }>("create_document", { document: { title: nextTitle, content: serialize(starter), createdByEmail: accountEmail, ownerName: accountName, isPublished: false } });
      const saved = mapDocument(result.document); loadedIdRef.current = saved.id; setDocuments(current => [saved, ...current]); setActiveId(saved.id); setTitle(saved.title); setData(starter); setSelectedCell("A1"); setDirty(false); setSaveState("saved");
    } catch (error) { setToast(error instanceof Error ? error.message : tr("Could not create spreadsheet", "스프레드시트를 만들지 못했습니다")); }
  }
  async function switchSheet(document: SpreadsheetDocument) { if (document.id === activeId) return; if (dirty && !await save()) return; loadedIdRef.current = null; setActiveId(document.id); }
  async function deleteSheet(document: SpreadsheetDocument) {
    if (!window.confirm(tr(`Delete “${document.title}”?`, `“${document.title}”을(를) 삭제할까요?`))) return;
    try { await sync("delete_document", { documentId: document.id }); const remaining = documents.filter(item => item.id !== document.id), next = remaining.find(isSpreadsheetDocument); setDocuments(remaining); loadedIdRef.current = null; setActiveId(next?.id ?? null); if (!next) { setTitle(tr("New spreadsheet", "새 스프레드시트")); setData({ ...starter, cells: {} }); } setToast(tr("Spreadsheet deleted", "스프레드시트를 삭제했습니다")); }
    catch (error) { setToast(error instanceof Error ? error.message : tr("Could not delete spreadsheet", "스프레드시트를 삭제하지 못했습니다")); }
  }
  function updateCell(id: string, value: string) { setData(current => ({ ...current, cells: { ...current.cells, [id]: value } })); markDirty(); }
  function updateSelectedStyle(patch: Partial<CellStyle>) { setData(current => ({ ...current, styles: { ...current.styles, [selectedCell]: { ...(current.styles[selectedCell] ?? {}), ...patch } } })); markDirty(); }
  function clearSelectedStyle() { setData(current => { const styles = { ...current.styles }; delete styles[selectedCell]; return { ...current, styles }; }); markDirty(); }
  function setSelectedColumnWidth(width: number) { setData(current => ({ ...current, columnWidths: { ...current.columnWidths, [selectedColumn]: Math.min(240, Math.max(72, width)) } })); markDirty(); }
  function setSelectedRowHeight(height: number) { const row = String(selectedPosition.row + 1); setData(current => ({ ...current, rowHeights: { ...current.rowHeights, [row]: Math.min(80, Math.max(28, height)) } })); markDirty(); }
  function moveSelection(rowDelta: number, columnDelta: number) { const row = Math.min(data.rowCount - 1, Math.max(0, selectedPosition.row + rowDelta)), column = Math.min(data.columnCount - 1, Math.max(0, selectedPosition.column + columnDelta)); const id = cellId(row, column); setSelectedCell(id); window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-cell="${id}"]`)?.focus(), 0); }
  function handleCellKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") { event.preventDefault(); moveSelection(event.shiftKey ? -1 : 1, 0); }
    else if (event.key === "Tab") { event.preventDefault(); moveSelection(0, event.shiftKey ? -1 : 1); }
    else if (event.key === "ArrowUp" && !event.currentTarget.value) { event.preventDefault(); moveSelection(-1, 0); }
    else if (event.key === "ArrowDown" && !event.currentTarget.value) { event.preventDefault(); moveSelection(1, 0); }
  }
  function addRow() { if (data.rowCount >= 200) return; setData(current => ({ ...current, rowCount: current.rowCount + 1 })); markDirty(); }
  function addColumn() { if (data.columnCount >= 26) return; setData(current => ({ ...current, columnCount: current.columnCount + 1 })); markDirty(); }
  function deleteSelectedRow() {
    if (data.rowCount <= 5 || !window.confirm(tr(`Delete row ${selectedPosition.row + 1}?`, `${selectedPosition.row + 1}행을 삭제할까요?`))) return;
    setData(current => { const cells: Record<string,string> = {}, styles: Record<string,CellStyle> = {}, rowHeights: Record<string,number> = {}; for (let row = 0; row < current.rowCount; row += 1) for (let column = 0; column < current.columnCount; column += 1) { if (row === selectedPosition.row) continue; const target = cellId(row > selectedPosition.row ? row - 1 : row, column), source = cellId(row, column), value = current.cells[source]; if (value !== undefined) cells[target] = value; if (current.styles[source]) styles[target] = current.styles[source]; } Object.entries(current.rowHeights).forEach(([row, height]) => { const index = Number(row) - 1; if (index !== selectedPosition.row) rowHeights[String((index > selectedPosition.row ? index - 1 : index) + 1)] = height; }); return { ...current, rowCount: current.rowCount - 1, cells, styles, rowHeights }; }); setSelectedCell(cellId(Math.max(0, selectedPosition.row - 1), selectedPosition.column)); markDirty();
  }
  function deleteSelectedColumn() {
    if (data.columnCount <= 3 || !window.confirm(tr(`Delete column ${columnName(selectedPosition.column)}?`, `${columnName(selectedPosition.column)}열을 삭제할까요?`))) return;
    setData(current => { const cells: Record<string,string> = {}, styles: Record<string,CellStyle> = {}, columnWidths: Record<string,number> = {}; for (let row = 0; row < current.rowCount; row += 1) for (let column = 0; column < current.columnCount; column += 1) { if (column === selectedPosition.column) continue; const target = cellId(row, column > selectedPosition.column ? column - 1 : column), source = cellId(row, column), value = current.cells[source]; if (value !== undefined) cells[target] = value; if (current.styles[source]) styles[target] = current.styles[source]; } Object.entries(current.columnWidths).forEach(([column, width]) => { const index = column.charCodeAt(0) - 65; if (index !== selectedPosition.column) columnWidths[columnName(index > selectedPosition.column ? index - 1 : index)] = width; }); return { ...current, columnCount: current.columnCount - 1, cells, styles, columnWidths }; }); setSelectedCell(cellId(selectedPosition.row, Math.max(0, selectedPosition.column - 1))); markDirty();
  }
  function clearSelection() { updateCell(selectedCell, ""); }
  function exportCsv() {
    const content = Array.from({ length: data.rowCount }, (_, row) => Array.from({ length: data.columnCount }, (_, column) => csvEscape(evaluateCell(cellId(row, column), data.cells))).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${title.trim().replace(/[^a-zA-Z0-9가-힣_-]+/g, "-") || "questdeck-sheet"}.csv`; anchor.click(); URL.revokeObjectURL(url); setToast(tr("CSV exported", "CSV를 내보냈습니다"));
  }
  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file || !canEdit) return;
    try { const rows = parseCsv(await file.text()).slice(0, 200), columnCount = Math.min(26, Math.max(3, ...rows.map(row => row.length))), cells: Record<string,string> = {}; rows.forEach((row, rowIndex) => row.slice(0, 26).forEach((value, columnIndex) => { if (value) cells[cellId(rowIndex, columnIndex)] = value; })); setData({ version: 1, rowCount: Math.max(5, rows.length), columnCount, frozenRows: 1, cells, styles: {}, columnWidths: {}, rowHeights: {} }); setTitle(file.name.replace(/\.csv$/i, "")); setSelectedCell("A1"); markDirty(); setToast(tr("CSV imported", "CSV를 가져왔습니다")); }
    catch { setToast(tr("Could not import that CSV file", "CSV 파일을 가져오지 못했습니다")); }
  }
  function createCardFromRow() {
    const values = Array.from({ length: data.columnCount }, (_, column) => evaluateCell(cellId(selectedPosition.row, column), data.cells).trim()); const titleValue = values.find(Boolean) || tr(`Row ${selectedPosition.row + 1}`, `${selectedPosition.row + 1}행`); const description = values.map((value, column) => value ? `${evaluateCell(cellId(0, column), data.cells) || columnName(column)}: ${value}` : "").filter(Boolean).join("\n"); onCreateCard(titleValue, description);
  }

  return <div className="content spreadsheet-content">
    <div className="page-title spreadsheet-title"><div><p>{tr("STRUCTURED PLANNING", "구조화된 계획")}</p><h1>{tr("Spreadsheet studio", "스프레드시트 스튜디오")}</h1><h2>{tr("Track production data, calculate totals, and turn rows into cards.", "프로덕션 데이터를 관리하고 합계를 계산하며 행을 카드로 전환하세요.")}</h2></div><div className="spreadsheet-title-actions"><span className={`spreadsheet-save-state ${saveState}`}><i />{saveState === "saving" ? tr("Saving…", "저장 중…") : saveState === "error" ? tr("Save failed", "저장 실패") : tr("Saved privately", "비공개 저장됨")}</span><button className="secondary-button" disabled={!canEdit} onClick={() => void createSheet()}>＋ {tr("New sheet", "새 시트")}</button></div></div>
    {!session ? <section className="spreadsheet-signin"><span>▦</span><h3>{tr("Sign in to use spreadsheets", "스프레드시트를 사용하려면 로그인하세요")}</h3><p>{tr("Sheets are private and available only to members of this workspace.", "시트는 비공개이며 이 워크스페이스 멤버만 사용할 수 있습니다.")}</p></section> : <section className="spreadsheet-shell">
      <aside className="spreadsheet-library"><header><div><small>{tr("SPREADSHEETS", "스프레드시트")}</small><b>{sheets.length}</b></div><button disabled={!canEdit} onClick={() => void createSheet()}>＋</button></header><div>{sheets.map(sheet => <button className={sheet.id === activeId ? "active" : ""} onClick={() => void switchSheet(sheet)} key={sheet.id}><span>▦</span><div><b>{sheet.title}</b><small>{new Date(sheet.updatedAt).toLocaleDateString(language === "ko" ? "ko-KR" : "en-US")}</small></div><i onClick={event => { event.stopPropagation(); if (canEdit) void deleteSheet(sheet); }}>×</i></button>)}{!sheets.length && <p>{tr("Create your first spreadsheet to begin.", "첫 스프레드시트를 만들어 시작하세요.")}</p>}</div></aside>
      <div className="spreadsheet-workspace">
        <header className="spreadsheet-toolbar"><div><input className="spreadsheet-name-input" value={title} maxLength={100} disabled={!canEdit} aria-label={tr("Spreadsheet name", "스프레드시트 이름")} onChange={event => { setTitle(event.target.value); markDirty(); }} /><button disabled={!canEdit} onClick={addRow}>＋ {tr("Row", "행")}</button><button disabled={!canEdit} onClick={addColumn}>＋ {tr("Column", "열")}</button><button disabled={!canEdit} onClick={deleteSelectedRow}>− {tr("Row", "행")}</button><button disabled={!canEdit} onClick={deleteSelectedColumn}>− {tr("Column", "열")}</button></div><div><button onClick={() => importInputRef.current?.click()} disabled={!canEdit}>⇧ {tr("Import CSV", "CSV 가져오기")}</button><button onClick={exportCsv}>⇩ {tr("Export CSV", "CSV 내보내기")}</button><button disabled={!canEdit} onClick={createCardFromRow}>▤ {tr("Row to card", "행을 카드로")}</button></div></header>
        <div className="spreadsheet-formatbar">
          <div className="spreadsheet-format-group"><small>{tr("CELL", "셀")}</small><button className={selectedStyle.bold ? "active" : ""} disabled={!canEdit} onClick={() => updateSelectedStyle({ bold: !selectedStyle.bold })} aria-label={tr("Bold", "굵게")}><b>B</b></button>{(["left", "center", "right"] as CellAlign[]).map(align => <button className={selectedStyle.align === align ? "active" : ""} disabled={!canEdit} onClick={() => updateSelectedStyle({ align })} aria-label={tr(`${align} align`, `${align} 정렬`)} key={align}>{align === "left" ? "≡" : align === "center" ? "≣" : "≡"}</button>)}<label className="spreadsheet-color-control"><span>{tr("Fill", "채우기")}</span><input type="color" value={selectedStyle.fill ?? "#ffffff"} disabled={!canEdit} onChange={event => updateSelectedStyle({ fill: event.target.value })} /></label><label className="spreadsheet-color-control text"><span>{tr("Text", "글자")}</span><input type="color" value={selectedStyle.text ?? "#343b37"} disabled={!canEdit} onChange={event => updateSelectedStyle({ text: event.target.value })} /></label><label className="spreadsheet-border-control"><span>{tr("Border", "테두리")}</span><select value={selectedStyle.border ?? "thin"} disabled={!canEdit} onChange={event => updateSelectedStyle({ border: event.target.value as CellBorder })}><option value="none">{tr("None", "없음")}</option><option value="thin">{tr("Thin", "얇게")}</option><option value="strong">{tr("Strong", "굵게")}</option></select></label><button className="spreadsheet-format-reset" disabled={!canEdit || !Object.keys(selectedStyle).length} onClick={clearSelectedStyle}>↺ {tr("Reset", "초기화")}</button></div>
          <div className="spreadsheet-size-group"><small>{tr("SIZE", "크기")}</small><label><span>{tr(`Column ${selectedColumn}`, `${selectedColumn}열`)}</span><input type="range" min="72" max="240" value={selectedColumnWidth} disabled={!canEdit} onChange={event => setSelectedColumnWidth(Number(event.target.value))} /><output>{selectedColumnWidth}px</output></label><label><span>{tr(`Row ${selectedPosition.row + 1}`, `${selectedPosition.row + 1}행`)}</span><input type="range" min="28" max="80" value={selectedRowHeight} disabled={!canEdit} onChange={event => setSelectedRowHeight(Number(event.target.value))} /><output>{selectedRowHeight}px</output></label></div>
        </div>
        <div className="spreadsheet-formula"><label>{selectedCell}</label><span>ƒx</span><input value={data.cells[selectedCell] ?? ""} disabled={!canEdit} placeholder={tr("Enter a value or formula, for example =SUM(G2:G10)", "값 또는 수식을 입력하세요. 예: =SUM(G2:G10)")} onChange={event => updateCell(selectedCell, event.target.value)} onKeyDown={event => { if (event.key === "Enter") moveSelection(1, 0); }} /><button disabled={!canEdit || !data.cells[selectedCell]} onClick={clearSelection}>×</button></div>
        <div className="spreadsheet-grid-wrap" ref={gridRef}><table className="spreadsheet-grid"><thead><tr><th className="spreadsheet-corner" />{Array.from({ length: data.columnCount }, (_, column) => { const width = data.columnWidths[columnName(column)] ?? 126; return <th className={selectedPosition.column === column ? "selected" : ""} style={{ minWidth: width, width }} key={columnName(column)}>{columnName(column)}</th>; })}</tr></thead><tbody>{Array.from({ length: data.rowCount }, (_, row) => { const height = data.rowHeights[String(row + 1)] ?? 34; return <tr className={row < data.frozenRows ? "frozen" : ""} style={{ height }} key={row}><th className={selectedPosition.row === row ? "selected" : ""} style={{ height }}>{row + 1}</th>{Array.from({ length: data.columnCount }, (_, column) => { const id = cellId(row, column), raw = data.cells[id] ?? "", display = editingCell === id ? raw : evaluateCell(id, data.cells), cellStyle = data.styles[id] ?? {}, width = data.columnWidths[columnName(column)] ?? 126, border = cellStyle.border ?? "thin"; return <td className={`${selectedCell === id ? "selected" : ""} ${raw.startsWith("=") ? "formula" : ""}`} style={{ minWidth: width, width, height, background: cellStyle.fill, color: cellStyle.text, fontWeight: cellStyle.bold ? 800 : undefined, textAlign: cellStyle.align, borderColor: border === "none" ? "transparent" : undefined, boxShadow: border === "strong" ? "inset 0 0 0 2px #59645f" : undefined }} key={id}><input data-cell={id} value={display} readOnly={!canEdit} onFocus={() => { setSelectedCell(id); setEditingCell(id); }} onBlur={() => setEditingCell(null)} onChange={event => updateCell(id, event.target.value)} onKeyDown={handleCellKeyDown} /></td>; })}</tr>; })}</tbody></table></div>
        <footer className="spreadsheet-status"><span>{data.rowCount} {tr("rows", "행")} × {data.columnCount} {tr("columns", "열")}</span><span>{selectedCell}: <b>{evaluateCell(selectedCell, data.cells) || tr("Empty", "비어 있음")}</b></span><span>{tr("Formulas", "수식")}: SUM · AVERAGE · COUNT · + − × ÷</span></footer>
      </div><input ref={importInputRef} className="spreadsheet-import-input" type="file" accept="text/csv,.csv" onChange={event => void importCsv(event)} />
    </section>}
  </div>;
}
