import { describe, expect, test } from "bun:test";
import { scoreAttempt } from "../../src/domain/scoring";
import type { Attempt, ResponseRecord } from "../../src/domain/types";
import { loadAllTeaching, loadTestBank } from "./fixtures";

function response(selectedOptionId: string | null): ResponseRecord {
  return {
    selectedOptionId,
    firstCommittedOptionId: selectedOptionId,
    committed: true,
    updatedAt: 1,
  };
}

describe("NEET PG scoring", () => {
  test("applies +4, -1, and 0 to correct, wrong, and skipped responses", async () => {
    const [bank, teaching] = await Promise.all([loadTestBank(), loadAllTeaching()]);
    const eligible = [...teaching.values()].filter((record) => record.answer.scoringEligible).slice(0, 3);
    const [correctRecord, wrongRecord, skippedRecord] = eligible;
    const wrongQuestion = bank.questionById.get(wrongRecord.questionId)!;
    const wrongOption = wrongQuestion.options.find(
      (option) => !wrongRecord.answer.correctOptionIds.includes(option.id),
    )!;
    const questionIds = eligible.map((record) => record.questionId);
    const attempt = {
      questionIds,
      responsesByQuestionId: {
        [correctRecord.questionId]: response(correctRecord.answer.correctOptionIds[0]),
        [wrongRecord.questionId]: response(wrongOption.id),
        [skippedRecord.questionId]: response(null),
      },
      elapsedSecondsByQuestionId: Object.fromEntries(questionIds.map((id, index) => [id, 40 + index * 70])),
      sectionByQuestionId: {},
    } as Attempt;

    const result = scoreAttempt(attempt, bank, teaching);
    expect(result.correct).toBe(1);
    expect(result.incorrect).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.score).toBe(3);
    expect(result.maximumScore).toBe(12);
    expect(result.accuracy).toBe(50);
    expect(result.evaluations.filter((evaluation) => evaluation.isSlow)).toHaveLength(2);
  });

  test("excludes teaching-only items from the maximum score", async () => {
    const [bank, teaching] = await Promise.all([loadTestBank(), loadAllTeaching()]);
    const eligible = [...teaching.values()].find((record) => record.answer.scoringEligible)!;
    const unscored = [...teaching.values()].find((record) => !record.answer.scoringEligible)!;
    const attempt = {
      questionIds: [eligible.questionId, unscored.questionId],
      responsesByQuestionId: {
        [eligible.questionId]: response(eligible.answer.correctOptionIds[0]),
        [unscored.questionId]: response(unscored.answer.correctOptionIds[0] ?? "A"),
      },
      elapsedSecondsByQuestionId: {},
      sectionByQuestionId: {},
    } as Attempt;
    const result = scoreAttempt(attempt, bank, teaching);
    expect(result.score).toBe(4);
    expect(result.maximumScore).toBe(4);
    expect(result.unscored).toBe(1);
  });
});
