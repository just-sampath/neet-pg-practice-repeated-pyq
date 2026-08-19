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

console.log(JSON.stringify({
  status: "passed",
  questions: core.questions.length,
  subjects: taxonomy.subjects.length,
  manifestFilesVerified: manifest.files.length,
  staticAssets: assets.length,
}, null, 2));
