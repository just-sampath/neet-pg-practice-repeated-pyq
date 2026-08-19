import { readFile, readdir } from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import { projectRoot } from "./fixtures";

async function sourceFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: URL[] = [];
  for (const entry of entries) {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) files.push(...(await sourceFiles(url)));
    else if (/\.(?:ts|tsx|css)$/.test(entry.name)) files.push(url);
  }
  return files;
}

describe("interface design constraints", () => {
  test("keeps source and tests in separate top-level trees", async () => {
    const files = await sourceFiles(new URL("src/", projectRoot));
    expect(files.some((file) => /(?:\.test|\.spec)\.[^.]+$/.test(file.pathname))).toBe(false);
  });

  test("rejects common generated-UI styling and copy tells", async () => {
    const files = await sourceFiles(new URL("src/", projectRoot));
    const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
    const banned = [
      /one exam,? one portal/i,
      /\b(?:empower|unlock|transform) your\b/i,
      /(?:linear|radial)-gradient\s*\(/i,
      /backdrop-filter\s*:/i,
      /\b(?:purple|violet|indigo)-(?:500|600)\b/i,
      /rounded-(?:2xl|3xl)/i,
      /glassmorph/i,
    ];
    for (const pattern of banned) expect(source).not.toMatch(pattern);
  });

  test("shows only canonical A-D option labels without numeric option badges", async () => {
    const quizScreen = await readFile(new URL("../../src/components/QuizScreen.tsx", import.meta.url), "utf8");
    const styles = await readFile(new URL("../../src/styles.css", import.meta.url), "utf8");

    expect(quizScreen).not.toContain("answer-option__key");
    expect(quizScreen).not.toContain("displayIndex + 1");
    expect(quizScreen).not.toContain("optionOrderByQuestionId");
    expect(quizScreen).toContain("Keys A–D answer");
    expect(styles).not.toContain(".answer-option__key");
  });
});
