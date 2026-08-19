import type {
  BankData,
  Manifest,
  ModesDocument,
  QuestionCore,
  Taxonomy,
  TeachingRecord,
} from "../domain/types";

let bankPromise: Promise<BankData> | null = null;
const teachingPromises = new Map<string, Promise<Map<string, TeachingRecord>>>();

export function publicAssetUrl(path: string): string {
  const cleanPath = path.replace(/^\.?\//, "");
  if (typeof document === "undefined") {
    return `/${cleanPath}`;
  }
  return new URL(cleanPath, document.baseURI).toString();
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(publicAssetUrl(path), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Could not load ${path} (${response.status}).`);
  }
  return (await response.json()) as T;
}

export function loadBank(): Promise<BankData> {
  if (bankPromise) return bankPromise;
  bankPromise = Promise.all([
    fetchJson<Manifest>("data/manifest.json"),
    fetchJson<ModesDocument>("data/modes.json"),
    fetchJson<Taxonomy>("data/taxonomy.json"),
    fetchJson<{ questions: QuestionCore[] }>("data/questions-core.json"),
  ]).then(([manifest, modes, taxonomy, core]) => ({
    manifest,
    modes,
    taxonomy,
    questions: core.questions,
    questionById: new Map(core.questions.map((question) => [question.id, question])),
    subjectById: new Map(taxonomy.subjects.map((subject) => [subject.id, subject])),
    topicById: new Map(taxonomy.topics.map((topic) => [topic.id, topic])),
  }));
  return bankPromise;
}

export async function loadTeachingSubject(
  bank: BankData,
  subjectId: string,
): Promise<Map<string, TeachingRecord>> {
  const existing = teachingPromises.get(subjectId);
  if (existing) return existing;
  const path = bank.manifest.entrypoints.teachingBySubject[subjectId];
  if (!path) throw new Error(`No teaching shard is configured for ${subjectId}.`);
  const promise = fetchJson<{ questions: TeachingRecord[] }>(`data/${path}`).then(
    (document) => new Map(document.questions.map((record) => [record.questionId, record])),
  );
  teachingPromises.set(subjectId, promise);
  return promise;
}

export async function loadTeachingForSubjects(
  bank: BankData,
  subjectIds: string[],
): Promise<Map<string, TeachingRecord>> {
  const maps = await Promise.all(
    [...new Set(subjectIds)].map((subjectId) => loadTeachingSubject(bank, subjectId)),
  );
  return new Map(maps.flatMap((map) => [...map.entries()]));
}

export function clearRepositoryCachesForTests(): void {
  bankPromise = null;
  teachingPromises.clear();
}
