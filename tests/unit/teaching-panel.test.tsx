import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import TeachingPanel from "../../src/components/TeachingPanel";
import { loadAllTeaching, loadTestBank } from "./fixtures";

describe("teaching review rendering", () => {
  test("renders every option as a readable explanation and worked rewrite", async () => {
    const [bank, teachingById] = await Promise.all([loadTestBank(), loadAllTeaching()]);
    const question = bank.questions[0];
    const teaching = teachingById.get(question.id);
    expect(teaching).toBeDefined();

    const markup = renderToStaticMarkup(
      <TeachingPanel teaching={teaching!} options={question.options} />,
    );

    expect(markup.match(/class="option-explanation"/g)).toHaveLength(4);
    expect(markup.match(/When can this option be right\?/g)).toHaveLength(4);
    expect(markup.match(/Best answer:/g)).toHaveLength(4);
    expect(markup.match(/Foundation/g)).toHaveLength(4);
    expect(markup.match(/Decision rule/g)).toHaveLength(4);
    expect(markup.match(/How to recognise the change/g)).toHaveLength(4);
    expect(markup).not.toContain("<small>");

    const positions = ["A", "B", "C", "D"].map((id) =>
      markup.indexOf(`option-review__letter">${id}</span>`),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });
});
