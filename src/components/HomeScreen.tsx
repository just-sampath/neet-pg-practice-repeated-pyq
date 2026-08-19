import { useMemo, useState } from "react";
import type { Attempt, AttemptConfig, BankData, ModeId, RevealPolicy } from "../domain/types";
import { formatDate, formatDuration } from "../utils/format";
import AppShell from "./AppShell";
import Modal from "./Modal";

interface HomeScreenProps {
  bank: BankData;
  attempts: Attempt[];
  busy: boolean;
  onStart: (modeId: ModeId, config: AttemptConfig) => Promise<void>;
  onOpenAttempt: (attempt: Attempt) => void;
  onDeleteAttempt: (attemptId: string) => Promise<void>;
  onClearData: () => Promise<void>;
}

const MODE_COPY: Array<{
  id: ModeId;
  label: string;
  number: string;
  detail: string;
}> = [
  {
    id: "subject_practice",
    label: "Subject-wise",
    number: "01",
    detail: "One subject, your question count, optional answer reveal.",
  },
  {
    id: "flexible_quiz",
    label: "Mixed quiz",
    number: "02",
    detail: "Combine subjects and move freely through the attempt.",
  },
  {
    id: "neet_pg_2026",
    label: "NEET PG GT",
    number: "03",
    detail: "180 scored questions in five timed, locked sections.",
  },
];

export default function HomeScreen({
  bank,
  attempts,
  busy,
  onStart,
  onOpenAttempt,
  onDeleteAttempt,
  onClearData,
}: HomeScreenProps) {
  const [modeId, setModeId] = useState<ModeId>("subject_practice");
  const [subjectIds, setSubjectIds] = useState<string[]>([bank.taxonomy.subjects[0]?.id ?? "anatomy"]);
  const [questionCount, setQuestionCount] = useState(20);
  const [revealPolicy, setRevealPolicy] = useState<RevealPolicy>("after_each_submission");
  const [imageBasedOnly, setImageBasedOnly] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const activeAttempts = attempts.filter((attempt) => attempt.status === "active");
  const completedAttempts = attempts.filter((attempt) => attempt.status === "completed");
  const selectedPoolSize = useMemo(
    () =>
      bank.questions.filter(
        (question) =>
          subjectIds.includes(question.classification.subjectId) &&
          question.modeEligibility[modeId] &&
          (!imageBasedOnly || question.prompt.media.length > 0),
      ).length,
    [bank.questions, imageBasedOnly, modeId, subjectIds],
  );

  const effectiveCount = modeId === "neet_pg_2026" ? 180 : Math.min(questionCount, selectedPoolSize);
  const canStart = modeId === "neet_pg_2026" || (subjectIds.length > 0 && selectedPoolSize > 0);

  const toggleSubject = (subjectId: string) => {
    if (modeId === "subject_practice") {
      setSubjectIds([subjectId]);
      return;
    }
    setSubjectIds((current) =>
      current.includes(subjectId)
        ? current.filter((candidate) => candidate !== subjectId)
        : [...current, subjectId],
    );
  };

  const selectMode = (nextModeId: ModeId) => {
    setModeId(nextModeId);
    if (nextModeId === "neet_pg_2026") {
      setSubjectIds(bank.taxonomy.subjects.map((subject) => subject.id));
      setRevealPolicy("after_attempt");
      setImageBasedOnly(false);
    } else if (nextModeId === "subject_practice") {
      setSubjectIds([subjectIds[0] ?? bank.taxonomy.subjects[0].id]);
      setQuestionCount(20);
    } else {
      setSubjectIds((current) => (current.length ? current : [bank.taxonomy.subjects[0].id]));
      setQuestionCount(40);
    }
  };

  const start = async () => {
    if (!canStart) return;
    await onStart(modeId, {
      subjectIds,
      questionCount: effectiveCount,
      revealPolicy: modeId === "neet_pg_2026" ? "after_attempt" : revealPolicy,
      imageBasedOnly: modeId === "flexible_quiz" ? imageBasedOnly : false,
    });
  };

  return (
    <AppShell
      trailing={
        <span className="header-data-note">
          Bank <strong>v{bank.manifest.bank.contentVersion}</strong>
        </span>
      }
    >
      <main className="home-page">
        <section className="setup-column" aria-labelledby="setup-heading">
          <header className="page-heading">
            <p className="eyebrow">Quiz setup</p>
            <h1 id="setup-heading">Choose an attempt</h1>
            <p>
              {bank.manifest.bank.questionCount} reviewed questions across {bank.taxonomy.subjects.length} subjects.
              Progress stays on this device.
            </p>
          </header>

          {activeAttempts.length > 0 ? (
            <section className="resume-strip" aria-labelledby="resume-heading">
              <div>
                <span className="resume-strip__label">In progress</span>
                <h2 id="resume-heading">{activeAttempts[0].modeLabel}</h2>
                <p>
                  {Object.values(activeAttempts[0].responsesByQuestionId).filter((response) => response.selectedOptionId).length}
                  /{activeAttempts[0].questionIds.length} answered · started {formatDate(activeAttempts[0].startedAt)}
                </p>
              </div>
              <button className="button button--ink" type="button" onClick={() => onOpenAttempt(activeAttempts[0])}>
                Continue
              </button>
            </section>
          ) : null}

          <div className="mode-ledger" role="radiogroup" aria-label="Quiz mode">
            {MODE_COPY.map((mode) => (
              <button
                className="mode-row"
                data-selected={modeId === mode.id}
                type="button"
                role="radio"
                aria-checked={modeId === mode.id}
                key={mode.id}
                onClick={() => selectMode(mode.id)}
              >
                <span className="mode-row__number">{mode.number}</span>
                <span className="mode-row__body">
                  <strong>{mode.label}</strong>
                  <small>{mode.detail}</small>
                </span>
                <span className="mode-row__radio" aria-hidden="true" />
              </button>
            ))}
          </div>

          <section className="configuration" aria-labelledby="configuration-heading">
            <div className="section-title-line">
              <h2 id="configuration-heading">Configuration</h2>
              <span>{modeId === "neet_pg_2026" ? "Pattern locked" : `${selectedPoolSize} available`}</span>
            </div>

            {modeId === "neet_pg_2026" ? (
              <div className="gt-pattern">
                <div className="gt-pattern__summary">
                  <div><strong>180</strong><span>questions</span></div>
                  <div><strong>720</strong><span>maximum score</span></div>
                  <div><strong>3h 30m</strong><span>total section time</span></div>
                </div>
                <ol className="section-schedule" aria-label="GT sections">
                  {["A", "B", "C", "D", "E"].map((section) => (
                    <li key={section}><strong>{section}</strong><span>36 questions</span><span>42 min</span></li>
                  ))}
                </ol>
                <p className="field-note">
                  Answers and teaching remain unavailable until the GT is submitted. Sections lock after their deadline.
                </p>
              </div>
            ) : (
              <>
                <fieldset className="field-group">
                  <legend>{modeId === "subject_practice" ? "Subject" : "Subjects"}</legend>
                  <div className="subject-grid">
                    {bank.taxonomy.subjects.map((subject) => {
                      const checked = subjectIds.includes(subject.id);
                      const count = bank.manifest.counts.byCanonicalSubject[subject.id];
                      return (
                        <label className="subject-choice" data-checked={checked} key={subject.id}>
                          <input
                            type={modeId === "subject_practice" ? "radio" : "checkbox"}
                            name="subjects"
                            checked={checked}
                            onChange={() => toggleSubject(subject.id)}
                          />
                          <span>{subject.label}</span>
                          <small>{count}</small>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="configuration__row">
                  <fieldset className="field-group field-group--compact">
                    <legend>Questions</legend>
                    <div className="segmented-control">
                      {[10, 20, 40].map((count) => (
                        <button
                          type="button"
                          data-active={questionCount === count}
                          key={count}
                          onClick={() => setQuestionCount(count)}
                        >
                          {count}
                        </button>
                      ))}
                      <button
                        type="button"
                        data-active={questionCount >= selectedPoolSize && selectedPoolSize > 0}
                        onClick={() => setQuestionCount(selectedPoolSize)}
                      >
                        All
                      </button>
                    </div>
                  </fieldset>

                  <fieldset className="field-group field-group--compact">
                    <legend>Answer reveal</legend>
                    <div className="segmented-control segmented-control--wide">
                      <button
                        type="button"
                        data-active={revealPolicy === "after_each_submission"}
                        onClick={() => setRevealPolicy("after_each_submission")}
                      >
                        After each
                      </button>
                      <button
                        type="button"
                        data-active={revealPolicy === "after_attempt"}
                        onClick={() => setRevealPolicy("after_attempt")}
                      >
                        At the end
                      </button>
                    </div>
                  </fieldset>
                </div>

                {modeId === "flexible_quiz" ? (
                  <label className="switch-row">
                    <span>
                      <strong>Image-based questions only</strong>
                      <small>Limits the pool to the 19 questions with source images.</small>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={imageBasedOnly}
                      onChange={(event) => setImageBasedOnly(event.target.checked)}
                    />
                  </label>
                ) : null}
              </>
            )}

            <footer className="configuration__footer">
              <p>
                {modeId === "neet_pg_2026"
                  ? "Selection is seeded and subject-balanced."
                  : `${effectiveCount} question${effectiveCount === 1 ? "" : "s"} will be selected.`}
              </p>
              <button className="button button--primary button--large" type="button" disabled={!canStart || busy} onClick={start}>
                {busy ? "Preparing…" : "Start attempt"}
              </button>
            </footer>
          </section>
        </section>

        <aside className="record-column">
          <section className="audit-sheet" aria-labelledby="audit-heading">
            <div className="section-title-line">
              <h2 id="audit-heading">Bank audit</h2>
              <span>377 total</span>
            </div>
            <dl className="audit-list">
              <div><dt>GT eligible</dt><dd>{bank.manifest.counts.scoringEligibleForNeetPg}</dd></div>
              <div><dt>Teaching only</dt><dd>{bank.manifest.counts.unscoredTeachingItems}</dd></div>
              <div><dt>Key corrected</dt><dd>{bank.manifest.counts.byAuditStatus.key_corrected}</dd></div>
              <div><dt>Image based</dt><dd>{bank.manifest.bank.imageQuestionCount}</dd></div>
            </dl>
            <p>
              Ambiguous, historical, and outdated items stay available for learning but are excluded from strict GT scoring.
            </p>
          </section>

          <section className="history-sheet" aria-labelledby="history-heading">
            <div className="section-title-line">
              <h2 id="history-heading">Recent attempts</h2>
              <span>{completedAttempts.length}</span>
            </div>
            {completedAttempts.length === 0 ? (
              <p className="empty-note">Completed attempts will appear here.</p>
            ) : (
              <ol className="attempt-history">
                {completedAttempts.slice(0, 5).map((attempt) => {
                  const elapsed = Object.values(attempt.elapsedSecondsByQuestionId).reduce((sum, value) => sum + value, 0);
                  return (
                    <li key={attempt.id}>
                      <button type="button" onClick={() => onOpenAttempt(attempt)}>
                        <strong>{attempt.modeLabel}</strong>
                        <span>{attempt.questionIds.length} questions · {formatDuration(elapsed)}</span>
                        <small>{formatDate(attempt.completedAt ?? attempt.updatedAt)}</small>
                      </button>
                      <button className="text-action text-action--danger" type="button" onClick={() => onDeleteAttempt(attempt.id)} aria-label={`Delete ${attempt.modeLabel} attempt`}>
                        Delete
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {attempts.length > 0 ? (
            <button className="text-action clear-action" type="button" onClick={() => setShowClearConfirm(true)}>
              Clear local attempt data
            </button>
          ) : null}
        </aside>
      </main>

      {showClearConfirm ? (
        <Modal
          title="Clear attempt data?"
          confirmLabel="Clear data"
          tone="danger"
          onClose={() => setShowClearConfirm(false)}
          onConfirm={async () => {
            await onClearData();
            setShowClearConfirm(false);
          }}
        >
          <p>This removes attempt history and exposure counts from this browser. The question bank is not affected.</p>
        </Modal>
      ) : null}
    </AppShell>
  );
}
