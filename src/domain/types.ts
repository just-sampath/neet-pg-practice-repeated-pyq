export type ModeId = "subject_practice" | "flexible_quiz" | "neet_pg_2026";
export type RevealPolicy = "after_each_submission" | "after_attempt";
export type AttemptStatus = "active" | "completed";

export interface OptionCore {
  id: string;
  text: string;
}

export interface QuestionMedia {
  id: string;
  kind: "image";
  assetPath: string;
  requiredForAnswer: boolean;
  zoomEnabled: boolean;
  alt: string;
  sourcePdfPage: number;
}

export interface QuestionCore {
  id: string;
  revision: number;
  bankSequence: number;
  classification: {
    subjectId: string;
    topicId: string;
    curriculumPhaseId: string;
    sourceSubjectLabel: string;
    subdisciplineId?: string;
  };
  questionType: "single_best_answer";
  prompt: {
    stem: string;
    media: QuestionMedia[];
  };
  options: OptionCore[];
  analytics: {
    cognitiveType: "text_based" | "image_based";
    timeGuidance: {
      targetSeconds: number;
      slowAfterSeconds: number;
      basis: string;
    };
    tags: string[];
  };
  modeEligibility: Record<ModeId, boolean>;
}

export interface OptionFeedback {
  verdict: "correct" | "wrong" | "defensible" | "unverifiable_as_written" | "historical" | "outdated";
  displayLabel: string;
  explanation: string;
  learningExplanation: {
    foundation: string;
    optionReasoning: string;
    comparison: string;
    decisionRule: string;
  };
  trickMeter: {
    score: number;
    max: number;
    trapReason: string;
  };
  whenThisCanBeRight: {
    condition: string;
    recognitionRule: string;
    exampleQuestion: {
      stem: string;
      reuseOriginalOptions: boolean;
      correctOptionId: string;
      explanation: string;
    };
  };
}

export interface TeachingRecord {
  questionId: string;
  answer: {
    kind: "single" | "multiple" | "none";
    correctOptionIds: string[];
    summary: string;
    scoringEligible: boolean;
    handling?: string;
  };
  optionFeedback: Record<string, OptionFeedback>;
  memoryHook: string;
  examPearl: string;
  audit: {
    status: "confirmed" | "key_corrected" | "ambiguous_defective" | "historical_answer" | "outdated";
    displayLabel: string;
    sourceKey: string;
    auditedAnswer: string;
    sourceKeyChanged: boolean;
    note: string;
    sourceStatus?: string;
    issueFlags?: string[];
  };
  source: {
    bookQuestionNumber: number;
    sourcePdfPage: number;
    reportedRepeatYears: number[];
  };
}

export interface Subject {
  id: string;
  label: string;
  curriculumPhaseId: string;
}

export interface Topic {
  id: string;
  label: string;
  subjectId: string;
}

export interface Taxonomy {
  curriculumPhases: Array<{ id: string; label: string }>;
  subjects: Subject[];
  subdisciplines: Array<{ id: string; label: string; subjectIds: string[] }>;
  topics: Topic[];
}

export interface Manifest {
  bank: {
    id: string;
    title: string;
    contentVersion: string;
    language: string;
    questionCount: number;
    canonicalSubjectCount: number;
    imageQuestionCount: number;
  };
  counts: {
    byAuditStatus: Record<string, number>;
    bySourceAuditStatus: Record<string, number>;
    scoringEligibleForNeetPg: number;
    unscoredTeachingItems: number;
    byCanonicalSubject: Record<string, number>;
  };
  entrypoints: {
    modes: string;
    taxonomy: string;
    questionsCore: string;
    teachingDirectory: string;
    teachingBySubject: Record<string, string>;
    imageDirectory: string;
  };
  files: Array<{
    path: string;
    bytes: number;
    sha256: string;
  }>;
  imageAssets: Array<Record<string, unknown>>;
}

export interface ModeDefinition {
  id: ModeId;
  label: string;
  selection: {
    questionCount: number | "user_selected";
    quotaStrategy?: {
      subjectQuotas: Record<string, number>;
    };
  };
  sections?: {
    count: number;
    items: Array<{ id: string; questionCount: number; durationSeconds: number }>;
  };
  scoring: {
    correct: number;
    incorrect: number;
    skipped: number;
    maximumScore?: number;
    excludeUnscoredTeachingItems: boolean;
  };
}

export interface ModesDocument {
  subjectPractice: ModeDefinition;
  flexibleQuiz: ModeDefinition;
  neetPg2026: ModeDefinition;
}

export interface BankData {
  manifest: Manifest;
  modes: ModesDocument;
  taxonomy: Taxonomy;
  questions: QuestionCore[];
  questionById: Map<string, QuestionCore>;
  subjectById: Map<string, Subject>;
  topicById: Map<string, Topic>;
}

export interface AttemptConfig {
  subjectIds: string[];
  questionCount: number;
  revealPolicy: RevealPolicy;
  imageBasedOnly?: boolean;
}

export interface ResponseRecord {
  selectedOptionId: string | null;
  firstCommittedOptionId: string | null;
  committed: boolean;
  updatedAt: number;
}

export interface Attempt {
  id: string;
  contentVersion: string;
  modeId: ModeId;
  modeLabel: string;
  status: AttemptStatus;
  seed: string;
  config: AttemptConfig;
  questionIds: string[];
  optionOrderByQuestionId: Record<string, string[]>;
  sectionByQuestionId: Record<string, string>;
  activeSectionId: string | null;
  sectionDeadlines: Record<string, number>;
  submittedSectionIds: string[];
  responsesByQuestionId: Record<string, ResponseRecord>;
  revealedQuestionIds: string[];
  markedForReviewQuestionIds: string[];
  elapsedSecondsByQuestionId: Record<string, number>;
  currentQuestionId: string;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export type EvaluationStatus = "correct" | "incorrect" | "skipped" | "unscored";

export interface QuestionEvaluation {
  questionId: string;
  subjectId: string;
  curriculumPhaseId: string;
  sectionId: string | null;
  selectedOptionId: string | null;
  correctOptionIds: string[];
  status: EvaluationStatus;
  points: number;
  elapsedSeconds: number;
  isSlow: boolean;
}

export interface ScoreSummary {
  correct: number;
  incorrect: number;
  skipped: number;
  unscored: number;
  attempted: number;
  scoredQuestions: number;
  score: number;
  maximumScore: number;
  accuracy: number;
  evaluations: QuestionEvaluation[];
}
