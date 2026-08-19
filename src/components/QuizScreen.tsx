import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadTeachingSubject, publicAssetUrl } from "../data/repository";
import {
  advanceStrictSection,
  getSectionQuestionIds,
  remainingSectionSeconds,
} from "../domain/selection";
import type { Attempt, BankData, QuestionCore, ResponseRecord, TeachingRecord } from "../domain/types";
import { formatClock } from "../utils/format";
import AppShell from "./AppShell";
import Modal from "./Modal";
import TeachingPanel from "./TeachingPanel";

interface QuizScreenProps {
  bank: BankData;
  attempt: Attempt;
  onUpdate: (attempt: Attempt) => void;
  onComplete: (attempt: Attempt) => void;
  onHome: () => void;
}

const EMPTY_RESPONSE: ResponseRecord = {
  selectedOptionId: null,
  firstCommittedOptionId: null,
  committed: false,
  updatedAt: 0,
};

function replaceResponse(
  attempt: Attempt,
  questionId: string,
  response: ResponseRecord,
  now = Date.now(),
): Attempt {
  return {
    ...attempt,
    responsesByQuestionId: {
      ...attempt.responsesByQuestionId,
      [questionId]: response,
    },
    updatedAt: now,
  };
}

export default function QuizScreen({ bank, attempt, onUpdate, onComplete, onHome }: QuizScreenProps) {
  const [clockNow, setClockNow] = useState(Date.now());
  const [teachingState, setTeachingState] = useState<{
    questionId: string | null;
    record: TeachingRecord | null;
  }>({ questionId: null, record: null });
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const visitStartedAt = useRef<number | null>(Date.now());
  const handledExpirySection = useRef<string | null>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  const question = bank.questionById.get(attempt.currentQuestionId);
  if (!question) throw new Error(`Question ${attempt.currentQuestionId} is missing.`);

  const isStrict = attempt.modeId === "neet_pg_2026";
  const revealed = attempt.revealedQuestionIds.includes(question.id);
  const response = attempt.responsesByQuestionId[question.id] ?? EMPTY_RESPONSE;
  const subject = bank.subjectById.get(question.classification.subjectId);
  const topic = bank.topicById.get(question.classification.topicId);
  const optionOrder = attempt.optionOrderByQuestionId[question.id] ?? question.options.map((option) => option.id);
  const displayedOptions = optionOrder
    .map((optionId) => question.options.find((option) => option.id === optionId))
    .filter((option): option is QuestionCore["options"][number] => Boolean(option));
  const teaching = teachingState.questionId === question.id ? teachingState.record : null;
  const teachingLoading = revealed && !isStrict && teachingState.questionId !== question.id;

  const visibleQuestionIds = useMemo(
    () =>
      isStrict && attempt.activeSectionId
        ? getSectionQuestionIds(attempt, attempt.activeSectionId)
        : attempt.questionIds,
    [attempt, isStrict],
  );
  const currentVisibleIndex = Math.max(0, visibleQuestionIds.indexOf(question.id));
  const answeredTotal = attempt.questionIds.filter(
    (questionId) => attempt.responsesByQuestionId[questionId]?.selectedOptionId,
  ).length;
  const activeSectionAnswered = visibleQuestionIds.filter(
    (questionId) => attempt.responsesByQuestionId[questionId]?.selectedOptionId,
  ).length;
  const secondsRemaining = isStrict ? remainingSectionSeconds(attempt, clockNow) : null;

  const accrueElapsed = useCallback(
    (baseAttempt: Attempt): Attempt => {
      if (visitStartedAt.current === null) return baseAttempt;
      const now = Date.now();
      const delta = Math.max(0, (now - visitStartedAt.current) / 1000);
      visitStartedAt.current = now;
      return {
        ...baseAttempt,
        elapsedSecondsByQuestionId: {
          ...baseAttempt.elapsedSecondsByQuestionId,
          [baseAttempt.currentQuestionId]:
            (baseAttempt.elapsedSecondsByQuestionId[baseAttempt.currentQuestionId] ?? 0) + delta,
        },
        updatedAt: now,
      };
    },
    [],
  );

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    visitStartedAt.current = revealed ? null : Date.now();
  }, [question.id, revealed]);

  useEffect(() => {
    const palette = paletteRef.current;
    const currentButton = palette?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!palette || !currentButton || palette.scrollWidth <= palette.clientWidth) return;
    const left = currentButton.offsetLeft - (palette.clientWidth - currentButton.offsetWidth) / 2;
    palette.scrollTo({
      left: Math.max(0, left),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [question.id, visibleQuestionIds.length]);

  useEffect(() => {
    if (!revealed || isStrict) return;
    let cancelled = false;
    loadTeachingSubject(bank, question.classification.subjectId)
      .then((records) => {
        if (!cancelled) {
          setTeachingState({
            questionId: question.id,
            record: records.get(question.id) ?? null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bank, isStrict, question.classification.subjectId, question.id, revealed]);

  useEffect(() => {
    if (!isStrict || secondsRemaining !== 0 || !attempt.activeSectionId) return;
    if (handledExpirySection.current === attempt.activeSectionId) return;
    handledExpirySection.current = attempt.activeSectionId;
    const durationSeconds = bank.modes.neetPg2026.sections?.items[0]?.durationSeconds ?? 2520;
    const advanced = advanceStrictSection(accrueElapsed(attempt), durationSeconds);
    visitStartedAt.current = advanced.status === "active" ? Date.now() : null;
    if (advanced.status === "completed") onComplete(advanced);
    else onUpdate(advanced);
  }, [accrueElapsed, attempt, bank.modes.neetPg2026.sections, isStrict, onComplete, onUpdate, secondsRemaining]);

  const selectOption = useCallback(
    (optionId: string) => {
      if (revealed) return;
      const current = attempt.responsesByQuestionId[question.id] ?? EMPTY_RESPONSE;
      onUpdate(
        replaceResponse(attempt, question.id, {
          ...current,
          selectedOptionId: optionId,
          updatedAt: Date.now(),
        }),
      );
    },
    [attempt, onUpdate, question.id, revealed],
  );

  const moveTo = useCallback(
    (questionId: string) => {
      if (!visibleQuestionIds.includes(questionId)) return;
      const next = accrueElapsed(attempt);
      visitStartedAt.current = Date.now();
      onUpdate({ ...next, currentQuestionId: questionId, updatedAt: Date.now() });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [accrueElapsed, attempt, onUpdate, visibleQuestionIds],
  );

  const goRelative = useCallback(
    (delta: number) => {
      const nextIndex = currentVisibleIndex + delta;
      if (nextIndex >= 0 && nextIndex < visibleQuestionIds.length) moveTo(visibleQuestionIds[nextIndex]);
    },
    [currentVisibleIndex, moveTo, visibleQuestionIds],
  );

  const confirmAnswer = () => {
    if (!response.selectedOptionId || revealed || isStrict) return;
    const timed = accrueElapsed(attempt);
    visitStartedAt.current = null;
    const now = Date.now();
    const current = timed.responsesByQuestionId[question.id] ?? response;
    onUpdate({
      ...replaceResponse(timed, question.id, {
        ...current,
        committed: true,
        firstCommittedOptionId: current.firstCommittedOptionId ?? current.selectedOptionId,
        updatedAt: now,
      }, now),
      revealedQuestionIds: [...new Set([...timed.revealedQuestionIds, question.id])],
    });
  };

  const toggleReview = useCallback(() => {
    const marked = attempt.markedForReviewQuestionIds.includes(question.id);
    onUpdate({
      ...attempt,
      markedForReviewQuestionIds: marked
        ? attempt.markedForReviewQuestionIds.filter((questionId) => questionId !== question.id)
        : [...attempt.markedForReviewQuestionIds, question.id],
      updatedAt: Date.now(),
    });
  }, [attempt, onUpdate, question.id]);

  const finishAttempt = () => {
    const now = Date.now();
    const timed = accrueElapsed(attempt);
    const completed: Attempt = {
      ...timed,
      status: "completed",
      activeSectionId: null,
      completedAt: now,
      updatedAt: now,
    };
    visitStartedAt.current = null;
    setShowFinishConfirm(false);
    onComplete(completed);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      const number = Number(event.key);
      if (number >= 1 && number <= 4 && displayedOptions[number - 1]) {
        event.preventDefault();
        selectOption(displayedOptions[number - 1].id);
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        toggleReview();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goRelative(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goRelative(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [displayedOptions, goRelative, selectOption, toggleReview]);

  useEffect(() => {
    const flush = () => onUpdate(accrueElapsed(attempt));
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [accrueElapsed, attempt, onUpdate]);

  const paletteStatus = (questionId: string) => {
    if (questionId === question.id) return "current";
    if (attempt.markedForReviewQuestionIds.includes(questionId)) return "review";
    if (attempt.responsesByQuestionId[questionId]?.selectedOptionId) return "answered";
    return "unanswered";
  };

  return (
    <AppShell
      compact
      trailing={
        <div className="attempt-header-tools">
          {isStrict ? (
            <div className="exam-timer" data-urgent={secondsRemaining !== null && secondsRemaining <= 300} aria-live="polite">
              <span>Section {attempt.activeSectionId}</span>
              <strong>{formatClock(secondsRemaining ?? 0)}</strong>
            </div>
          ) : (
            <span className="saved-indicator">Saved locally</span>
          )}
          <button className="button button--quiet button--small" type="button" onClick={() => setShowExitConfirm(true)}>
            Home
          </button>
        </div>
      }
    >
      <main className="quiz-page">
        <aside className="question-navigator" aria-label="Question navigation">
          <div className="question-navigator__heading">
            <span>{attempt.modeLabel}</span>
            <strong>{answeredTotal}/{attempt.questionIds.length}</strong>
          </div>

          {isStrict ? (
            <div className="section-tabs" aria-label="GT sections">
              {["A", "B", "C", "D", "E"].map((sectionId) => (
                <span
                  key={sectionId}
                  data-state={
                    attempt.activeSectionId === sectionId
                      ? "active"
                      : attempt.submittedSectionIds.includes(sectionId)
                        ? "submitted"
                        : "locked"
                  }
                >
                  {sectionId}
                </span>
              ))}
            </div>
          ) : null}

          <div className="question-grid" ref={paletteRef}>
            {visibleQuestionIds.map((questionId, index) => (
              <button
                type="button"
                key={questionId}
                data-status={paletteStatus(questionId)}
                aria-current={questionId === question.id ? "step" : undefined}
                aria-label={`Question ${index + 1}, ${paletteStatus(questionId)}`}
                onClick={() => moveTo(questionId)}
              >
                {index + 1}
              </button>
            ))}
          </div>

          <div className="palette-legend">
            <span><i data-kind="answered" />Answered</span>
            <span><i data-kind="review" />Review</span>
            <span><i data-kind="unanswered" />Not answered</span>
          </div>

          <button className="text-action text-action--danger navigator-end" type="button" onClick={() => setShowFinishConfirm(true)}>
            {isStrict ? "End GT" : "Finish attempt"}
          </button>
        </aside>

        <section className="question-workspace">
          <div className="question-progress" aria-hidden="true">
            <span style={{ width: `${((currentVisibleIndex + 1) / visibleQuestionIds.length) * 100}%` }} />
          </div>

          <header className="question-meta">
            <div>
              <span>Question {currentVisibleIndex + 1} of {visibleQuestionIds.length}</span>
              {isStrict ? <span>Section {attempt.activeSectionId} · {activeSectionAnswered}/36 answered</span> : null}
            </div>
            <button
              className="review-toggle"
              data-marked={attempt.markedForReviewQuestionIds.includes(question.id)}
              type="button"
              aria-pressed={attempt.markedForReviewQuestionIds.includes(question.id)}
              onClick={toggleReview}
            >
              {attempt.markedForReviewQuestionIds.includes(question.id) ? "Marked for review" : "Mark for review"}
            </button>
          </header>

          <article className="question-sheet">
            <div className="classification-line">
              <span>{subject?.label ?? question.classification.sourceSubjectLabel}</span>
              <span>{topic?.label ?? question.analytics.tags[0]?.replaceAll("_", " ")}</span>
              {question.prompt.media.length ? <span>Image based</span> : null}
            </div>
            <h1>{question.prompt.stem}</h1>

            {question.prompt.media.map((media) => {
              const source = publicAssetUrl(`data/${media.assetPath}`);
              return (
                <figure className="question-image" key={media.id}>
                  <button type="button" onClick={() => setZoomedImage(source)} aria-label="Open image at full size">
                    <img src={source} alt={media.alt} />
                  </button>
                  <figcaption>{media.alt} Select the image to enlarge.</figcaption>
                </figure>
              );
            })}

            <div className="answer-options" role="radiogroup" aria-label="Answer options">
              {displayedOptions.map((option, displayIndex) => {
                const feedback = teaching?.optionFeedback[option.id];
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={response.selectedOptionId === option.id}
                    className="answer-option"
                    data-selected={response.selectedOptionId === option.id}
                    data-verdict={revealed ? feedback?.verdict : undefined}
                    disabled={revealed}
                    key={option.id}
                    onClick={() => selectOption(option.id)}
                  >
                    <span className="answer-option__key">{displayIndex + 1}</span>
                    <span className="answer-option__letter">{option.id}</span>
                    <span className="answer-option__text">{option.text}</span>
                    {revealed && feedback ? <strong>{feedback.displayLabel}</strong> : null}
                  </button>
                );
              })}
            </div>

            {!isStrict && attempt.config.revealPolicy === "after_each_submission" && !revealed ? (
              <div className="confirm-row">
                <p>Your response locks when the answer is revealed.</p>
                <button className="button button--primary" type="button" disabled={!response.selectedOptionId} onClick={confirmAnswer}>
                  Confirm answer
                </button>
              </div>
            ) : null}
          </article>

          {teachingLoading ? (
            <div className="teaching-loading" role="status">Loading answer review…</div>
          ) : teaching ? (
            <TeachingPanel teaching={teaching} options={question.options} />
          ) : null}

          <nav className="question-footer" aria-label="Question controls">
            <button className="button button--quiet" type="button" disabled={currentVisibleIndex === 0} onClick={() => goRelative(-1)}>
              Previous
            </button>
            <span>Keys 1–4 answer · R marks review · ← → moves</span>
            {currentVisibleIndex < visibleQuestionIds.length - 1 ? (
              <button className="button button--ink" type="button" onClick={() => goRelative(1)}>
                Next question
              </button>
            ) : !isStrict ? (
              <button className="button button--primary" type="button" onClick={() => setShowFinishConfirm(true)}>
                Finish attempt
              </button>
            ) : (
              <span className="section-lock-note">Review this section until the timer ends.</span>
            )}
          </nav>
        </section>
      </main>

      {showFinishConfirm ? (
        <Modal
          title={isStrict ? "End the GT?" : "Finish this attempt?"}
          confirmLabel={isStrict ? "End GT" : "Finish attempt"}
          tone={isStrict ? "danger" : "default"}
          onClose={() => setShowFinishConfirm(false)}
          onConfirm={finishAttempt}
        >
          <p>
            {answeredTotal} of {attempt.questionIds.length} questions are answered. Remaining questions will be scored as skipped.
          </p>
          {isStrict ? <p>Answers and explanations become available after submission.</p> : null}
        </Modal>
      ) : null}

      {showExitConfirm ? (
        <Modal title="Return home?" confirmLabel="Save and leave" onClose={() => setShowExitConfirm(false)} onConfirm={() => {
          onUpdate(accrueElapsed(attempt));
          onHome();
        }}>
          <p>Your current response and timing data will be saved. You can continue this attempt later.</p>
        </Modal>
      ) : null}

      {zoomedImage ? (
        <div className="image-viewer" role="dialog" aria-modal="true" aria-label="Question image">
          <button type="button" onClick={() => setZoomedImage(null)}>Close</button>
          <img src={zoomedImage} alt={question.prompt.media[0]?.alt ?? "Question image"} />
        </div>
      ) : null}
    </AppShell>
  );
}
