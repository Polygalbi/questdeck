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

test("server-renders the Questdeck workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Questdeck — Game Production, in Play<\/title>/i);
  assert.match(html, /Production board/);
  assert.match(html, /Project Nightfall/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("includes the high-volume board and backup controls", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /className="quick-card-form"/);
  assert.match(page, /ownerFilter/);
  assert.match(page, /disciplineFilter/);
  assert.match(page, /dueFilter/);
  assert.match(page, /downloadWorkspaceBackup/);
  assert.match(page, /restoreBoardBackup/);
  assert.match(css, /board-density-compact/);
  assert.match(css, /\.column-cards\{[^}]*overflow-y:auto/);
});

test("includes working document editing and table controls", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /rememberDocumentSelection/);
  assert.match(page, /handleDocumentKeyDown/);
  assert.match(page, /document-table-picker/);
  assert.match(page, /mutateDocumentTable/);
  assert.match(css, /\.rich-document-content ol\{list-style:decimal/);
  assert.match(css, /\.document-editor-assist/);
});
