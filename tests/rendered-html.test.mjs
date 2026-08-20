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
