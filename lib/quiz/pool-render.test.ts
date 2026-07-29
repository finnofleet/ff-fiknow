import { describe, expect, test } from "vitest";

import { assertSafeMdx } from "../mdx/validate";
import { renderPoolQuestionsToMdx } from "./pool-render";
import type { PoolQuestion } from "./pool";

describe("renderPoolQuestionsToMdx", () => {
  test("baut <Question>/<Option> mit statischen Literal-Attributen", () => {
    const q: PoolQuestion = {
      slug: "q1",
      prompt: "Was ist 2+2?",
      type: "single",
      options: [
        { label: "3", correct: false },
        { label: "4", correct: true },
      ],
    };
    const mdx = renderPoolQuestionsToMdx([q]);
    expect(mdx).toBe(
      '<Question prompt={"Was ist 2+2?"} type={"single"}>\n' +
        '<Option correct={false}>3</Option>\n' +
        '<Option correct={true}>4</Option>\n' +
        "</Question>",
    );
  });

  test("laesst explanation weg, wenn null/undefined", () => {
    const q: PoolQuestion = {
      slug: "q1",
      prompt: "Frage",
      type: "single",
      options: [{ label: "A", correct: true }],
      explanation: null,
    };
    expect(renderPoolQuestionsToMdx([q])).not.toContain("explanation");
  });

  test("haengt explanation als eigenes Literal-Attribut an, wenn gesetzt", () => {
    const q: PoolQuestion = {
      slug: "q1",
      prompt: "Frage",
      type: "single",
      options: [{ label: "A", correct: true }],
      explanation: "Weil A korrekt ist.",
    };
    const mdx = renderPoolQuestionsToMdx([q]);
    expect(mdx).toContain('explanation={"Weil A korrekt ist."}');
  });

  test("trennt mehrere Fragen durch eine Leerzeile", () => {
    const q1: PoolQuestion = {
      slug: "q1",
      prompt: "Frage 1",
      type: "single",
      options: [{ label: "A", correct: true }],
    };
    const q2: PoolQuestion = {
      slug: "q2",
      prompt: "Frage 2",
      type: "single",
      options: [{ label: "B", correct: true }],
    };
    const mdx = renderPoolQuestionsToMdx([q1, q2]);
    expect(mdx).toContain("</Question>\n\n<Question");
  });

  test("leere Liste liefert leeren String", () => {
    expect(renderPoolQuestionsToMdx([])).toBe("");
  });

  test("Option-Label bleibt als Markdown-Kind erhalten (rich content)", () => {
    const q: PoolQuestion = {
      slug: "q1",
      prompt: "Rich-Option",
      type: "single",
      options: [
        { label: "**fett** und normal", correct: true },
        { label: "Mit [Link](https://example.com)", correct: false },
      ],
    };
    const mdx = renderPoolQuestionsToMdx([q]);
    expect(mdx).toContain("<Option correct={true}>**fett** und normal</Option>");
    expect(mdx).toContain(
      "<Option correct={false}>Mit [Link](https://example.com)</Option>",
    );
  });

  // === Haertungs-Konformitaet (ADR 0001) ===============================
  // Der rekonstruierte MDX-Body wird spaeter per MDXRemote mit
  // `hardenedRscOptions` gerendert (siehe page.tsx) — dieselbe Pipeline, die
  // `assertSafeMdx` beim Upload prueft (`hardenedRemarkPlugins`, kein Drift,
  // siehe lib/mdx/options.ts). Er MUSS diese Pruefung deshalb bestehen.
  describe("Konformitaet mit assertSafeMdx (Render-Haertung)", () => {
    test("Frage mit Anfuehrungszeichen im prompt + rich-Option besteht die Haertung", async () => {
      const questions: PoolQuestion[] = [
        {
          slug: "quotes",
          prompt: 'Was bedeutet "Least Privilege"?',
          type: "single",
          explanation: 'Siehe Prinzip "minimale Rechte".',
          options: [
            {
              label: "**Minimale** Rechte fuer jede Rolle ([mehr](https://example.com/policy))",
              correct: true,
            },
            { label: 'Ein Zitat: "alle Rechte fuer alle"', correct: false },
          ],
        },
        {
          slug: "multi",
          prompt: "Welche Aussagen treffen zu?",
          type: "multi",
          options: [
            { label: "Aussage A", correct: true },
            { label: "Aussage B", correct: false },
            { label: "Aussage C", correct: true },
          ],
        },
      ];

      const mdx = renderPoolQuestionsToMdx(questions);

      await expect(
        assertSafeMdx(mdx, "pool-render.test.ts"),
      ).resolves.toBeUndefined();
    });

    test("Sonderzeichen (Backslash, Zeilenumbruch, Unicode) im prompt bestehen die Haertung", async () => {
      const questions: PoolQuestion[] = [
        {
          slug: "special",
          prompt: "Pfad C:\\Windows\\ und Emoji \u{1F600} sowie Zeilen\nUmbruch?",
          type: "single",
          options: [{ label: "OK", correct: true }],
        },
      ];
      const mdx = renderPoolQuestionsToMdx(questions);
      await expect(
        assertSafeMdx(mdx, "pool-render.test.ts"),
      ).resolves.toBeUndefined();
    });
  });
});
