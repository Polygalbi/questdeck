import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the private Questdeck gate without workspace content", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Questdeck — Game Production, in Play<\/title>/i);
  assert.match(html, /Checking secure workspace access/);
  assert.doesNotMatch(html, /Production board|Project Nightfall/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("includes the high-volume board and backup controls", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /className="quick-card-form"/);
  assert.match(page, /ownerFilter/);
  assert.match(page, /collaborator_initials/);
  assert.match(page, /CoworkerPicker/);
  assert.match(page, /detail-coworkers/);
  assert.match(page, /card-hover-coworkers/);
  assert.match(page, /selectedCollaborators/);
  assert.match(page, /card-title-row/);
  assert.match(page, /disciplineFilter/);
  assert.match(page, /dueFilter/);
  assert.match(page, /downloadWorkspaceBackup/);
  assert.match(page, /restoreBoardBackup/);
  assert.match(css, /board-density-compact/);
  assert.match(css, /\.card-assignee-stack/);
  assert.match(css, /\.coworker-picker/);
  assert.match(css, /\.detail-coworkers/);
  assert.match(css, /\.card-hover-coworkers/);
  assert.match(css, /\.column-cards\{[^}]*overflow-y:auto/);
  assert.match(page, /overviewUpcomingCards/);
  assert.match(page, /overviewUrgentCards/);
  assert.match(page, /recentPulseEvents/);
  assert.match(page, /cardDueTone/);
  assert.match(css, /\.overview-focus-grid/);
  assert.match(css, /\.card-title-row>time\.due-overdue/);
  assert.match(css, /\.live-pulse/);
});

test("includes working document editing and table controls", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /rememberDocumentSelection/);
  assert.match(page, /handleDocumentKeyDown/);
  assert.match(page, /event\.code === "Digit7"/);
  assert.match(page, /event\.code === "Digit8"/);
  assert.match(page, /removeDocumentIndent/);
  assert.match(page, /document-table-picker/);
  assert.match(page, /mutateDocumentTable/);
  const inputHandler = page.match(/function updateDocumentContent\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.doesNotMatch(inputHandler, /setDocumentDraftContent/);
  assert.match(inputHandler, /setDocumentChangeVersion/);
  assert.match(page, /dangerouslySetInnerHTML=\{documentEditorHtmlRef\.current\}/);
  assert.match(css, /\.rich-document-content ol\{list-style:decimal/);
  assert.match(css, /caret-color:#6248cf/);
  assert.match(css, /\.document-editor-assist/);
});

test("includes persistent Hero Cards, sub-cards, and Journey templates", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /HERO_CHILD_PREFIX/);
  assert.match(page, /promoteSelectedToHero/);
  assert.match(page, /linkExistingHeroChild/);
  assert.match(page, /createHeroChild/);
  assert.match(page, /startHeroJourney/);
  assert.match(page, /function openCard\(card: Card\)/);
  assert.match(page, /setHeroPanelOpen\(true\)/);
  assert.match(page, /hero-progress-card/);
  assert.match(page, /hero-sub-card/);
  assert.match(page, /SUB-CARD/);
  assert.match(page, /collapsedHeroIds/);
  assert.match(page, /boardCardsForStatus/);
  assert.match(page, /toggleHeroTree/);
  assert.match(css, /\.hero-card-panel/);
  assert.match(css, /\.hero-card-chip/);
  assert.match(page, /Hide sub-cards/);
  assert.match(page, /Show sub-cards/);
  assert.match(css, /\.hero-tree-toggle/);
  assert.match(css, /\.column-cards>\.quest-card\.hero-sub-card/);
  assert.match(page, /timeline-hero-bar/);
  assert.match(page, /timeline-sub-card-bar/);
  assert.match(page, /timeline-hero-steps/);
  assert.match(css, /\.timeline-journey-badge/);
  assert.match(css, /\.timeline-tooltip-journey/);
  assert.match(page, /beginTimelinePan/);
  assert.match(page, /Back to today/);
  assert.match(page, /Drag empty space to browse dates/);
  assert.match(css, /\.timeline-pan-surface/);
});

test("keeps milestone progress synchronized with active cards", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /syncMilestoneProgress/);
  assert.match(page, /syncQuestdeck\("update_milestone"/);
  assert.match(page, /milestoneDefinitionSignature/);
  assert.match(page, /Progress is live/);
  assert.match(page, /Recalculate/);
  assert.match(css, /\.milestone-sync-status/);
});

test("includes a private, persistent infinite mindmap canvas", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /MINDMAP_DOCUMENT_PREFIX/);
  assert.match(page, /serializeMindmap/);
  assert.match(page, /saveMindmap/);
  assert.match(page, /beginMindmapPan/);
  assert.match(page, /beginMindmapNodeDrag/);
  assert.match(page, /connectMindmapNode/);
  assert.match(page, /fitMindmap/);
  assert.match(page, /createMindmap/);
  assert.match(page, /switchMindmap/);
  assert.match(page, /deleteMindmap/);
  assert.match(page, /uploadMindmapImage/);
  assert.match(page, /createSignedUrls/);
  assert.match(page, /const mindmapPaths =/);
  assert.match(page, /createCardFromMindmap/);
  assert.match(page, /Mindmap studio/);
  assert.match(page, /Saved privately/);
  assert.match(css, /\.mindmap-canvas/);
  assert.match(css, /\.mindmap-node/);
  assert.match(css, /\.mindmap-inspector/);
  assert.match(css, /\.mindmap-library/);
  assert.match(css, /\.mindmap-node-tools/);
});

test("includes private multi-chart flowcharts with shapes and card creation", async () => {
  const [page, flowchart, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/flowchart-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /view === "flowchart"/);
  assert.match(page, /isFlowchartDocument/);
  assert.match(flowchart, /__questdeck_flowchart_v1__/);
  assert.match(flowchart, /Flowchart studio/);
  assert.match(flowchart, /"start" \| "process" \| "decision" \| "data"/);
  assert.match(flowchart, /createSignedUrls/);
  assert.match(flowchart, /Image attached privately/);
  assert.match(flowchart, /onCreateCard/);
  assert.match(flowchart, /connectingFrom/);
  assert.match(flowchart, /Path label/);
  assert.match(css, /\.flowchart-canvas/);
  assert.match(css, /\.flow-node\.decision/);
  assert.match(css, /\.flow-edge/);
  assert.match(css, /\.flowchart-library/);
});

test("includes private spreadsheets with formulas, CSV, and row-to-card actions", async () => {
  const [page, spreadsheet, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/spreadsheet-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/spreadsheet-studio.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /view === "spreadsheet"/);
  assert.match(page, /isSpreadsheetDocument/);
  assert.match(spreadsheet, /__questdeck_spreadsheet_v1__/);
  assert.match(spreadsheet, /Spreadsheet studio/);
  assert.match(spreadsheet, /SUM\|AVERAGE\|AVG\|COUNT/);
  assert.match(spreadsheet, /parseCsv/);
  assert.match(spreadsheet, /exportCsv/);
  assert.match(spreadsheet, /createCardFromRow/);
  assert.match(spreadsheet, /addRow/);
  assert.match(spreadsheet, /addColumn/);
  assert.match(spreadsheet, /deleteSelectedRow/);
  assert.match(spreadsheet, /deleteSelectedColumn/);
  assert.match(spreadsheet, /updateSelectedStyle/);
  assert.match(spreadsheet, /setSelectedColumnWidth/);
  assert.match(spreadsheet, /setSelectedRowHeight/);
  assert.match(spreadsheet, /Column .* width in pixels/);
  assert.match(spreadsheet, /type="number" min="40" max="600"/);
  assert.match(spreadsheet, /type="number" min="20" max="300"/);
  assert.match(spreadsheet, /selectedRange/);
  assert.match(spreadsheet, /beginCellSelection/);
  assert.match(spreadsheet, /extendCellSelection/);
  assert.match(spreadsheet, /selectedCellIds/);
  assert.match(spreadsheet, /<textarea rows=\{1\}/);
  assert.match(spreadsheet, /charactersPerLine/);
  assert.match(spreadsheet, /type="color"/);
  assert.match(spreadsheet, /CellBorder/);
  assert.match(css, /\.spreadsheet-grid/);
  assert.match(css, /\.spreadsheet-formula/);
  assert.match(css, /\.spreadsheet-library/);
  assert.match(css, /\.spreadsheet-formatbar/);
  assert.match(css, /\.spreadsheet-size-group/);
  assert.match(css, /\.spreadsheet-pixel-input/);
  assert.match(css, /\.spreadsheet-grid td\.range-selected/);
  assert.match(css, /overflow-wrap:anywhere/);
});

test("scopes workspace access and includes the Team Leader role", async () => {
  const [page, accessCss, migration, syncFunction] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-access.css", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608200004_workspace_membership_scoping.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/questdeck-sync/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /"Team Leader"/);
  assert.match(page, /workspaceIds/);
  assert.match(page, /workspace-assignment-fieldset/);
  assert.match(page, /isWorkspaceOwner/);
  assert.match(accessCss, /workspace-assignment-fieldset/);
  assert.match(migration, /questdeck_workspace_memberships/);
  assert.match(migration, /has_questdeck_workspace_access/);
  assert.match(migration, /workspace_id text not null/);
  assert.match(syncFunction, /Only owners can create workspaces/);
  assert.match(syncFunction, /Only owners can assign workspace access/);
  assert.match(syncFunction, /workspace_id=eq/);
});

test("isolates owner tenants and provides content-blind platform administration", async () => {
  const [page, portal, migration, suspensionMigration, syncFunction, proxy] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/platform-admin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608200006_owner_tenant_isolation.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608200009_suspend_owner_to_waiting.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/questdeck-sync/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/questdeck-sync/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /platform-admin/);
  assert.match(page, /load_access/);
  assert.match(portal, /Content-blind/);
  assert.match(portal, /there is no shared admin password/);
  assert.match(portal, /load_platform_owners/);
  assert.match(portal, /provision_owner/);
  assert.match(portal, /set_owner_status/);
  assert.match(migration, /questdeck_platform_admins/);
  assert.match(migration, /questdeck_owner_accounts/);
  assert.match(migration, /questdeck_workspace_role_permissions/);
  assert.match(migration, /is_questdeck_workspace_owner/);
  assert.doesNotMatch(migration.match(/create policy questdeck_members_shared_workspace_read[\s\S]*?\);/)?.[0] ?? "", /is_questdeck_owner/);
  assert.match(syncFunction, /membership\.role === "Owner"/);
  assert.match(syncFunction, /ownedWorkspaceIds\.includes\(workspaceId\)/);
  assert.match(syncFunction, /Owner accounts are managed in Owner administration/);
  assert.match(syncFunction, /shared\.filter\(\(membership: any\) => membership\.role !== "Owner"\)/);
  assert.match(syncFunction, /An owner cannot be removed from a workspace they own/);
  assert.match(syncFunction, /workspaceCount/);
  assert.match(syncFunction, /rpc\/suspend_questdeck_owner/);
  assert.match(portal, /move to the waiting list and lose all workspace access/);
  assert.match(suspensionMigration, /delete_questdeck_ownerless_workspace/);
  assert.match(suspensionMigration, /not exists[\s\S]*membership\.role = 'Owner'/);
  assert.match(suspensionMigration, /on conflict \(auth_user_id\) do update/);
  assert.doesNotMatch(proxy, /questdeck_members\?select=id/);
});

test("keeps first-time members in a three-day owner-managed waiting room", async () => {
  const [page, waitingRoom, waitingCss, migration, globalMigration, syncFunction] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/waiting-room.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/waiting-room.css", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608200007_workspace_waiting_room.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608200008_global_waiting_list.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/questdeck-sync/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /workspaceAccess === "waiting"/);
  assert.match(page, /Member waiting list/);
  assert.match(waitingRoom, /No workspace names, projects, cards, documents, or member information are visible/);
  assert.match(waitingRoom, /request_workspace_access/);
  assert.match(waitingRoom, /approve_waiting_request/);
  assert.match(waitingRoom, /decline_waiting_request/);
  assert.match(waitingRoom, /clear_waiting_requests/);
  assert.match(waitingRoom, /Every Owner can see this Questdeck-wide list/);
  assert.match(waitingRoom, /expires automatically three days/);
  assert.match(waitingCss, /waiting-room-page/);
  assert.match(migration, /questdeck_workspace_join_codes/);
  assert.match(migration, /questdeck_membership_requests/);
  assert.match(migration, /revoke all on public\.questdeck_membership_requests from anon, authenticated/);
  assert.match(globalMigration, /alter column target_workspace_id drop not null/);
  assert.match(globalMigration, /unique \(auth_user_id\)/);
  assert.match(syncFunction, /Only owners can manage the waiting list/);
  assert.match(syncFunction, /3 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(syncFunction, /context\.ownedWorkspaceIds\.includes\(targetWorkspaceId\)/);
  assert.match(syncFunction, /Only owners can clear the waiting list/);
});

test("offers persistent sidebar-accessible Korean screen fonts", async () => {
  const [page, css, migration, syncFunction] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608210010_member_ui_font.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/questdeck-sync/index.ts", import.meta.url), "utf8"),
  ]);
  for (const font of ["pretendard", "chosun", "bookk-gothic", "freesentation", "nexon", "school-safety", "bookk-myungjo", "classic"]) {
    assert.match(page, new RegExp(`id: "${font}"`));
    assert.match(migration, new RegExp(`'${font}'`));
  }
  assert.match(page, /update_ui_font/);
  assert.match(page, /questdeck-ui-font/);
  assert.match(page, /fontPickerOpen/);
  assert.match(page, /sidebar-font-button/);
  assert.match(page, /font-picker-modal/);
  assert.match(page, /Help & shortcuts[\s\S]*Screen font/);
  assert.match(css, /Pretendard Variable/);
  assert.match(css, /SchoolSafetyNotification/);
  assert.match(css, /\.sidebar-font-button/);
  assert.match(css, /\.font-picker-modal/);
  assert.match(syncFunction, /Unsupported screen font/);
  assert.match(syncFunction, /ui_font: fontId/);
});
