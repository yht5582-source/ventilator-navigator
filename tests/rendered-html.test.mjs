import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function renderHome() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders development preview metadata", async () => {
  const response = await renderHome();

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("renders the clinical decision-support entry experience", async () => {
  const response = await renderHome();
  const html = await response.text();

  assert.match(html, /Ventilator Navigator/);
  assert.match(html, /成人呼吸器模式<br\s*\/?>(?:\s*)互動決策助手/);
  assert.match(html, /開始新個案/);
  assert.match(html, /快速教學模式/);
  assert.match(html, /Mode 比較/);
  assert.match(html, /Final ventilator management requires bedside clinical assessment/);
});
