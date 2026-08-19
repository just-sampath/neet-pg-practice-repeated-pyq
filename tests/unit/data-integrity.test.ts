import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import type { Manifest, TeachingRecord } from "../../src/domain/types";
import { dataRoot, loadAllTeaching, loadTestBank, readJson } from "./fixtures";

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      keys.add(key);
      collectKeys(item, keys);
    }
  }
  return keys;
}

describe("packaged question bank", () => {
  test("keeps all cross-file records complete and answer data out of the core payload", async () => {
    const [bank, teaching] = await Promise.all([loadTestBank(), loadAllTeaching()]);
    expect(bank.questions).toHaveLength(377);
    expect(bank.questionById.size).toBe(377);
    expect(bank.taxonomy.subjects).toHaveLength(19);
    expect(teaching.size).toBe(377);
    expect([...teaching.values()].reduce((sum, record) => sum + Object.keys(record.optionFeedback).length, 0)).toBe(1508);
    expect(new Set(bank.questions.map((question) => question.id))).toEqual(new Set(teaching.keys()));
    for (const question of bank.questions) {
      expect(question.options.map((option) => option.id)).toEqual(["A", "B", "C", "D"]);
      expect(Object.keys(teaching.get(question.id)?.optionFeedback ?? {}).sort()).toEqual(["A", "B", "C", "D"]);
    }
    const coreKeys = collectKeys({ questions: bank.questions });
    for (const forbidden of ["answer", "correctOptionIds", "optionFeedback", "memoryHook", "examPearl"]) {
      expect(coreKeys.has(forbidden)).toBe(false);
    }
  });

  test("verifies every manifest checksum and media reference", async () => {
    const manifest = await readJson<Manifest>("manifest.json");
    for (const entry of manifest.files) {
      const bytes = await readFile(new URL(entry.path, dataRoot));
      expect(bytes.length).toBe(entry.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
    }
    const bank = await loadTestBank();
    const media = bank.questions.flatMap((question) => question.prompt.media);
    expect(media).toHaveLength(19);
    for (const asset of media) await stat(new URL(asset.assetPath, dataRoot));
  });

  test("provides a detailed beginner explanation and worked variation for every option", async () => {
    const teaching = await loadAllTeaching();
    const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

    for (const record of teaching.values()) {
      for (const [optionId, feedback] of Object.entries(record.optionFeedback)) {
        expect(feedback.learningExplanation.foundation.startsWith(record.answer.summary)).toBe(true);
        expect(words(feedback.learningExplanation.foundation)).toBeGreaterThanOrEqual(35);
        expect(words(feedback.learningExplanation.optionReasoning)).toBeGreaterThanOrEqual(30);
        expect(words(feedback.learningExplanation.comparison)).toBeGreaterThanOrEqual(25);
        expect(words(feedback.learningExplanation.decisionRule)).toBeGreaterThanOrEqual(45);
        expect(words(feedback.whenThisCanBeRight.condition)).toBeGreaterThanOrEqual(35);
        expect(words(feedback.whenThisCanBeRight.recognitionRule)).toBeGreaterThanOrEqual(35);
        expect(words(feedback.whenThisCanBeRight.exampleQuestion.stem)).toBeGreaterThanOrEqual(15);
        expect(words(feedback.whenThisCanBeRight.exampleQuestion.explanation)).toBeGreaterThanOrEqual(45);
        expect(feedback.whenThisCanBeRight.exampleQuestion.correctOptionId).toBe(optionId);

        const content = [
          ...Object.values(feedback.learningExplanation),
          feedback.whenThisCanBeRight.condition,
          feedback.whenThisCanBeRight.recognitionRule,
          feedback.whenThisCanBeRight.exampleQuestion.stem,
          feedback.whenThisCanBeRight.exampleQuestion.explanation,
        ].join(" ");
        expect(content).not.toMatch(/In a rewritten version of the original question/i);
        expect(content).not.toMatch(/This option can be right when a revised stem asks/i);
        expect(content).not.toMatch(/internship|completed their MBBS|5\s*[~–-]\s*6 years/i);
        expect(content).not.toMatch(/undefined|\[object Object\]/);
      }
    }
  });

  test("retains unsafe source items as unscored teaching rather than strict GT candidates", async () => {
    const [bank, teaching] = await Promise.all([loadTestBank(), loadAllTeaching()]);
    const records = [...teaching.values()];
    expect(records.filter((record) => record.answer.scoringEligible)).toHaveLength(317);
    expect(records.filter((record) => !record.answer.scoringEligible)).toHaveLength(60);
    for (const record of records.filter((candidate) => !candidate.answer.scoringEligible)) {
      expect(bank.questionById.get(record.questionId)?.modeEligibility.neet_pg_2026).toBe(false);
    }
  });

  test("contains no removed schema or reference fields", async () => {
    const bank = await loadTestBank();
    const teaching = [...(await loadAllTeaching()).values()] as TeachingRecord[];
    const keys = collectKeys({ bank, teaching });
    for (const forbidden of ["schemaVersion", "references", "referenceIds", "ruleReferenceIds"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });
});
