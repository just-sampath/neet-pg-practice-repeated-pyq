import { describe, expect, test } from "bun:test";
import { createAttempt, getSectionQuestionIds } from "../../src/domain/selection";
import { loadTestBank } from "./fixtures";

describe("attempt selection", () => {
  test("strict GT selection is deterministic, unique, quota-correct, and section-balanced", async () => {
    const bank = await loadTestBank();
    const quotas = bank.modes.neetPg2026.selection.quotaStrategy?.subjectQuotas ?? {};

    for (let index = 0; index < 250; index += 1) {
      const seed = `validation-seed-${index}`;
      const config = {
        subjectIds: bank.taxonomy.subjects.map((subject) => subject.id),
        questionCount: 180,
        revealPolicy: "after_attempt" as const,
      };
      const first = createAttempt({ bank, modeId: "neet_pg_2026", config, seed, now: 1_800_000_000_000 });
      const second = createAttempt({ bank, modeId: "neet_pg_2026", config, seed, now: 1_800_000_000_000 });

      expect(first.questionIds).toEqual(second.questionIds);
      expect(first.optionOrderByQuestionId).toEqual(second.optionOrderByQuestionId);
      expect(first.questionIds).toHaveLength(180);
      expect(new Set(first.questionIds).size).toBe(180);
      for (const sectionId of ["A", "B", "C", "D", "E"]) {
        expect(getSectionQuestionIds(first, sectionId)).toHaveLength(36);
      }
      for (const [subjectId, quota] of Object.entries(quotas)) {
        const count = first.questionIds.filter(
          (questionId) => bank.questionById.get(questionId)?.classification.subjectId === subjectId,
        ).length;
        expect(count).toBe(quota);
      }
      for (const optionOrder of Object.values(first.optionOrderByQuestionId)) {
        expect([...optionOrder].sort()).toEqual(["A", "B", "C", "D"]);
      }
    }
  });

  test("practice filters subjects and caps requested count to the available pool", async () => {
    const bank = await loadTestBank();
    const attempt = createAttempt({
      bank,
      modeId: "subject_practice",
      config: {
        subjectIds: ["anaesthesiology"],
        questionCount: 200,
        revealPolicy: "after_each_submission",
      },
      seed: "subject-test",
      now: 1_800_000_000_000,
    });
    expect(attempt.questionIds).toHaveLength(bank.manifest.counts.byCanonicalSubject.anaesthesiology);
    expect(
      attempt.questionIds.every(
        (questionId) => bank.questionById.get(questionId)?.classification.subjectId === "anaesthesiology",
      ),
    ).toBe(true);
  });

  test("least-exposed questions are selected before repeatedly seen questions", async () => {
    const bank = await loadTestBank();
    const candidates = bank.questions.filter((question) => question.classification.subjectId === "anatomy");
    const exposure = Object.fromEntries(candidates.map((question) => [question.id, 9]));
    const preferred = candidates.slice(0, 10);
    for (const question of preferred) exposure[question.id] = 0;
    const attempt = createAttempt({
      bank,
      modeId: "subject_practice",
      config: { subjectIds: ["anatomy"], questionCount: 10, revealPolicy: "after_attempt" },
      exposure,
      seed: "exposure-test",
      now: 1_800_000_000_000,
    });
    expect(new Set(attempt.questionIds)).toEqual(new Set(preferred.map((question) => question.id)));
  });
});
