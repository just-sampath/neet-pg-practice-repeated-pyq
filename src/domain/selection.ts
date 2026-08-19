import type {
  Attempt,
  AttemptConfig,
  BankData,
  ModeId,
  QuestionCore,
} from "./types";

type RandomSource = () => number;

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed: string): RandomSource {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function selectLeastExposed(
  questions: QuestionCore[],
  count: number,
  exposure: Record<string, number>,
  random: RandomSource,
): QuestionCore[] {
  return shuffled(questions, random)
    .sort((left, right) => (exposure[left.id] ?? 0) - (exposure[right.id] ?? 0))
    .slice(0, count);
}

function assignBalancedSections(
  selected: QuestionCore[],
  random: RandomSource,
): { ordered: QuestionCore[]; sectionByQuestionId: Record<string, string> } {
  const sectionIds = ["A", "B", "C", "D", "E"];
  const sections = sectionIds.map(() => [] as QuestionCore[]);
  const bySubject = new Map<string, QuestionCore[]>();

  for (const question of selected) {
    const bucket = bySubject.get(question.classification.subjectId) ?? [];
    bucket.push(question);
    bySubject.set(question.classification.subjectId, bucket);
  }

  const subjects = shuffled([...bySubject.keys()], random);
  let tieOffset = Math.floor(random() * sections.length);
  for (const subjectId of subjects) {
    const questions = shuffled(bySubject.get(subjectId) ?? [], random);
    for (const question of questions) {
      const smallestSize = Math.min(...sections.map((section) => section.length));
      const candidates = sections
        .map((section, index) => ({ index, size: section.length }))
        .filter(({ size }) => size === smallestSize)
        .map(({ index }) => index);
      const sectionIndex = candidates[tieOffset % candidates.length];
      sections[sectionIndex].push(question);
      tieOffset += 1;
    }
  }

  const ordered = sections.flatMap((section, index) =>
    shuffled(section, seededRandom(`section-${index}-${random()}`)),
  );
  const sectionByQuestionId: Record<string, string> = {};
  sections.forEach((section, index) => {
    for (const question of section) sectionByQuestionId[question.id] = sectionIds[index];
  });
  return { ordered, sectionByQuestionId };
}

function makeAttemptId(seed: string, now: number): string {
  return `attempt-${now.toString(36)}-${hashSeed(seed).toString(36)}`;
}

export interface CreateAttemptOptions {
  bank: BankData;
  modeId: ModeId;
  config: AttemptConfig;
  exposure?: Record<string, number>;
  seed?: string;
  now?: number;
}

export function createAttempt({
  bank,
  modeId,
  config,
  exposure = {},
  seed = `${Date.now()}-${Math.random()}`,
  now = Date.now(),
}: CreateAttemptOptions): Attempt {
  const random = seededRandom(seed);
  let selected: QuestionCore[];
  let sectionByQuestionId: Record<string, string> = {};
  let activeSectionId: string | null = null;
  const sectionDeadlines: Record<string, number> = {};

  if (modeId === "neet_pg_2026") {
    const quotas = bank.modes.neetPg2026.selection.quotaStrategy?.subjectQuotas;
    if (!quotas) throw new Error("Strict GT subject quotas are missing.");
    selected = Object.entries(quotas).flatMap(([subjectId, quota]) => {
      const candidates = bank.questions.filter(
        (question) =>
          question.classification.subjectId === subjectId &&
          question.modeEligibility.neet_pg_2026,
      );
      if (candidates.length < quota) {
        throw new Error(`${subjectId} has ${candidates.length} eligible questions; ${quota} required.`);
      }
      return selectLeastExposed(candidates, quota, exposure, random);
    });
    if (selected.length !== 180) {
      throw new Error(`Strict GT selection produced ${selected.length} questions instead of 180.`);
    }
    const assignment = assignBalancedSections(selected, random);
    selected = assignment.ordered;
    sectionByQuestionId = assignment.sectionByQuestionId;
    activeSectionId = "A";
    const durationSeconds = bank.modes.neetPg2026.sections?.items[0]?.durationSeconds ?? 2520;
    sectionDeadlines.A = now + durationSeconds * 1000;
  } else {
    const selectedSubjects = new Set(config.subjectIds);
    let candidates = bank.questions.filter(
      (question) =>
        selectedSubjects.has(question.classification.subjectId) &&
        question.modeEligibility[modeId],
    );
    if (config.imageBasedOnly) {
      candidates = candidates.filter((question) => question.prompt.media.length > 0);
    }
    selected = selectLeastExposed(
      candidates,
      Math.min(config.questionCount, candidates.length),
      exposure,
      random,
    );
    selected = shuffled(selected, random);
  }

  if (selected.length === 0) throw new Error("No questions match this configuration.");

  const optionOrderByQuestionId = Object.fromEntries(
    selected.map((question) => [
      question.id,
      question.options
        .map((option) => option.id)
        .sort((left, right) => left.localeCompare(right)),
    ]),
  );

  const modeDefinition =
    modeId === "subject_practice"
      ? bank.modes.subjectPractice
      : modeId === "flexible_quiz"
        ? bank.modes.flexibleQuiz
        : bank.modes.neetPg2026;

  return {
    id: makeAttemptId(seed, now),
    contentVersion: bank.manifest.bank.contentVersion,
    modeId,
    modeLabel: modeDefinition.label,
    status: "active",
    seed,
    config,
    questionIds: selected.map((question) => question.id),
    optionOrderByQuestionId,
    sectionByQuestionId,
    activeSectionId,
    sectionDeadlines,
    submittedSectionIds: [],
    responsesByQuestionId: {},
    revealedQuestionIds: [],
    markedForReviewQuestionIds: [],
    elapsedSecondsByQuestionId: {},
    currentQuestionId: selected[0].id,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export function getSectionQuestionIds(attempt: Attempt, sectionId: string): string[] {
  return attempt.questionIds.filter(
    (questionId) => attempt.sectionByQuestionId[questionId] === sectionId,
  );
}

export function remainingSectionSeconds(attempt: Attempt, now = Date.now()): number | null {
  if (!attempt.activeSectionId) return null;
  const deadline = attempt.sectionDeadlines[attempt.activeSectionId];
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function advanceStrictSection(
  attempt: Attempt,
  durationSeconds: number,
  now = Date.now(),
): Attempt {
  if (!attempt.activeSectionId) return attempt;
  const sectionIds = ["A", "B", "C", "D", "E"];
  const currentIndex = sectionIds.indexOf(attempt.activeSectionId);
  const submittedSectionIds = [
    ...new Set([...attempt.submittedSectionIds, attempt.activeSectionId]),
  ];
  if (currentIndex >= sectionIds.length - 1) {
    return {
      ...attempt,
      status: "completed",
      submittedSectionIds,
      activeSectionId: null,
      completedAt: now,
      updatedAt: now,
    };
  }
  const nextSectionId = sectionIds[currentIndex + 1];
  const nextQuestionId = getSectionQuestionIds(attempt, nextSectionId)[0];
  return {
    ...attempt,
    activeSectionId: nextSectionId,
    submittedSectionIds,
    sectionDeadlines: {
      ...attempt.sectionDeadlines,
      [nextSectionId]: now + durationSeconds * 1000,
    },
    currentQuestionId: nextQuestionId,
    updatedAt: now,
  };
}
