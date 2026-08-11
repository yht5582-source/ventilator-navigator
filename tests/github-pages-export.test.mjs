import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pagesBasePath = "/ventilator-navigator";
const exportDirectory = resolve(fileURLToPath(new URL("../out/", import.meta.url)));

const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

async function startExportServer() {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const relativePath =
      pathname === pagesBasePath || pathname === `${pagesBasePath}/`
        ? "index.html"
        : pathname.startsWith(`${pagesBasePath}/`)
          ? decodeURIComponent(pathname.slice(pagesBasePath.length + 1))
          : null;

    if (!relativePath) {
      response.writeHead(404).end();
      return;
    }

    const filePath = resolve(exportDirectory, relativePath);
    if (!filePath.startsWith(`${exportDirectory}${sep}`)) {
      response.writeHead(403).end();
      return;
    }

    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      response.writeHead(404).end();
    }
  });

  await new Promise((resolveListening) => server.listen(0, "127.0.0.1", resolveListening));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  return {
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
    origin: `http://127.0.0.1:${address.port}`,
  };
}

test("serves the exported page and every local asset from the repository path", async (t) => {
  const exportServer = await startExportServer();
  t.after(exportServer.close);

  const pageUrl = `${exportServer.origin}${pagesBasePath}/`;
  const pageResponse = await fetch(pageUrl);
  assert.equal(pageResponse.status, 200);
  const html = await pageResponse.text();

  assert.match(html, /Ventilator Navigator/);
  assert.match(html, /成人呼吸器模式/);

  const rootRelativeAssets = [
    ...html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)=["'](\/[^"']+)["'][^>]*>/gi),
  ].map((match) => match[1]);

  assert.ok(rootRelativeAssets.length > 0, "the exported page should reference local assets");
  assert.ok(
    rootRelativeAssets.every((url) => url.startsWith(`${pagesBasePath}/`)),
    `all local assets should use ${pagesBasePath}; received ${rootRelativeAssets.join(", ")}`,
  );

  const uniqueAssetUrls = [...new Set(rootRelativeAssets)];
  const assetResponses = await Promise.all(
    uniqueAssetUrls.map(async (assetPath) => ({
      assetPath,
      response: await fetch(`${exportServer.origin}${assetPath}`),
    })),
  );

  for (const { assetPath, response } of assetResponses) {
    assert.equal(response.status, 200, `${assetPath} should load successfully`);
  }

  const stylesheetResponses = assetResponses.filter(({ assetPath }) =>
    new URL(assetPath, pageUrl).pathname.endsWith(".css"),
  );
  const stylesheetAssets = [];

  for (const { assetPath, response } of stylesheetResponses) {
    const stylesheetUrl = new URL(assetPath, pageUrl);
    const css = await response.text();
    for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (!match[1].startsWith("data:")) {
        stylesheetAssets.push(new URL(match[1], stylesheetUrl));
      }
    }
  }

  assert.ok(stylesheetAssets.length > 0, "the stylesheet should reference exported fonts");
  for (const assetUrl of stylesheetAssets) {
    assert.ok(assetUrl.pathname.startsWith(`${pagesBasePath}/`));
    const response = await fetch(assetUrl);
    assert.equal(response.status, 200, `${assetUrl.pathname} should load successfully`);
  }
});
