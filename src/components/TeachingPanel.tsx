import type { OptionCore, OptionFeedback, TeachingRecord } from "../domain/types";

interface TeachingPanelProps {
  teaching: TeachingRecord;
  options: OptionCore[];
}

const VERDICT_EXPLANATION_LABEL: Record<OptionFeedback["verdict"], string> = {
  correct: "Why this option is right",
  wrong: "Why this is not the best answer",
  defensible: "Why this option is defensible",
  unverifiable_as_written: "Why this cannot be verified as written",
  historical: "Why this was historically accepted",
  outdated: "Why this option is now outdated",
};

function TrickMeter({ score, max }: { score: number; max: number }) {
  return (
    <span className="trick-meter" aria-label={`Trick meter ${score} out of ${max}`}>
      {Array.from({ length: max }, (_, index) => (
        <span key={index} data-filled={index < score} />
      ))}
    </span>
  );
}

export default function TeachingPanel({ teaching, options }: TeachingPanelProps) {
  return (
    <section className="teaching-panel" aria-labelledby={`teaching-${teaching.questionId}`}>
      <header className="teaching-panel__header">
        <div>
          <p className="eyebrow">Answer review</p>
          <h2 id={`teaching-${teaching.questionId}`}>{teaching.answer.summary}</h2>
        </div>
        <span className="audit-badge" data-status={teaching.audit.status}>{teaching.audit.displayLabel}</span>
      </header>

      {!teaching.answer.scoringEligible ? (
        <p className="teaching-warning">
          This source item is kept for teaching and does not contribute to the score.
        </p>
      ) : null}

      <div className="option-review-list">
        {[...options].sort((left, right) => left.id.localeCompare(right.id)).map((option) => {
          const feedback = teaching.optionFeedback[option.id];
          if (!feedback) return null;
          return (
            <article className="option-review" data-verdict={feedback.verdict} key={option.id}>
              <div className="option-review__topline">
                <span className="option-review__letter">{option.id}</span>
                <strong>{option.text}</strong>
                <span className="verdict-label">{feedback.displayLabel}</span>
              </div>
              <div className="option-explanation">
                <section>
                  <span className="teaching-copy-label">Foundation</span>
                  <p>{feedback.learningExplanation.foundation}</p>
                </section>
                <section>
                  <span className="teaching-copy-label">{VERDICT_EXPLANATION_LABEL[feedback.verdict]}</span>
                  <p>{feedback.learningExplanation.optionReasoning}</p>
                </section>
                <section>
                  <span className="teaching-copy-label">Compare with the original answer</span>
                  <p>{feedback.learningExplanation.comparison}</p>
                </section>
                <section>
                  <span className="teaching-copy-label">Decision rule</span>
                  <p>{feedback.learningExplanation.decisionRule}</p>
                </section>
              </div>
              <div className="trick-line">
                <span>Trick meter</span>
                <TrickMeter score={feedback.trickMeter.score} max={feedback.trickMeter.max} />
              </div>
              <details>
                <summary>When can this option be right?</summary>
                <div className="conditional-teaching">
                  <section>
                    <span className="teaching-copy-label">Use this option when</span>
                    <p>{feedback.whenThisCanBeRight.condition}</p>
                  </section>
                  <section className="recognition-rule">
                    <span className="teaching-copy-label">How to recognise the change</span>
                    <p>{feedback.whenThisCanBeRight.recognitionRule}</p>
                  </section>
                  <section className="rewritten-example">
                    <span className="teaching-copy-label">Rewritten example</span>
                    <p className="rewritten-example__stem">{feedback.whenThisCanBeRight.exampleQuestion.stem}</p>
                    <p className="rewritten-example__answer">
                      <strong>Best answer:</strong> {option.id}. {option.text}
                    </p>
                    <p className="rewritten-example__rationale">
                      <strong>Why:</strong> {feedback.whenThisCanBeRight.exampleQuestion.explanation}
                    </p>
                  </section>
                </div>
              </details>
            </article>
          );
        })}
      </div>

      <div className="study-notes">
        <article>
          <span>Memory hook</span>
          <p>{teaching.memoryHook}</p>
        </article>
        <article>
          <span>Exam pearl</span>
          <p>{teaching.examPearl}</p>
        </article>
      </div>
    </section>
  );
}
