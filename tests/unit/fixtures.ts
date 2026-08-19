import { readFile, readdir } from "node:fs/promises";
import type {
  BankData,
  Manifest,
  ModesDocument,
  QuestionCore,
  Taxonomy,
  TeachingRecord,
} from "../../src/domain/types";

export const projectRoot = new URL("../../", import.meta.url);
export const dataRoot = new URL("public/data/", projectRoot);

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(new URL(path, dataRoot), "utf8")) as T;
}

export async function loadTestBank(): Promise<BankData> {
  const [manifest, modes, taxonomy, core] = await Promise.all([
    readJson<Manifest>("manifest.json"),
    readJson<ModesDocument>("modes.json"),
    readJson<Taxonomy>("taxonomy.json"),
    readJson<{ questions: QuestionCore[] }>("questions-core.json"),
  ]);
  return {
    manifest,
    modes,
    taxonomy,
    questions: core.questions,
    questionById: new Map(core.questions.map((question) => [question.id, question])),
    subjectById: new Map(taxonomy.subjects.map((subject) => [subject.id, subject])),
    topicById: new Map(taxonomy.topics.map((topic) => [topic.id, topic])),
  };
}

export async function loadAllTeaching(): Promise<Map<string, TeachingRecord>> {
  const files = (await readdir(new URL("teaching/", dataRoot))).filter((name) => name.endsWith(".json"));
  const documents = await Promise.all(
    files.map((file) => readJson<{ questions: TeachingRecord[] }>(`teaching/${file}`)),
  );
  return new Map(documents.flatMap((document) => document.questions.map((record) => [record.questionId, record])));
}
