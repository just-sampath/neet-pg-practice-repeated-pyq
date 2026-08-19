import type { OptionCore, TeachingRecord } from "../domain/types";

interface TeachingPanelProps {
  teaching: TeachingRecord;
  options: OptionCore[];
}

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
              <p>{feedback.explanation}</p>
              <div className="trick-line">
                <span>Trick meter</span>
                <TrickMeter score={feedback.trickMeter.score} max={feedback.trickMeter.max} />
              </div>
              <details>
                <summary>When can this option be right?</summary>
                <div className="conditional-teaching">
                  <p>{feedback.whenThisCanBeRight.condition}</p>
                  <div>
                    <span>Rewritten example</span>
                    <p>{feedback.whenThisCanBeRight.exampleQuestion.stem}</p>
                    <small>{feedback.whenThisCanBeRight.exampleQuestion.explanation}</small>
                  </div>
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
