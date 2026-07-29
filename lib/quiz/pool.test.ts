import { describe, expect, test } from "vitest";

import { gradePoolAttempt, selectPoolQuestions, type PoolQuestion } from "./pool";

describe("selectPoolQuestions", () => {
  const pool = ["q1", "q2", "q3", "q4", "q5"];

  test("deterministisch: gleiche (pool, count, seed) -> identisches Array", () => {
    const a = selectPoolQuestions(pool, 3, "seed-abc");
    const b = selectPoolQuestions(pool, 3, "seed-abc");
    const c = selectPoolQuestions(pool, 3, "seed-abc");
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  test("verschiedene Seeds liefern gueltige Teilmengen der erwarteten Groesse", () => {
    const seeds = ["alpha", "beta", "gamma", "delta", "epsilon"];
    for (const seed of seeds) {
      const result = selectPoolQuestions(pool, 3, seed);
      expect(result.length).toBe(3);
      // Keine Duplikate in der Auswahl selbst.
      expect(new Set(result).size).toBe(result.length);
      // Alle Elemente muessen aus dem Pool stammen.
      for (const slug of result) {
        expect(pool).toContain(slug);
      }
    }
  });

  test("count >= len liefert alle Elemente (als Menge)", () => {
    const exact = selectPoolQuestions(pool, pool.length, "seed-x");
    expect(new Set(exact)).toEqual(new Set(pool));

    const more = selectPoolQuestions(pool, pool.length + 10, "seed-x");
    expect(new Set(more)).toEqual(new Set(pool));
    expect(more.length).toBe(pool.length);
  });

  test("count = 0 liefert leeres Array", () => {
    expect(selectPoolQuestions(pool, 0, "seed-x")).toEqual([]);
  });

  test("negative count liefert leeres Array", () => {
    expect(selectPoolQuestions(pool, -5, "seed-x")).toEqual([]);
  });

  test("Duplikate im Pool werden dedupliziert", () => {
    const poolWithDupes = ["q1", "q2", "q1", "q3", "q2", "q4"];
    const result = selectPoolQuestions(poolWithDupes, poolWithDupes.length, "seed-y");
    expect(new Set(result)).toEqual(new Set(["q1", "q2", "q3", "q4"]));
    expect(result.length).toBe(4);
  });

  test("verschiedene Seeds koennen unterschiedliche Reihenfolgen/Auswahlen ergeben", () => {
    const a = selectPoolQuestions(pool, 3, "seed-1");
    const b = selectPoolQuestions(pool, 3, "seed-2");
    // Nicht garantiert unterschiedlich fuer jedes beliebige Seed-Paar, aber
    // fuer diese konkrete Kombination erwarten wir eine Abweichung als
    // Nachweis, dass der Seed tatsaechlich einfliesst.
    expect(a).not.toEqual(b);
  });
});

describe("gradePoolAttempt", () => {
  const q1: PoolQuestion = {
    slug: "q1",
    prompt: "Was ist 2+2?",
    type: "single",
    options: [
      { label: "3", correct: false },
      { label: "4", correct: true },
      { label: "5", correct: false },
    ],
  };
  const q2: PoolQuestion = {
    slug: "q2",
    prompt: "Welche sind Primzahlen?",
    type: "multi",
    options: [
      { label: "2", correct: true },
      { label: "3", correct: true },
      { label: "4", correct: false },
    ],
  };

  test("alle richtig -> passed true, score 1", () => {
    const result = gradePoolAttempt(
      [q1, q2],
      [
        { prompt: q1.prompt, selected: [1] },
        { prompt: q2.prompt, selected: [0, 1] },
      ],
      0.7,
    );
    expect(result.total).toBe(2);
    expect(result.correct).toBe(2);
    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
  });

  test("eine falsch -> score < 1", () => {
    const result = gradePoolAttempt(
      [q1, q2],
      [
        { prompt: q1.prompt, selected: [0] }, // falsch
        { prompt: q2.prompt, selected: [0, 1] }, // richtig
      ],
      0.7,
    );
    expect(result.total).toBe(2);
    expect(result.correct).toBe(1);
    expect(result.score).toBe(0.5);
    expect(result.passed).toBe(false);
  });

  test("nicht beantwortete Frage (fehlt in submitted) -> falsch", () => {
    const result = gradePoolAttempt(
      [q1, q2],
      [{ prompt: q1.prompt, selected: [1] }], // q2 fehlt
      0.5,
    );
    expect(result.total).toBe(2);
    expect(result.correct).toBe(1);
    expect(result.perQuestion.find((p) => p.slug === "q2")?.isCorrect).toBe(false);
  });

  test("passingScore-Grenze exakt: score === passingScore -> passed true", () => {
    const result = gradePoolAttempt(
      [q1, q2],
      [
        { prompt: q1.prompt, selected: [1] }, // richtig
        { prompt: q2.prompt, selected: [0] }, // falsch (unvollstaendig)
      ],
      0.5, // score = 0.5, Grenze = 0.5 -> passed
    );
    expect(result.score).toBe(0.5);
    expect(result.passed).toBe(true);
  });

  test("passingScore knapp verfehlt -> passed false", () => {
    const result = gradePoolAttempt(
      [q1, q2],
      [
        { prompt: q1.prompt, selected: [1] },
        { prompt: q2.prompt, selected: [0] },
      ],
      0.51,
    );
    expect(result.score).toBe(0.5);
    expect(result.passed).toBe(false);
  });

  test("Multi verlangt exakten Set-Match (fehlende korrekte Option -> falsch)", () => {
    const result = gradePoolAttempt(
      [q2],
      [{ prompt: q2.prompt, selected: [0] }], // nur eine von zwei korrekten
      0.5,
    );
    expect(result.correct).toBe(0);
    expect(result.perQuestion[0].isCorrect).toBe(false);
  });

  test("Multi verlangt exakten Set-Match (zusaetzliche falsche Option -> falsch)", () => {
    const result = gradePoolAttempt(
      [q2],
      [{ prompt: q2.prompt, selected: [0, 1, 2] }], // beide korrekten + eine falsche
      0.5,
    );
    expect(result.correct).toBe(0);
    expect(result.perQuestion[0].isCorrect).toBe(false);
  });

  test("leeres selected -> total 0, passed false", () => {
    const result = gradePoolAttempt([], [{ prompt: "irrelevant", selected: [0] }], 0.5);
    expect(result.total).toBe(0);
    expect(result.correct).toBe(0);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.perQuestion).toEqual([]);
  });
});
