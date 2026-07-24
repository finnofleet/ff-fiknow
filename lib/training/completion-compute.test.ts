import { describe, expect, it } from "vitest";

import {
  decideCourseCompletion,
  type CompletionInput,
} from "./completion-compute";

function baseInput(over: Partial<CompletionInput> = {}): CompletionInput {
  return {
    totalLessons: 3,
    completedLessons: 3,
    assessmentRequired: false,
    quizLessons: [],
    passedQuizzes: [],
    drivers: [],
    estimatedMinutes: null,
    confirmationRequired: false,
    confirmed: false,
    ...over,
  };
}

const quiz = (sectionSlug: string, lessonSlug: string, score = 1) => ({
  sectionSlug,
  lessonSlug,
  score,
});

describe("decideCourseCompletion — Lektions-Basis", () => {
  it("nicht abgeschlossen, solange nicht alle Lektionen erledigt sind", () => {
    const d = decideCourseCompletion(
      baseInput({ totalLessons: 3, completedLessons: 2 }),
    );
    expect(d.complete).toBe(false);
  });

  it("abgeschlossen, wenn alle Lektionen erledigt sind (kein Gate)", () => {
    const d = decideCourseCompletion(baseInput());
    expect(d.complete).toBe(true);
    if (d.complete) expect(d.evidence.type).toBe("all_lessons");
  });

  it("0-Lektionen-Kurs gilt als vacuously abgeschlossen", () => {
    const d = decideCourseCompletion(
      baseInput({ totalLessons: 0, completedLessons: 0 }),
    );
    expect(d.complete).toBe(true);
  });
});

describe("decideCourseCompletion — Lernkontroll-Gate (opt-in)", () => {
  it("assessmentRequired ohne Quiz greift NICHT (quizlose Kurse unberührt)", () => {
    const d = decideCourseCompletion(
      baseInput({ assessmentRequired: true, quizLessons: [] }),
    );
    expect(d.complete).toBe(true);
    if (d.complete) expect(d.evidence.type).toBe("all_lessons");
  });

  it("blockiert, wenn ein erforderliches Quiz nicht bestanden ist", () => {
    const d = decideCourseCompletion(
      baseInput({
        assessmentRequired: true,
        quizLessons: [{ sectionSlug: "s1", lessonSlug: "q1" }],
        passedQuizzes: [],
      }),
    );
    expect(d.complete).toBe(false);
  });

  it("schließt ab, wenn alle erforderlichen Quizze bestanden sind", () => {
    const d = decideCourseCompletion(
      baseInput({
        assessmentRequired: true,
        quizLessons: [
          { sectionSlug: "s1", lessonSlug: "q1" },
          { sectionSlug: "s2", lessonSlug: "q2" },
        ],
        passedQuizzes: [quiz("s1", "q1", 0.8), quiz("s2", "q2", 1)],
      }),
    );
    expect(d.complete).toBe(true);
    if (d.complete) {
      expect(d.evidence.type).toBe("all_lessons_and_assessment");
      expect(d.evidence.assessment?.quizzes).toHaveLength(2);
    }
  });

  it("blockiert, wenn nur eines von mehreren Quizzen bestanden ist", () => {
    const d = decideCourseCompletion(
      baseInput({
        assessmentRequired: true,
        quizLessons: [
          { sectionSlug: "s1", lessonSlug: "q1" },
          { sectionSlug: "s2", lessonSlug: "q2" },
        ],
        passedQuizzes: [quiz("s1", "q1")],
      }),
    );
    expect(d.complete).toBe(false);
  });

  it("ein bestandener Versuch in falscher Section zählt nicht (Section+Lesson-Key)", () => {
    const d = decideCourseCompletion(
      baseInput({
        assessmentRequired: true,
        quizLessons: [{ sectionSlug: "s1", lessonSlug: "q1" }],
        // gleicher lessonSlug, aber andere Section → kein Match
        passedQuizzes: [quiz("s2", "q1")],
      }),
    );
    expect(d.complete).toBe(false);
  });

  it("nimmt den besten Score je Quiz in den Nachweis auf", () => {
    const d = decideCourseCompletion(
      baseInput({
        assessmentRequired: true,
        quizLessons: [{ sectionSlug: "s1", lessonSlug: "q1" }],
        passedQuizzes: [quiz("s1", "q1", 0.7), quiz("s1", "q1", 0.95)],
      }),
    );
    expect(d.complete).toBe(true);
    if (d.complete) {
      expect(d.evidence.assessment?.quizzes).toEqual([
        { sectionSlug: "s1", lessonSlug: "q1", score: 0.95 },
      ]);
    }
  });
});

describe("decideCourseCompletion — Verständnisbestätigung (opt-in, Phase 6c)", () => {
  it("confirmationRequired && !confirmed → nicht abgeschlossen", () => {
    const d = decideCourseCompletion(
      baseInput({ confirmationRequired: true, confirmed: false }),
    );
    expect(d.complete).toBe(false);
  });

  it("confirmationRequired && confirmed → abgeschlossen, evidence.confirmation.confirmed === true", () => {
    const d = decideCourseCompletion(
      baseInput({ confirmationRequired: true, confirmed: true }),
    );
    expect(d.complete).toBe(true);
    if (d.complete) {
      expect(d.evidence.confirmation?.confirmed).toBe(true);
    }
  });

  it("kombiniert mit Quiz-Gate: Quiz bestanden, aber nicht bestätigt → nicht abgeschlossen", () => {
    const d = decideCourseCompletion(
      baseInput({
        assessmentRequired: true,
        quizLessons: [{ sectionSlug: "s1", lessonSlug: "q1" }],
        passedQuizzes: [quiz("s1", "q1")],
        confirmationRequired: true,
        confirmed: false,
      }),
    );
    expect(d.complete).toBe(false);
  });

  it("kombiniert mit Quiz-Gate: bestätigt, aber Quiz nicht bestanden → nicht abgeschlossen", () => {
    const d = decideCourseCompletion(
      baseInput({
        assessmentRequired: true,
        quizLessons: [{ sectionSlug: "s1", lessonSlug: "q1" }],
        passedQuizzes: [],
        confirmationRequired: true,
        confirmed: true,
      }),
    );
    expect(d.complete).toBe(false);
  });

  it("kombiniert mit Quiz-Gate: beides erfüllt → abgeschlossen", () => {
    const d = decideCourseCompletion(
      baseInput({
        assessmentRequired: true,
        quizLessons: [{ sectionSlug: "s1", lessonSlug: "q1" }],
        passedQuizzes: [quiz("s1", "q1")],
        confirmationRequired: true,
        confirmed: true,
      }),
    );
    expect(d.complete).toBe(true);
    if (d.complete) {
      expect(d.evidence.type).toBe("all_lessons_and_assessment");
      expect(d.evidence.confirmation?.confirmed).toBe(true);
    }
  });

  it("confirmationRequired false → unverändert, kein evidence.confirmation", () => {
    const d = decideCourseCompletion(
      baseInput({ confirmationRequired: false, confirmed: false }),
    );
    expect(d.complete).toBe(true);
    if (d.complete) {
      expect(d.evidence.confirmation).toBeUndefined();
    }
  });
});

describe("decideCourseCompletion — evidence-Anreicherung", () => {
  it("friert Treiber und Umfang ein", () => {
    const d = decideCourseCompletion(
      baseInput({ drivers: ["eu_ai_act", "iso_42001"], estimatedMinutes: 90 }),
    );
    expect(d.complete).toBe(true);
    if (d.complete) {
      expect(d.evidence.drivers).toEqual(["eu_ai_act", "iso_42001"]);
      expect(d.evidence.estimatedMinutes).toBe(90);
    }
  });

  it("lässt leere Treiber und fehlenden Umfang weg", () => {
    const d = decideCourseCompletion(
      baseInput({ drivers: [], estimatedMinutes: null }),
    );
    expect(d.complete).toBe(true);
    if (d.complete) {
      expect(d.evidence.drivers).toBeUndefined();
      expect(d.evidence.estimatedMinutes).toBeUndefined();
    }
  });

  it("Umfang 0 wird als gültiger Wert eingefroren", () => {
    const d = decideCourseCompletion(baseInput({ estimatedMinutes: 0 }));
    expect(d.complete).toBe(true);
    if (d.complete) expect(d.evidence.estimatedMinutes).toBe(0);
  });
});
