import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

test("production bundle contains the game, social card, and D1 migration", async () => {
  const serverAssetsUrl = new URL("../dist/server/assets/", import.meta.url);
  const ssrAssetsUrl = new URL("../dist/server/ssr/assets/", import.meta.url);
  const [serverAssets, ssrAssets, hosting, migration, social] = await Promise.all([
    readdir(serverAssetsUrl),
    readdir(ssrAssetsUrl),
    readFile(new URL("../dist/.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0000_lively_morg.sql", import.meta.url), "utf8"),
    stat(new URL("../dist/client/og.png", import.meta.url)),
  ]);
  const cssName = serverAssets.find((name) => name.startsWith("index-") && name.endsWith(".css"));
  assert.ok(cssName);
  const css = await readFile(new URL(cssName, serverAssetsUrl), "utf8");
  await access(new URL("../dist/server/index.js", import.meta.url));
  assert.ok(ssrAssets.some((name) => name.startsWith("BalootApp-")));
  assert.match(css, /table-surface/);
  assert.match(hosting, /"d1"\s*:\s*"DB"/);
  assert.match(migration, /CREATE TABLE `rooms`/);
  assert.match(migration, /CREATE TABLE `room_players`/);
  assert.ok(social.size > 100_000);
});

test("ships product metadata and removes starter artifacts", async () => {
  const [page, layout, packageJson, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<BalootApp \/>/);
  assert.match(layout, /generateMetadata/);
  assert.match(layout, /openGraph:/);
  assert.match(layout, /\/og\.png/);
  assert.match(layout, /lang="ar" dir="rtl"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(css, /--felt:\s*#0c4936/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
});
