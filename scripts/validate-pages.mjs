import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";

const root = new URL("../dist-github/", import.meta.url);
const required = [
  "index.html",
  "site.webmanifest",
  "sw.js",
  ".nojekyll",
  "data/manifest.json",
  "data/modes.json",
  "data/taxonomy.json",
  "data/questions-core.json",
];

for (const path of required) {
  await stat(new URL(path, root));
}

const html = await readFile(new URL("index.html", root), "utf8");
if (!html.includes("<title>NEET PG 377</title>")) throw new Error("Static title is missing.");
if (!html.includes("site.webmanifest")) throw new Error("Web app manifest is not linked.");
if (html.includes("src/main.tsx")) throw new Error("The source entrypoint leaked into the production HTML.");
if (/\b(?:src|href)=["']\/(?!\/)/.test(html)) {
  throw new Error("A root-absolute asset URL would break GitHub Pages repository deployments.");
}

const htmlAssetPaths = [...html.matchAll(/\b(?:src|href)=["'](\.\/[^"']+)["']/g)]
  .map((match) => match[1].replace(/^\.\//, ""));
for (const path of htmlAssetPaths) await stat(new URL(path, root));

const webManifest = JSON.parse(await readFile(new URL("site.webmanifest", root), "utf8"));
if (webManifest.start_url !== "./" || webManifest.scope !== "./") {
  throw new Error("The web app manifest is not scoped to the deployed repository path.");
}
for (const icon of webManifest.icons ?? []) {
  await stat(new URL(String(icon.src).replace(/^\.\//, ""), root));
}

const serviceWorker = await readFile(new URL("sw.js", root), "utf8");
if (!serviceWorker.includes('CACHE_VERSION = "neet-pg-377-v3"')) {
  throw new Error("The expected service-worker cache version is missing.");
}
if (serviceWorker.includes('register("/sw.js"')) {
  throw new Error("The service worker uses a root-absolute URL.");
}

const manifest = JSON.parse(await readFile(new URL("data/manifest.json", root), "utf8"));
const core = JSON.parse(await readFile(new URL("data/questions-core.json", root), "utf8"));
const taxonomy = JSON.parse(await readFile(new URL("data/taxonomy.json", root), "utf8"));
if (core.questions.length !== 377) throw new Error("Expected 377 core questions.");
if (taxonomy.subjects.length !== 19) throw new Error("Expected 19 canonical subjects.");

for (const entry of manifest.files) {
  const file = new URL(`data/${entry.path}`, root);
  const bytes = await readFile(file);
  if (bytes.length !== entry.bytes) throw new Error(`Byte count mismatch: ${entry.path}`);
  if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
    throw new Error(`Checksum mismatch: ${entry.path}`);
  }
}

const assets = await readdir(new URL("assets/", root));
if (!assets.some((name) => name.endsWith(".js"))) throw new Error("JavaScript bundle is missing.");
if (!assets.some((name) => name.endsWith(".css"))) throw new Error("CSS bundle is missing.");

const pagesConfig = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
if (!pagesConfig.includes('base: "./"')) {
  throw new Error("The GitHub Pages Vite build must use a portable relative base.");
}

const workflow = await readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");
if (!workflow.includes("actions/upload-pages-artifact") || !workflow.includes("actions/deploy-pages")) {
  throw new Error("The GitHub Pages artifact deployment workflow is incomplete.");
}

console.log(JSON.stringify({
  status: "passed",
  questions: core.questions.length,
  subjects: taxonomy.subjects.length,
  manifestFilesVerified: manifest.files.length,
  staticAssets: assets.length,
}, null, 2));
