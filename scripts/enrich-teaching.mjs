import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const dataRoot = new URL("public/data/", projectRoot);
const teachingRoot = new URL("teaching/", dataRoot);
const TARGET_CONTENT_PROFILE = "beginner_detailed_v3";

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));
const asSentence = (value) => {
  const text = String(value).trim().replace(/\s+/g, " ");
  return /[.!?]$/.test(text) ? text : `${text}.`;
};
const withoutLeadingVerdict = (value) =>
  asSentence(value).replace(/^(?:Correct|Incorrect|True|False)\.\s*/i, "");

const [core, taxonomy, manifest] = await Promise.all([
  readJson(new URL("questions-core.json", dataRoot)),
  readJson(new URL("taxonomy.json", dataRoot)),
  readJson(new URL("manifest.json", dataRoot)),
]);

const questionById = new Map(core.questions.map((question) => [question.id, question]));
const subjectById = new Map(taxonomy.subjects.map((subject) => [subject.id, subject]));
const topicById = new Map(taxonomy.topics.map((topic) => [topic.id, topic]));

function optionLabel(question, ids) {
  const labels = ids
    .map((id) => question.options.find((option) => option.id === id))
    .filter(Boolean)
    .map((option) => `${option.id}. ${option.text}`);
  if (labels.length === 0) return "no single option, because the source item is not cleanly scoreable as written";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function genericConditionFact(condition, fallback) {
  const match = condition.match(
    /^This option can be right when a revised stem asks for the entity or concept identified by this distinguishing fact:\s*(.+)$/i,
  );
  return match ? asSentence(match[1]) : asSentence(fallback);
}

function buildComparison({ teaching, question, option, feedback, concise }) {
  const best = optionLabel(question, teaching.answer.correctOptionIds);
  const auditContext = asSentence(teaching.audit.note);
  if (feedback.verdict === "correct") {
    return `In the original stem, ${option.id}. ${option.text} is the best answer. ${withoutLeadingVerdict(concise)} The option and the stem therefore point to the same mechanism, definition, association, stage, or clinical setting.`;
  }
  if (feedback.verdict === "wrong") {
    return `The original stem is better answered by ${best}. ${withoutLeadingVerdict(concise)} This is the separating point: option ${option.id} may sound related to the topic, but it does not answer the exact question as directly as the audited answer.`;
  }
  if (feedback.verdict === "defensible") {
    return `Option ${option.id} is medically defensible under some interpretations, but the wording does not make it uniquely superior to the competing choice or choices. ${auditContext} Treat the ambiguity as part of the lesson rather than forcing certainty.`;
  }
  if (feedback.verdict === "unverifiable_as_written") {
    return `The available stem does not provide enough reliable information to verify option ${option.id} as a single best answer. ${auditContext} A scoreable version would need the missing discriminator stated explicitly.`;
  }
  if (feedback.verdict === "historical") {
    return `Option ${option.id} reflects the historical convention used by the source. ${auditContext} Distinguish what an older examination may have expected from the terminology or practice used now.`;
  }
  return `Option ${option.id} reflects an older formulation that should not be applied as current practice without qualification. ${auditContext} For a contemporary question, follow the updated distinction described in the audited answer.`;
}

function buildDecisionRule({ feedback, option }) {
  const trap = asSentence(feedback.trickMeter.trapReason);
  return `${trap} On a new question, first identify what the stem is asking for: a definition, mechanism, association, diagnosis, stage, complication, investigation, or treatment. Then test option ${option.id} against the decisive clue. Do not choose it merely because it is familiar or belongs to the same topic.`;
}

function buildCondition({ originalCondition, fact, option, forceRewrite }) {
  const isGeneric = /^This option can be right when a revised stem asks for/i.test(originalCondition);
  const opening = isGeneric || forceRewrite
    ? `Option ${option.id} becomes correct if a revised item asks you to identify the choice described by this statement: ${fact}`
    : asSentence(originalCondition);
  return `${opening} The revised wording must explicitly test that statement, making “${option.text}” a closer match than every competing option. Do not carry this answer back to the original stem unless the same discriminator is present.`;
}

function buildRecognitionRule({ teaching, question, option, fact }) {
  const originalBest = optionLabel(question, teaching.answer.correctOptionIds);
  const originalComparison = teaching.answer.correctOptionIds.includes(option.id)
    ? `The original question already points to this option, so the same discriminator confirms the answer.`
    : `If the original clue is left unchanged, return to ${originalBest}; option ${option.id} becomes correct only after the discriminator changes.`;
  return `Look for wording that directly expresses this clue: ${fact} Ask which option the clue defines, causes, characterises, treats, or is most strongly associated with. ${originalComparison}`;
}

function buildExampleStem({ question, subject, topic, fact, originalStem }) {
  if (
    !/^In a rewritten version of the original question/i.test(originalStem) &&
    !/^(?:An image-based|A .+ single-best-answer question on ).+ is rewritten (?:to make the following clue decisive|as follows):/i.test(originalStem)
  ) {
    return originalStem;
  }
  const context = question.prompt.media.length > 0
    ? `An image-based ${subject.label} question on ${topic.label}`
    : `A ${subject.label} single-best-answer question on ${topic.label}`;
  return `${context} is rewritten as follows: Which of the original options is best described by this statement? ${fact}`;
}

function buildExampleExplanation({ teaching, question, option, fact }) {
  const originalBest = optionLabel(question, teaching.answer.correctOptionIds);
  const relation = teaching.answer.correctOptionIds.includes(option.id)
    ? `This is the same answer as the original item, but the rewritten stem makes the discriminator explicit.`
    : `This differs from the original item, where ${originalBest} is the better fit.`;
  return `Option ${option.id} (${option.text}) is correct in this worked variation because the statement is specifically asking for the choice matched by this fact: ${fact} ${relation} The purpose of the variation is to recognise the changed discriminator and reason to the answer rather than memorising an option letter.`;
}

const teachingFiles = (await readdir(teachingRoot)).filter((name) => name.endsWith(".json")).sort();
let questionCount = 0;
let optionCount = 0;

for (const fileName of teachingFiles) {
  const fileUrl = new URL(fileName, teachingRoot);
  const document = await readJson(fileUrl);
  if (document.contentProfile === TARGET_CONTENT_PROFILE) {
    questionCount += document.questions.length;
    optionCount += document.questions.reduce(
      (sum, teaching) => sum + Object.keys(teaching.optionFeedback).length,
      0,
    );
    continue;
  }
  const upgradingExistingProfile = /^beginner_detailed_v\d+$/.test(document.contentProfile ?? "");
  for (const teaching of document.questions) {
    const question = questionById.get(teaching.questionId);
    if (!question) throw new Error(`Missing core question for ${teaching.questionId}.`);
    const subject = subjectById.get(question.classification.subjectId);
    const topic = topicById.get(question.classification.topicId);
    if (!subject || !topic) throw new Error(`Missing taxonomy for ${teaching.questionId}.`);

    for (const option of question.options) {
      const feedback = teaching.optionFeedback[option.id];
      if (!feedback) throw new Error(`Missing ${teaching.questionId} option ${option.id} feedback.`);
      const concise = feedback.explanation;
      const fact = upgradingExistingProfile
        ? asSentence(withoutLeadingVerdict(concise))
        : genericConditionFact(
            feedback.whenThisCanBeRight.condition,
            feedback.whenThisCanBeRight.exampleQuestion.explanation || concise,
          );

      feedback.learningExplanation = {
        foundation: `${asSentence(teaching.answer.summary)} Memory anchor: ${asSentence(teaching.memoryHook)} Exam extension: ${asSentence(teaching.examPearl)}`,
        optionReasoning: `Option ${option.id} is “${option.text}.” ${asSentence(concise)} In plain terms, judge this option by whether that exact fact answers the wording of the stem, not merely by whether the option is related to the same chapter.`,
        comparison: buildComparison({ teaching, question, option, feedback, concise }),
        decisionRule: buildDecisionRule({ feedback, option }),
      };

      const originalCondition = feedback.whenThisCanBeRight.condition;
      const originalStem = feedback.whenThisCanBeRight.exampleQuestion.stem;
      feedback.whenThisCanBeRight.condition = buildCondition({
        originalCondition,
        fact,
        option,
        forceRewrite: upgradingExistingProfile,
      });
      feedback.whenThisCanBeRight.recognitionRule = buildRecognitionRule({
        teaching,
        question,
        option,
        fact,
      });
      feedback.whenThisCanBeRight.exampleQuestion.stem = buildExampleStem({
        question,
        subject,
        topic,
        fact,
        originalStem,
      });
      feedback.whenThisCanBeRight.exampleQuestion.explanation = buildExampleExplanation({
        teaching,
        question,
        option,
        fact,
      });
      optionCount += 1;
    }
    questionCount += 1;
  }
  document.contentProfile = TARGET_CONTENT_PROFILE;
  await writeFile(fileUrl, `${JSON.stringify(document, null, 2)}\n`);
}

manifest.bank.contentVersion = "2026.08.19.3";
for (const entry of manifest.files) {
  if (!entry.path.startsWith("teaching/")) continue;
  const bytes = await readFile(new URL(entry.path, dataRoot));
  entry.bytes = bytes.length;
  entry.sha256 = createHash("sha256").update(bytes).digest("hex");
}
await writeFile(new URL("manifest.json", dataRoot), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({ status: "enriched", questionCount, optionCount, teachingFiles: teachingFiles.length }, null, 2));
