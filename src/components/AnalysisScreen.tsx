import { useEffect, useMemo, useState } from "react";
import { loadTeachingForSubjects, publicAssetUrl } from "../data/repository";
import { buildBreakdown, scoreAttempt, type BreakdownRow } from "../domain/scoring";
import type {
  Attempt,
  BankData,
  EvaluationStatus,
  QuestionEvaluation,
  TeachingRecord,
} from "../domain/types";
import { formatDate, formatDuration } from "../utils/format";
import AppShell from "./AppShell";
import TeachingPanel from "./TeachingPanel";

interface AnalysisScreenProps {
  bank: BankData;
  attempt: Attempt;
  onHome: () => void;
  onRetake: (attempt: Attempt) => Promise<void>;
}

type ReviewFilter = "all" | "incorrect" | "skipped" | "slow" | "unscored";

function BreakdownTable({
  title,
  rows,
  labelFor,
}: {
  title: string;
  rows: BreakdownRow[];
  labelFor: (id: string) => string;
}) {
  const sorted = [...rows].sort((left, right) => right.total - left.total);
  return (
    <section className="analysis-section">
      <div className="section-title-line">
        <h2>{title}</h2>
        <span>{rows.length} groups</span>
      </div>
      <div className="breakdown-table" role="table" aria-label={title}>
        <div className="breakdown-table__head" role="row">
          <span role="columnheader">Group</span>
          <span role="columnheader">Accuracy</span>
          <span role="columnheader">C / W / S</span>
          <span role="columnheader">Score</span>
          <span role="columnheader">Time</span>
        </div>
        {sorted.map((row) => (
          <div className="breakdown-table__row" role="row" key={row.id}>
            <span role="cell" data-label="Group"><strong>{labelFor(row.id)}</strong><small>{row.total} questions</small></span>
            <span role="cell" className="accuracy-cell" data-label="Accuracy">
              <span><i style={{ width: `${Math.round(row.accuracy)}%` }} /></span>
              <strong>{Math.round(row.accuracy)}%</strong>
            </span>
            <span role="cell" data-label="Correct / Wrong / Skipped">{row.correct} / {row.incorrect} / {row.skipped}</span>
            <span role="cell" data-label="Score" className={row.score < 0 ? "negative-number" : ""}>{row.score}</span>
            <span role="cell" data-label="Time">{formatDuration(row.totalSeconds)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewRow({
  evaluation,
  bank,
  teaching,
  number,
}: {
  evaluation: QuestionEvaluation;
  bank: BankData;
  teaching: TeachingRecord;
  number: number;
}) {
  const [open, setOpen] = useState(false);
  const question = bank.questionById.get(evaluation.questionId);
  if (!question) return null;
  const selectedText = question.options.find((option) => option.id === evaluation.selectedOptionId)?.text;
  const correctText = question.options
    .filter((option) => evaluation.correctOptionIds.includes(option.id))
    .map((option) => `${option.id}. ${option.text}`)
    .join(", ");
  const subject = bank.subjectById.get(question.classification.subjectId)?.label;
  return (
    <article className="review-row" data-status={evaluation.status}>
      <button type="button" className="review-row__summary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="review-row__number">{String(number).padStart(3, "0")}</span>
        <span className="review-row__stem">
          <small>{subject} · {formatDuration(evaluation.elapsedSeconds)}</small>
          <strong>{question.prompt.stem}</strong>
        </span>
        <span className="review-row__status">{evaluation.status}</span>
        <span className="review-row__chevron" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="review-row__body">
          {question.prompt.media.map((media) => (
            <img className="review-image" src={publicAssetUrl(`data/${media.assetPath}`)} alt={media.alt} key={media.id} />
          ))}
          <dl className="answer-comparison">
            <div><dt>Your response</dt><dd>{evaluation.selectedOptionId ? `${evaluation.selectedOptionId}. ${selectedText}` : "Skipped"}</dd></div>
            <div><dt>Audited answer</dt><dd>{correctText || "No single defensible answer"}</dd></div>
          </dl>
          <TeachingPanel teaching={teaching} options={question.options} />
        </div>
      ) : null}
    </article>
  );
}

export default function AnalysisScreen({ bank, attempt, onHome, onRetake }: AnalysisScreenProps) {
  const [teaching, setTeaching] = useState<Map<string, TeachingRecord> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [retaking, setRetaking] = useState(false);

  const subjectIds = useMemo(
    () =>
      [...new Set(attempt.questionIds.map((questionId) => bank.questionById.get(questionId)?.classification.subjectId).filter((value): value is string => Boolean(value)))],
    [attempt.questionIds, bank.questionById],
  );

  useEffect(() => {
    let cancelled = false;
    loadTeachingForSubjects(bank, subjectIds)
      .then((records) => {
        if (!cancelled) setTeaching(records);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the answer review.");
      });
    return () => {
      cancelled = true;
    };
  }, [bank, subjectIds]);

  if (error) {
    return (
      <AppShell>
        <main className="state-page"><p className="eyebrow">Analysis unavailable</p><h1>{error}</h1><button className="button button--ink" type="button" onClick={onHome}>Return home</button></main>
      </AppShell>
    );
  }

  if (!teaching) {
    return (
      <AppShell>
        <main className="state-page" role="status"><span className="loading-rule" /><p>Preparing the answer review…</p></main>
      </AppShell>
    );
  }

  const summary = scoreAttempt(attempt, bank, teaching);
  const totalElapsed = summary.evaluations.reduce((sum, evaluation) => sum + evaluation.elapsedSeconds, 0);
  const subjectRows = buildBreakdown(summary.evaluations, "subjectId");
  const phaseRows = buildBreakdown(summary.evaluations, "curriculumPhaseId");
  const sectionRows = buildBreakdown(summary.evaluations, "sectionId");
  const slowEvaluations = summary.evaluations
    .filter((evaluation) => evaluation.isSlow)
    .sort((left, right) => right.elapsedSeconds - left.elapsedSeconds);
  const filteredEvaluations = summary.evaluations.filter((evaluation) => {
    if (filter === "all") return true;
    if (filter === "slow") return evaluation.isSlow;
    return evaluation.status === filter;
  });

  const statusWidth = (status: EvaluationStatus) =>
    summary.scoredQuestions
      ? (summary.evaluations.filter((evaluation) => evaluation.status === status).length / summary.scoredQuestions) * 100
      : 0;

  return (
    <AppShell
      trailing={<button className="button button--quiet button--small" type="button" onClick={onHome}>Home</button>}
    >
      <main className="analysis-page">
        <header className="analysis-heading">
          <div>
            <p className="eyebrow">Attempt analysis</p>
            <h1>{attempt.modeLabel}</h1>
            <p>Completed {formatDate(attempt.completedAt ?? attempt.updatedAt)} · {formatDuration(totalElapsed)}</p>
          </div>
          <div className="score-lockup">
            <span>Net score</span>
            <strong>{summary.score}<small>/{summary.maximumScore}</small></strong>
          </div>
        </header>

        <section className="score-sheet" aria-label="Score summary">
          <div className="score-metrics">
            <div><span>Accuracy</span><strong>{Math.round(summary.accuracy)}%</strong></div>
            <div><span>Correct</span><strong className="correct-number">{summary.correct}</strong></div>
            <div><span>Wrong</span><strong className="wrong-number">{summary.incorrect}</strong></div>
            <div><span>Skipped</span><strong>{summary.skipped}</strong></div>
            {summary.unscored ? <div><span>Teaching only</span><strong>{summary.unscored}</strong></div> : null}
          </div>
          <div className="score-distribution" aria-label={`${summary.correct} correct, ${summary.incorrect} incorrect, ${summary.skipped} skipped`}>
            <span data-kind="correct" style={{ width: `${statusWidth("correct")}%` }} />
            <span data-kind="incorrect" style={{ width: `${statusWidth("incorrect")}%` }} />
            <span data-kind="skipped" style={{ width: `${statusWidth("skipped")}%` }} />
          </div>
          <div className="score-legend">
            <span><i data-kind="correct" />Correct +4</span>
            <span><i data-kind="incorrect" />Wrong −1</span>
            <span><i data-kind="skipped" />Skipped 0</span>
          </div>
        </section>

        <BreakdownTable title="Subject breakdown" rows={subjectRows} labelFor={(id) => bank.subjectById.get(id)?.label ?? id} />

        <div className="analysis-split">
          <BreakdownTable title="Curriculum phase" rows={phaseRows} labelFor={(id) => bank.taxonomy.curriculumPhases.find((phase) => phase.id === id)?.label ?? id} />
          {attempt.modeId === "neet_pg_2026" ? (
            <BreakdownTable title="GT sections" rows={sectionRows} labelFor={(id) => `Section ${id}`} />
          ) : (
            <section className="analysis-section timing-summary">
              <div className="section-title-line"><h2>Timing</h2><span>{slowEvaluations.length} slow</span></div>
              <dl>
                <div><dt>Total time</dt><dd>{formatDuration(totalElapsed)}</dd></div>
                <div><dt>Average per question</dt><dd>{formatDuration(totalElapsed / Math.max(1, attempt.questionIds.length))}</dd></div>
                <div><dt>Questions over guidance</dt><dd>{slowEvaluations.length}</dd></div>
              </dl>
            </section>
          )}
        </div>

        {attempt.modeId === "neet_pg_2026" ? (
          <section className="analysis-section timing-summary timing-summary--wide">
            <div className="section-title-line"><h2>Timing flags</h2><span>{slowEvaluations.length} questions over guidance</span></div>
            <dl>
              <div><dt>Total recorded time</dt><dd>{formatDuration(totalElapsed)}</dd></div>
              <div><dt>Average per question</dt><dd>{formatDuration(totalElapsed / Math.max(1, attempt.questionIds.length))}</dd></div>
              <div><dt>Skipped questions</dt><dd>{summary.skipped}</dd></div>
            </dl>
          </section>
        ) : null}

        {slowEvaluations.length > 0 ? (
          <section className="analysis-section slow-list">
            <div className="section-title-line"><h2>Longest questions</h2><span>Top {Math.min(8, slowEvaluations.length)}</span></div>
            <ol>
              {slowEvaluations.slice(0, 8).map((evaluation) => {
                const question = bank.questionById.get(evaluation.questionId);
                return (
                  <li key={evaluation.questionId}>
                    <span>{bank.subjectById.get(evaluation.subjectId)?.label}</span>
                    <strong>{question?.prompt.stem}</strong>
                    <time>{formatDuration(evaluation.elapsedSeconds)}</time>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <section className="analysis-section review-section" aria-labelledby="review-heading">
          <div className="review-heading-line">
            <div><p className="eyebrow">Question review</p><h2 id="review-heading">Answers and teaching</h2></div>
            <div className="filter-tabs" role="group" aria-label="Review filter">
              {(["all", "incorrect", "skipped", "slow", "unscored"] as ReviewFilter[]).map((value) => (
                <button type="button" data-active={filter === value} key={value} onClick={() => setFilter(value)}>
                  {value === "all" ? "All" : value === "incorrect" ? "Wrong" : value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="review-list">
            {filteredEvaluations.map((evaluation) => {
              const record = teaching.get(evaluation.questionId);
              if (!record) return null;
              return (
                <ReviewRow
                  key={evaluation.questionId}
                  evaluation={evaluation}
                  bank={bank}
                  teaching={record}
                  number={attempt.questionIds.indexOf(evaluation.questionId) + 1}
                />
              );
            })}
            {filteredEvaluations.length === 0 ? <p className="empty-note">No questions match this filter.</p> : null}
          </div>
        </section>

        <footer className="analysis-actions">
          <button className="button button--quiet" type="button" onClick={onHome}>Back to home</button>
          <button
            className="button button--primary"
            type="button"
            disabled={retaking}
            onClick={async () => {
              setRetaking(true);
              await onRetake(attempt);
              setRetaking(false);
            }}
          >
            {retaking ? "Preparing…" : "Repeat configuration"}
          </button>
        </footer>
      </main>
    </AppShell>
  );
}
