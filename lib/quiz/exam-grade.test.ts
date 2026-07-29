import { describe, it, expect } from "vitest";

import { extractExamQuestions, gradeExam } from "./exam-grade";

describe("extractExamQuestions", () => {
  it("extrahiert eine Single-Frage mit einer korrekten Option", () => {
    const mdx = `
<Question prompt="Was ist 1+1?" type="single">
  <Option correct={true}>2</Option>
  <Option>3</Option>
  <Option>4</Option>
</Question>
`;
    const questions = extractExamQuestions(mdx);
    expect(questions).toHaveLength(1);
    expect(questions[0]).toEqual({
      prompt: "Was ist 1+1?",
      type: "single",
      correctIndices: [0],
      optionCount: 3,
    });
  });

  it("extrahiert eine Multi-Frage mit zwei korrekten Optionen", () => {
    const mdx = `
<Question prompt="Welche sind Primzahlen?" type="multi">
  <Option correct={true}>2</Option>
  <Option>4</Option>
  <Option correct={true}>3</Option>
  <Option>6</Option>
</Question>
`;
    const questions = extractExamQuestions(mdx);
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe("multi");
    expect(questions[0].correctIndices).toEqual([0, 2]);
    expect(questions[0].optionCount).toBe(4);
  });

  it("extrahiert mehrere Fragen in Dokument-Reihenfolge", () => {
    const mdx = `
# Abschlusstest

<Question prompt="Frage A" type="single">
  <Option correct={true}>A1</Option>
  <Option>A2</Option>
</Question>

Ein erklaerender Absatz dazwischen.

<Question prompt="Frage B" type="multi">
  <Option>B1</Option>
  <Option correct={true}>B2</Option>
</Question>
`;
    const questions = extractExamQuestions(mdx);
    expect(questions).toHaveLength(2);
    expect(questions[0].prompt).toBe("Frage A");
    expect(questions[1].prompt).toBe("Frage B");
    expect(questions[1].correctIndices).toEqual([1]);
  });

  it("erkennt Shorthand `correct` (ohne Wert) als true", () => {
    const mdx = `
<Question prompt="Shorthand-Test" type="single">
  <Option correct>Richtig</Option>
  <Option>Falsch</Option>
</Question>
`;
    const questions = extractExamQuestions(mdx);
    expect(questions[0].correctIndices).toEqual([0]);
  });

  it("ignoriert Nicht-Question-MDX (Absaetze, Ueberschriften)", () => {
    const mdx = `
# Titel

Ein normaler Absatz ohne Fragen.

## Zwischenueberschrift

Noch ein Absatz.
`;
    expect(extractExamQuestions(mdx)).toEqual([]);
  });

  it("liefert [] fuer leeren Body", () => {
    expect(extractExamQuestions("")).toEqual([]);
    expect(extractExamQuestions("   \n  ")).toEqual([]);
  });
});

describe("gradeExam", () => {
  const questions = [
    {
      prompt: "Frage A",
      type: "single" as const,
      correctIndices: [1],
      optionCount: 3,
    },
    {
      prompt: "Frage B",
      type: "multi" as const,
      correctIndices: [0, 2],
      optionCount: 3,
    },
  ];

  it("alle richtig -> passed true, score 1", () => {
    const result = gradeExam(
      questions,
      [
        { prompt: "Frage A", selected: [1] },
        { prompt: "Frage B", selected: [0, 2] },
      ],
      1,
    );
    expect(result.total).toBe(2);
    expect(result.correct).toBe(2);
    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
  });

  it("eine falsch -> score < 1", () => {
    const result = gradeExam(
      questions,
      [
        { prompt: "Frage A", selected: [0] }, // falsch
        { prompt: "Frage B", selected: [0, 2] },
      ],
      1,
    );
    expect(result.correct).toBe(1);
    expect(result.score).toBe(0.5);
    expect(result.passed).toBe(false);
    expect(result.perQuestion).toEqual([
      { prompt: "Frage A", isCorrect: false },
      { prompt: "Frage B", isCorrect: true },
    ]);
  });

  it("nicht beantwortete Frage (fehlt in submitted) zaehlt als falsch", () => {
    const result = gradeExam(
      questions,
      [{ prompt: "Frage A", selected: [1] }],
      0.5,
    );
    expect(result.correct).toBe(1);
    expect(result.total).toBe(2);
    expect(result.perQuestion[1]).toEqual({
      prompt: "Frage B",
      isCorrect: false,
    });
  });

  it("passingScore-Grenze exakt: score === passingScore -> passed true", () => {
    const result = gradeExam(
      questions,
      [
        { prompt: "Frage A", selected: [1] },
        { prompt: "Frage B", selected: [0] }, // falsch (Teilmenge)
      ],
      0.5,
    );
    expect(result.score).toBe(0.5);
    expect(result.passed).toBe(true);
  });

  it("Multi verlangt exakten Set-Match -> Teilmenge ist falsch", () => {
    const result = gradeExam(
      [questions[1]],
      [{ prompt: "Frage B", selected: [0] }], // nur eine von zwei korrekten
      1,
    );
    expect(result.perQuestion[0].isCorrect).toBe(false);
  });

  it("Integritaet: client-behauptetes isCorrect wird ignoriert, nur selected zaehlt", () => {
    // Die Submission behauptet faelschlich isCorrect: true bei falscher
    // Auswahl (Feld existiert nur im Rest der Payload, nicht im hier
    // verwendeten Typ) -- gradeExam liest ausschliesslich `selected`.
    const fakeSubmission = {
      prompt: "Frage A",
      selected: [0], // falscher Index
      // Zusaetzliche, hier ignorierte Felder eines potenziell manipulierten
      // Client-Payloads:
      isCorrect: true,
      correct: true,
      score: 1,
    };
    const result = gradeExam(questions, [fakeSubmission], 1);
    expect(result.perQuestion[0]).toEqual({
      prompt: "Frage A",
      isCorrect: false,
    });
  });
});
