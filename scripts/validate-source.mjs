import { lstat, readFile, readdir, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const forbiddenPaths = [
  ".openai",
  "node_modules",
  "dist-github",
  "app",
  "build",
  "db",
  "drizzle",
  "worker",
  "examples",
  "next.config.ts",
  "vite.github.config.ts",
  "postcss.config.mjs",
  "package-lock.json",
  "scripts/sites-env.sh",
  "scripts/build-verified.sh",
  "scripts/install-ci.sh",
  "scripts/validate-artifact.sh",
];

for (const path of forbiddenPaths) {
  try {
    await lstat(new URL(path, root));
    throw new Error(`Development-only artifact is present: ${path}`);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
    throw error;
  }
}

for (const required of [
  ".github/workflows/deploy-pages.yml",
  "public/.nojekyll",
  "public/data/manifest.json",
  "public/data/questions-core.json",
  "src/main.tsx",
  "tests/unit/data-integrity.test.ts",
  "vite.config.ts",
]) {
  await stat(new URL(required, root));
}

const packageDocument = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const dependencyNames = Object.keys({
  ...packageDocument.dependencies,
  ...packageDocument.devDependencies,
});
for (const fragment of ["next", "vinext", "cloudflare", "drizzle", "tailwind", "wrangler"]) {
  if (dependencyNames.some((name) => name.toLowerCase().includes(fragment))) {
    throw new Error(`Development-only dependency is present: ${fragment}`);
  }
}

const lockfile = await readFile(new URL("bun.lock", root), "utf8");
for (const pattern of [/vinext/i, /@cloudflare\//i, /"drizzle[^"\n]*"/i, /"next"\s*:/i, /"tailwind[^"\n]*"/i, /"wrangler[^"\n]*"/i]) {
  if (pattern.test(lockfile)) throw new Error(`Bun lockfile contains a development-only package: ${pattern}`);
}

const [viteConfig, tsconfig, workflow, html] = await Promise.all([
  readFile(new URL("vite.config.ts", root), "utf8"),
  readFile(new URL("tsconfig.json", root), "utf8"),
  readFile(new URL(".github/workflows/deploy-pages.yml", root), "utf8"),
  readFile(new URL("index.html", root), "utf8"),
]);

for (const [name, source] of [["Vite config", viteConfig], ["TypeScript config", tsconfig]]) {
  if (/\.openai|vinext|cloudflare|drizzle|next-env|sites-vite/i.test(source)) {
    throw new Error(`${name} still references a development-only integration.`);
  }
}
if (!viteConfig.includes('base: "./"')) throw new Error("Vite must use a repository-portable relative base.");
if (!workflow.includes('path: "./dist-github/"')) throw new Error("Pages must upload the compiled output directory.");
if (!workflow.includes("actions/upload-pages-artifact") || !workflow.includes("actions/deploy-pages")) {
  throw new Error("Pages artifact upload or deployment step is missing.");
}
if (!html.includes('src="./src/main.tsx"')) throw new Error("The Vite source entry must be relative.");

const core = JSON.parse(await readFile(new URL("public/data/questions-core.json", root), "utf8"));
if (core.questions.length !== 377) throw new Error("Expected 377 questions.");
for (const question of core.questions) {
  const ids = question.options.map((option) => option.id);
  if (JSON.stringify(ids) !== JSON.stringify(["A", "B", "C", "D"])) {
    throw new Error(`${question.id} is not stored in canonical A-D option order.`);
  }
}

async function rejectLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    const metadata = await lstat(child);
    if (metadata.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${child.pathname}`);
    if (entry.isDirectory()) await rejectLinks(child);
  }
}
await rejectLinks(root);

console.log(JSON.stringify({
  status: "passed",
  questions: core.questions.length,
  forbiddenArtifactsChecked: forbiddenPaths.length,
  dependencies: dependencyNames.length,
}, null, 2));
