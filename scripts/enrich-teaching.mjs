import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const dataRoot = new URL("public/data/", projectRoot);
const teachingRoot = new URL("teaching/", dataRoot);
const TARGET_CONTENT_PROFILE = "beginner_detailed_v4";

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));
const compact = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const asSentence = (value) => {
  const text = compact(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
};

// Remove editorial verdict prefixes while retaining the medical statement that follows.
// The underlying option explanations are the clinically curated source for this enrichment pass;
// this script deliberately reuses them instead of inventing new medical claims.
const stripVerdictPrefix = (value) => {
  let text = compact(value);
  const patterns = [
    /^Corrected overall answer\.\s*/i,
    /^Corrected first-line answer\.\s*/i,
    /^Correct classic answer\.\s*/i,
    /^Correct exception\.\s*/i,
    /^Correct in [^.]+\.\s*/i,
    /^Correct\.\s*/i,
    /^Incorrect\.\s*/i,
    /^True\.\s*/i,
    /^False and therefore the answer\.\s*/i,
    /^False\.\s*/i,
  ];
  for (const pattern of patterns) text = text.replace(pattern, "");
  return asSentence(text);
};

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
  if (labels.length === 0) return "no unique scored option";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function firstSentence(value) {
  const text = stripVerdictPrefix(value);
  const match = text.match(/^(.+?[.!?])(?:\s|$)/);
  return match ? match[1] : asSentence(text);
}

function factForOption(option, feedback) {
  let fact = stripVerdictPrefix(feedback.explanation);
  if (/^(?:It|This)\b/i.test(fact)) {
    fact = fact.replace(/^(?:It|This)\b/i, option.text);
  }
  return asSentence(fact);
}

const verbPattern = /\b(is|are|was|were|has|have|had|can|may|might|will|would|should|could|forms?|lies?|passes?|causes?|inhibits?|blocks?|binds?|produces?|arises?|originates?|drains?|supplies?|innervates?|contains?|enters?|exits?|crosses?|shows?|presents?|develops?|derives?|converts?|requires?|uses?|reduces?|increases?|stimulates?|prevents?|treats?|occurs?|results?|gives|remains?|runs?|travels?|sprouts?|comes?|represents?|reflects?|allows?|raises?|lowers?|decreases?|improves?|avoids?|provides?)\b/i;

function dissectFact(value) {
  const sentence = firstSentence(value).replace(/[.!?]$/, "");
  const match = verbPattern.exec(sentence);
  if (!match || match.index < 1) return { subject: "", predicate: sentence };
  return {
    subject: compact(sentence.slice(0, match.index)),
    predicate: compact(sentence.slice(match.index)),
  };
}

const stopWords = new Set([
  "a", "an", "the", "this", "that", "these", "those", "is", "are", "was", "were", "be", "been",
  "being", "also", "usually", "generally", "commonly", "may", "can", "could", "would", "should", "of",
  "to", "in", "on", "at", "for", "from", "with", "and", "or", "by", "into", "through", "within", "it",
  "its", "their", "rather", "than", "not", "only", "most", "more", "less", "as", "a", "option",
]);

function predicateTokens(fact) {
  const { predicate } = dissectFact(fact);
  return new Set(
    predicate
      .toLowerCase()
      .replace(/[^a-z0-9%]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !stopWords.has(token)),
  );
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / (left.size + right.size - overlap);
}

function sharedPeer(question, teaching, option) {
  const currentFact = factForOption(option, teaching.optionFeedback[option.id]);
  const currentTokens = predicateTokens(currentFact);
  let best = null;
  for (const candidate of question.options) {
    if (candidate.id === option.id) continue;
    const feedback = teaching.optionFeedback[candidate.id];
    if (!feedback) continue;
    const score = jaccard(currentTokens, predicateTokens(factForOption(candidate, feedback)));
    if (score >= 0.66 && (!best || score > best.score)) best = { option: candidate, score };
  }
  return best?.option ?? null;
}

function singularPredicate(predicate) {
  return compact(predicate)
    .replace(/^are\b/i, "is")
    .replace(/^were\b/i, "was")
    .replace(/^have\b/i, "has")
    .replace(/^do\b/i, "does")
    .replace(/^also\s+/i, "")
    .replace(/[.!?]$/, "");
}

function conceptTokens(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function initials(value) {
  return conceptTokens(value).map((token) => token[0]).join("");
}

function subjectMatchesOption(subject, optionText) {
  const subjectTokens = conceptTokens(subject);
  const optionTokens = conceptTokens(optionText);
  if (!subjectTokens.length || !optionTokens.length) return false;
  const optionCompact = optionTokens.join("");
  if (optionCompact.length >= 2 && initials(subject) === optionCompact) return true;
  const subjectSet = new Set(subjectTokens);
  const overlap = optionTokens.filter((token) => subjectSet.has(token)).length;
  return overlap / Math.max(subjectTokens.length, optionTokens.length) >= 0.75;
}

function contrastOption(question, teaching, option, feedback) {
  if (feedback.verdict === "wrong") {
    const id = teaching.answer.correctOptionIds[0];
    return question.options.find((candidate) => candidate.id === id) ?? null;
  }
  if (feedback.verdict === "correct") {
    return question.options
      .filter((candidate) => candidate.id !== option.id)
      .map((candidate) => ({
        option: candidate,
        score: teaching.optionFeedback[candidate.id]?.trickMeter?.score ?? 0,
      }))
      .sort((left, right) => right.score - left.score)[0]?.option ?? null;
  }
  return null;
}

function questionizeFact({ teaching, question, fact, option, feedback, topicLabel }) {
  const comparator = contrastOption(question, teaching, option, feedback);
  const { subject, predicate } = dissectFact(fact);
  const predicateQuestion = subject && predicate && subjectMatchesOption(subject, option.text)
    ? singularPredicate(predicate)
    : null;

  if (comparator && (feedback.verdict === "correct" || feedback.verdict === "wrong")) {
    if (predicateQuestion) {
      return `In a NEET PG-style contrast question on ${topicLabel}, ${option.text} is compared with ${comparator.text}. Which of the two ${predicateQuestion}?`;
    }
    return `In a NEET PG-style contrast question on ${topicLabel}, ${option.text} is compared with ${comparator.text}. Which of the two best matches this supported teaching point: ${fact}`;
  }

  // Ambiguous, unverifiable, historical, and outdated source items should not be made to
  // look cleaner than they are. Keep the variation explicit instead of inventing a new fact.
  return `In a targeted revision drill on ${topicLabel}, which listed option is being examined by this supported teaching point, with the source audit qualification still applying: ${fact}`;
}

function foundation(teaching) {
  const parts = [asSentence(teaching.answer.summary)];
  if (compact(teaching.memoryHook)) parts.push(`Memory anchor: ${asSentence(teaching.memoryHook)}`);
  if (compact(teaching.examPearl)) parts.push(`High-yield extension: ${asSentence(teaching.examPearl)}`);
  return parts.join(" ");
}

function optionReasoning({ teaching, question, option, feedback, fact }) {
  const best = optionLabel(question, teaching.answer.correctOptionIds);
  const summary = asSentence(teaching.answer.summary);
  const auditNote = asSentence(teaching.audit.note);

  if (feedback.verdict === "correct") {
    return `The stem is testing the point stated in the answer summary: “${summary}” Therefore ${option.id}. ${option.text} is the audited best answer. A second useful retrieval cue for this option is: “${fact}”`;
  }
  if (feedback.verdict === "wrong") {
    return `The option-specific teaching point is: “${fact}” That is why ${option.id}. ${option.text} does not satisfy the discriminator in the original stem. The original question instead tests: “${summary}” The audited best answer is ${best}.`;
  }
  if (feedback.verdict === "defensible") {
    return `${asSentence(feedback.explanation)} This option is medically defensible, but the item does not make it uniquely superior to the competing choice or choices. ${auditNote} Do not force a single-answer explanation where the source itself is ambiguous.`;
  }
  if (feedback.verdict === "unverifiable_as_written") {
    return `${asSentence(feedback.explanation)} The available stem does not support a reliable single-best-answer judgement for this option. ${auditNote} The safe teaching point is to identify what information is missing rather than invent a discriminator that is not present.`;
  }
  if (feedback.verdict === "historical") {
    return `${asSentence(feedback.explanation)} This reflects the historical convention used by the source. ${auditNote} Keep the historical exam answer separate from current terminology or practice so an older key is not accidentally learned as a universal modern rule.`;
  }
  return `${asSentence(feedback.explanation)} This option reflects an older formulation that should not be applied as current practice without qualification. ${auditNote} Use the updated distinction in the audited teaching record rather than extending the old rule beyond its valid context.`;
}

function comparison({ teaching, question, option, feedback, fact }) {
  const best = optionLabel(question, teaching.answer.correctOptionIds);
  const stem = compact(question.prompt.stem);
  const summary = asSentence(teaching.answer.summary);
  const auditNote = asSentence(teaching.audit.note);

  if (feedback.verdict === "correct") {
    return `The original stem asks: “${stem}” The audited answer is ${best}. The direct teaching point is: “${summary}” The option-specific fact adds another way to retrieve the same answer: “${fact}”`;
  }
  if (feedback.verdict === "wrong") {
    return `The original stem asks: “${stem}” The audited answer is ${best}. The original teaching point is: “${summary}” By contrast, the relevant fact for ${option.id}. ${option.text} is: “${fact}” The difference between those two facts is the discriminator to retain for revision.`;
  }
  return `The original stem asks: “${stem}” ${auditNote} For this option, the medically supported teaching point is: ${asSentence(feedback.explanation)} The comparison should remain qualified because the source item is not a clean routine single-best-answer question.`;
}

function decisionRule({ teaching, question, option, feedback, fact, topic }) {
  const best = optionLabel(question, teaching.answer.correctOptionIds);
  const summary = asSentence(teaching.answer.summary);
  const auditNote = asSentence(teaching.audit.note);

  if (feedback.verdict === "correct") {
    return `For future questions on ${topic.label}, anchor on the original discriminator: “${summary}” If the stem tests that same fact, choose ${option.text}. Keep this option-specific cue linked to it as a second retrieval route: “${fact}” This is more reliable than remembering only the option letter.`;
  }
  if (feedback.verdict === "wrong") {
    return `For future questions on ${topic.label}, keep two facts separate. For ${option.text}: “${fact}” For the original audited answer: “${summary}” If a new stem tests the first fact, ${option.text} may become relevant; if it tests the original discriminator, return to ${best}. Do not merge two nearby facts into one memory.`;
  }
  return `For future questions on ${topic.label}, do not manufacture certainty from an incomplete or disputed stem. Use the supported fact for this option: ${asSentence(feedback.explanation)} Then apply the audit qualification: ${auditNote} A revised single-best-answer item needs an explicit discriminator before one option can be preferred safely.`;
}

function condition({ teaching, question, option, feedback, fact, peer }) {
  const best = optionLabel(question, teaching.answer.correctOptionIds);
  const sharedWarning = peer
    ? ` Another listed option, ${peer.id}. ${peer.text}, is supported by a very similar property in the teaching data, so this clue alone may not uniquely separate the two; a proper single-best-answer stem needs an additional discriminator.`
    : "";

  if (feedback.verdict === "correct") {
    return `This option is already correct in the original item. It should also be chosen when a revised stem tests this supported associated or defining feature: ${fact}${sharedWarning} Treat this as an additional retrieval route to ${option.text}, not as a replacement for the original discriminator.`;
  }
  if (feedback.verdict === "wrong") {
    return `Option ${option.id} can become the answer when the stem changes to test this supported fact about ${option.text}: ${fact}${sharedWarning} In the original item the deciding clue still points to ${best}; only choose ${option.text} after the stem genuinely changes what it is testing.`;
  }
  if (feedback.verdict === "defensible") {
    return `Option ${option.id} can be accepted only when a revised stem makes its supporting fact explicit and resolves the overlap with competing options: ${fact}${sharedWarning} The current source item is not clean enough to pretend that this option is uniquely correct without that extra discrimination.`;
  }
  return `Use option ${option.id} only in a revised item that supplies the missing or updated discriminator and makes this supported fact decisive: ${fact}${sharedWarning} The original source item is qualified by its audit status, so do not create certainty by adding facts that were never present.`;
}

function recognitionRule({ teaching, question, option, feedback, fact, peer }) {
  const best = optionLabel(question, teaching.answer.correctOptionIds);
  const original = asSentence(teaching.answer.summary);

  if (peer) {
    return `Look for the clue represented by this fact: ${fact} Then check whether the stem adds something that separates ${option.text} from ${peer.text}, because both are linked to a similar property in this item. Without that extra clue, do not force a unique answer. The original discriminator still leads to ${best}: ${original}`;
  }
  if (feedback.verdict === "correct") {
    return `Recognise ${option.text} when the stem gives this option-specific clue: “${fact}” Link it back to the original tested concept: “${original}” These are two legitimate retrieval paths to the same answer, which makes the fact easier to recover after a long gap in revision.`;
  }
  if (feedback.verdict === "wrong") {
    return `Recognise the change when the new stem stops testing the original point, “${original}”, and instead makes this option-specific fact decisive: “${fact}” That shift is what can make ${option.text} correct. If the original discriminator remains unchanged, the best answer remains ${best}.`;
  }
  return `First look for a newly stated discriminator that directly supports this option: ${fact} Then confirm that the revised wording resolves the problem noted in the audit. If the ambiguity, missing information, historical convention, or outdated assumption remains, do not treat ${option.text} as a clean single-best answer.`;
}

function exampleExplanation({ teaching, question, option, feedback, fact, peer }) {
  const originalBest = optionLabel(question, teaching.answer.correctOptionIds);
  const summary = asSentence(teaching.answer.summary);
  const comparator = contrastOption(question, teaching, option, feedback);

  if (feedback.verdict === "correct") {
    const contrast = comparator ? ` In the worked contrast, it is separated from ${comparator.text}.` : "";
    return `${option.text} remains the answer because the revised stem tests this supported option-specific fact: ${fact}${contrast} This is an additional retrieval route to the same audited answer; the original item is still decided by: “${summary}” The aim is to remember the medical discriminator, not the option letter.`;
  }

  if (feedback.verdict === "wrong") {
    const contrast = comparator ? ` The variation deliberately compares ${option.text} with ${comparator.text}, so the option's own fact becomes the deciding clue.` : "";
    return `${option.text} is the answer in this worked variation because the revised stem is no longer testing the original discriminator; it is testing this supported fact instead: ${fact}${contrast} In the original item, ${originalBest} remains preferred using: “${summary}” This teaches when the distractor belongs without pretending it was correct in the original stem.`;
  }

  const peerNote = peer
    ? ` A similar property is also present for ${peer.text}, so the overlap must be kept explicit.`
    : "";
  return `${option.text} is being used here only as a teaching focus for this supported fact: ${fact}${peerNote} The source audit qualification still applies, so this variation must not be read as proof that the original item has a clean unique answer. The goal is to learn the supported distinction without manufacturing certainty.`;
}

const teachingFiles = (await readdir(teachingRoot)).filter((name) => name.endsWith(".json")).sort();
let questionCount = 0;
let optionCount = 0;
let sharedDiscriminatorCount = 0;

for (const fileName of teachingFiles) {
  const fileUrl = new URL(fileName, teachingRoot);
  const document = await readJson(fileUrl);
  if (document.contentProfile === TARGET_CONTENT_PROFILE) {
    questionCount += document.questions.length;
    optionCount += document.questions.reduce((sum, teaching) => sum + Object.keys(teaching.optionFeedback).length, 0);
    continue;
  }

  for (const teaching of document.questions) {
    const question = questionById.get(teaching.questionId);
    if (!question) throw new Error(`Missing core question for ${teaching.questionId}.`);
    const subject = subjectById.get(question.classification.subjectId);
    const topic = topicById.get(question.classification.topicId);
    if (!subject || !topic) throw new Error(`Missing taxonomy for ${teaching.questionId}.`);

    for (const option of question.options) {
      const feedback = teaching.optionFeedback[option.id];
      if (!feedback) throw new Error(`Missing ${teaching.questionId} option ${option.id} feedback.`);
      const fact = factForOption(option, feedback);
      const peer = sharedPeer(question, teaching, option);
      if (peer) sharedDiscriminatorCount += 1;

      feedback.learningExplanation = {
        foundation: foundation(teaching),
        optionReasoning: optionReasoning({ teaching, question, option, feedback, fact }),
        comparison: comparison({ teaching, question, option, feedback, fact }),
        decisionRule: decisionRule({ teaching, question, option, feedback, fact, topic }),
      };

      feedback.whenThisCanBeRight = {
        condition: condition({ teaching, question, option, feedback, fact, peer }),
        recognitionRule: recognitionRule({ teaching, question, option, feedback, fact, peer }),
        exampleQuestion: {
          stem: questionizeFact({ teaching, question, fact, option, feedback, topicLabel: topic.label }),
          reuseOriginalOptions: true,
          correctOptionId: option.id,
          explanation: exampleExplanation({ teaching, question, option, feedback, fact, peer }),
        },
      };
      optionCount += 1;
    }
    questionCount += 1;
  }
  document.contentProfile = TARGET_CONTENT_PROFILE;
  await writeFile(fileUrl, `${JSON.stringify(document, null, 2)}\n`);
}

manifest.bank.contentVersion = "2026.08.20.1";
for (const entry of manifest.files) {
  if (!entry.path.startsWith("teaching/")) continue;
  const bytes = await readFile(new URL(entry.path, dataRoot));
  entry.bytes = bytes.length;
  entry.sha256 = createHash("sha256").update(bytes).digest("hex");
}
await writeFile(new URL("manifest.json", dataRoot), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  status: "enriched",
  contentProfile: TARGET_CONTENT_PROFILE,
  questionCount,
  optionCount,
  sharedDiscriminatorCount,
  teachingFiles: teachingFiles.length,
}, null, 2));
