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

  test("keeps internal bank-audit metrics and learner assumptions off the home screen", async () => {
    const homeScreen = await readFile(new URL("../../src/components/HomeScreen.tsx", import.meta.url), "utf8");

    for (const text of ["Bank audit", "GT eligible", "Teaching only", "Key corrected", "377 total"]) {
      expect(homeScreen).not.toContain(text);
    }
    expect(homeScreen).not.toContain("bank.manifest.bank.questionCount");
    expect(homeScreen).not.toContain("bank.manifest.bank.contentVersion");
    expect(homeScreen).not.toMatch(/internship|first[- ]year subject|5\s*[~–-]\s*6 years/i);
  });

  test("gives option teaching and rewritten examples readable, explicit structure", async () => {
    const [panel, styles] = await Promise.all([
      readFile(new URL("../../src/components/TeachingPanel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../src/styles.css", import.meta.url), "utf8"),
    ]);

    for (const text of ["Foundation", "Compare with the original answer", "Decision rule", "Use this option when", "How to recognise the change", "Best answer:"]) {
      expect(panel).toContain(text);
    }
    expect(panel).toContain("feedback.learningExplanation.foundation");
    expect(panel).toContain("feedback.whenThisCanBeRight.recognitionRule");
    expect(styles).toMatch(/\.option-explanation p\s*\{[^}]*font-size:\s*16px/s);
    expect(styles).toMatch(/\.option-review summary\s*\{[^}]*font-size:\s*15px/s);
    expect(styles).toMatch(/\.conditional-teaching\s*\{[^}]*font-size:\s*15px/s);
    expect(styles).toMatch(/\.conditional-teaching \.rewritten-example__stem\s*\{[^}]*font-size:\s*17px/s);
  });
});
