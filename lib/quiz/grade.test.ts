import { describe, expect, test } from "vitest";

import {
  correctIndices,
  isAnswerCorrect,
  optionVisualState,
  summarizeQuiz,
} from "./grade";

describe("correctIndices", () => {
  test("liefert die Indizes der korrekten Optionen in Reihenfolge", () => {
    expect(correctIndices([true, false, false, false])).toEqual([0]);
    expect(correctIndices([false, false, false, true])).toEqual([3]);
    expect(correctIndices([true, true, true, false])).toEqual([0, 1, 2]);
    expect(correctIndices([false, false])).toEqual([]);
  });
});

describe("isAnswerCorrect — single choice", () => {
  const flags = [true, false, false, false]; // korrekt = Option 0

  // Regression: die korrekte (erste) Option MUSS als richtig gewertet werden.
  test("korrekte erste Option gewählt -> richtig", () => {
    expect(isAnswerCorrect(flags, [0])).toBe(true);
  });

  test("falsche Option gewählt -> falsch", () => {
    expect(isAnswerCorrect(flags, [1])).toBe(false);
    expect(isAnswerCorrect(flags, [3])).toBe(false);
  });

  test("korrekte letzte Option gewählt -> richtig", () => {
    expect(isAnswerCorrect([false, false, false, true], [3])).toBe(true);
  });

  test("nichts gewählt -> falsch", () => {
    expect(isAnswerCorrect(flags, [])).toBe(false);
  });
});

describe("isAnswerCorrect — multiple choice", () => {
  const flags = [true, true, true, false]; // korrekt = 0,1,2

  test("genau alle korrekten gewählt -> richtig", () => {
    expect(isAnswerCorrect(flags, [0, 1, 2])).toBe(true);
    expect(isAnswerCorrect(flags, [2, 0, 1])).toBe(true); // Reihenfolge egal
  });

  test("eine korrekte fehlt -> falsch", () => {
    expect(isAnswerCorrect(flags, [0, 1])).toBe(false);
  });

  test("eine falsche zusätzlich gewählt -> falsch", () => {
    expect(isAnswerCorrect(flags, [0, 1, 2, 3])).toBe(false);
  });

  test("nur die falsche gewählt -> falsch", () => {
    expect(isAnswerCorrect(flags, [3])).toBe(false);
  });
});

describe("optionVisualState", () => {
  const flags = [true, false, false];

  test("vor dem Absenden: default / selected", () => {
    const selected = new Set([1]);
    expect(
      optionVisualState(0, { submitted: false, selected, correctFlags: flags }),
    ).toBe("default");
    expect(
      optionVisualState(1, { submitted: false, selected, correctFlags: flags }),
    ).toBe("selected");
  });

  test("nach dem Absenden: correct / wrong / missed / default", () => {
    // Lerner hat die falsche Option 1 gewählt.
    const selected = new Set([1]);
    const p = { submitted: true, selected, correctFlags: flags };
    expect(optionVisualState(1, p)).toBe("wrong"); // gewählt, falsch
    expect(optionVisualState(0, p)).toBe("missed"); // korrekt, nicht gewählt
    expect(optionVisualState(2, p)).toBe("default"); // egal
  });

  test("nach dem Absenden: korrekt gewählt -> correct", () => {
    const selected = new Set([0]);
    expect(
      optionVisualState(0, { submitted: true, selected, correctFlags: flags }),
    ).toBe("correct");
  });
});

describe("summarizeQuiz", () => {
  test("alle richtig -> bestanden", () => {
    const s = summarizeQuiz(
      [{ isCorrect: true }, { isCorrect: true }],
      2,
      0.7,
    );
    expect(s).toMatchObject({
      answered: 2,
      correct: 2,
      allAnswered: true,
      score: 1,
      passed: true,
      scorePct: 100,
    });
  });

  test("unter Bestehensgrenze -> nicht bestanden", () => {
    const s = summarizeQuiz(
      [{ isCorrect: true }, { isCorrect: false }, { isCorrect: false }],
      3,
      0.7,
    );
    expect(s.allAnswered).toBe(true);
    expect(s.passed).toBe(false);
    expect(s.scorePct).toBe(33);
  });

  test("nicht alle beantwortet -> allAnswered=false", () => {
    const s = summarizeQuiz([{ isCorrect: true }], 3, 0.7);
    expect(s.allAnswered).toBe(false);
  });

  test("keine Antworten -> score 0, kein Crash", () => {
    const s = summarizeQuiz([], 3, 0.7);
    expect(s).toMatchObject({ answered: 0, score: 0, allAnswered: false });
  });
});
