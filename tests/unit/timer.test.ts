import { describe, expect, test } from "bun:test";
import { advanceStrictSection, remainingSectionSeconds } from "../../src/domain/selection";
import type { Attempt } from "../../src/domain/types";

const baseAttempt = {
  status: "active",
  activeSectionId: "A",
  submittedSectionIds: [],
  sectionDeadlines: { A: 1_000_000 },
  questionIds: Array.from({ length: 180 }, (_, index) => `q${index + 1}`),
  sectionByQuestionId: Object.fromEntries(
    Array.from({ length: 180 }, (_, index) => [`q${index + 1}`, ["A", "B", "C", "D", "E"][Math.floor(index / 36)]]),
  ),
  currentQuestionId: "q1",
  completedAt: null,
  updatedAt: 0,
} as unknown as Attempt;

describe("section deadlines", () => {
  test("derives remaining time from the persisted deadline", () => {
    expect(remainingSectionSeconds(baseAttempt, 958_250)).toBe(42);
    expect(remainingSectionSeconds(baseAttempt, 1_010_000)).toBe(0);
  });

  test("locks the current section and starts the next deadline", () => {
    const next = advanceStrictSection(baseAttempt, 2520, 2_000_000);
    expect(next.activeSectionId).toBe("B");
    expect(next.submittedSectionIds).toEqual(["A"]);
    expect(next.currentQuestionId).toBe("q37");
    expect(next.sectionDeadlines.B).toBe(2_000_000 + 2_520_000);
  });

  test("completes after section E", () => {
    const final = advanceStrictSection(
      { ...baseAttempt, activeSectionId: "E", submittedSectionIds: ["A", "B", "C", "D"] },
      2520,
      3_000_000,
    );
    expect(final.status).toBe("completed");
    expect(final.activeSectionId).toBeNull();
    expect(final.completedAt).toBe(3_000_000);
  });
});
