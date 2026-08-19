import type {
  Attempt,
  BankData,
  QuestionEvaluation,
  ScoreSummary,
  TeachingRecord,
} from "./types";

export function scoreAttempt(
  attempt: Attempt,
  bank: BankData,
  teachingByQuestionId: Map<string, TeachingRecord>,
): ScoreSummary {
  const evaluations: QuestionEvaluation[] = attempt.questionIds.map((questionId) => {
    const question = bank.questionById.get(questionId);
    const teaching = teachingByQuestionId.get(questionId);
    if (!question || !teaching) throw new Error(`Missing scoring data for ${questionId}.`);
    const response = attempt.responsesByQuestionId[questionId];
    const selectedOptionId = response?.firstCommittedOptionId ?? response?.selectedOptionId ?? null;
    const elapsedSeconds = attempt.elapsedSecondsByQuestionId[questionId] ?? 0;
    const base = {
      questionId,
      subjectId: question.classification.subjectId,
      curriculumPhaseId: question.classification.curriculumPhaseId,
      sectionId: attempt.sectionByQuestionId[questionId] ?? null,
      selectedOptionId,
      correctOptionIds: teaching.answer.correctOptionIds,
      elapsedSeconds,
      isSlow: elapsedSeconds > question.analytics.timeGuidance.slowAfterSeconds,
    };
    if (!teaching.answer.scoringEligible) {
      return { ...base, status: "unscored", points: 0 };
    }
    if (!selectedOptionId) {
      return { ...base, status: "skipped", points: 0 };
    }
    if (teaching.answer.correctOptionIds.includes(selectedOptionId)) {
      return { ...base, status: "correct", points: 4 };
    }
    return { ...base, status: "incorrect", points: -1 };
  });

  const count = (status: QuestionEvaluation["status"]) =>
    evaluations.filter((evaluation) => evaluation.status === status).length;
  const correct = count("correct");
  const incorrect = count("incorrect");
  const skipped = count("skipped");
  const unscored = count("unscored");
  const scoredQuestions = correct + incorrect + skipped;
  const attempted = correct + incorrect;
  return {
    correct,
    incorrect,
    skipped,
    unscored,
    attempted,
    scoredQuestions,
    score: evaluations.reduce((sum, evaluation) => sum + evaluation.points, 0),
    maximumScore: scoredQuestions * 4,
    accuracy: attempted ? (correct / attempted) * 100 : 0,
    evaluations,
  };
}

export interface BreakdownRow {
  id: string;
  total: number;
  correct: number;
  incorrect: number;
  skipped: number;
  score: number;
  accuracy: number;
  totalSeconds: number;
  slowCount: number;
}

export function buildBreakdown(
  evaluations: QuestionEvaluation[],
  dimension: "subjectId" | "curriculumPhaseId" | "sectionId",
): BreakdownRow[] {
  const groups = new Map<string, QuestionEvaluation[]>();
  for (const evaluation of evaluations) {
    if (evaluation.status === "unscored") continue;
    const value = evaluation[dimension];
    if (!value) continue;
    const rows = groups.get(value) ?? [];
    rows.push(evaluation);
    groups.set(value, rows);
  }
  return [...groups.entries()].map(([id, rows]) => {
    const correct = rows.filter((row) => row.status === "correct").length;
    const incorrect = rows.filter((row) => row.status === "incorrect").length;
    const skipped = rows.filter((row) => row.status === "skipped").length;
    const attempted = correct + incorrect;
    return {
      id,
      total: rows.length,
      correct,
      incorrect,
      skipped,
      score: rows.reduce((sum, row) => sum + row.points, 0),
      accuracy: attempted ? (correct / attempted) * 100 : 0,
      totalSeconds: rows.reduce((sum, row) => sum + row.elapsedSeconds, 0),
      slowCount: rows.filter((row) => row.isSlow).length,
    };
  });
}
