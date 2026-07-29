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
    finalExam: null,
    finalExamPassed: false,
    finalExamAttempts: 0,
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
      // Score-frei (STAFF-lesbares evidence, ADR 0005 Entscheidung 4).
      expect(
        d.evidence.assessment?.quizzes?.every(
          (q) => !("score" in q),
        ),
      ).toBe(true);
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

  it("dedupliziert mehrere bestandene Versuche derselben Quiz-Lesson (score-frei im Nachweis)", () => {
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
        { sectionSlug: "s1", lessonSlug: "q1" },
      ]);
    }
  });
});

describe("decideCourseCompletion — Abschlusstest-Gate (final_exam, Phase 7a 1b-ii)", () => {
  const finalExam = {
    sectionSlug: "s1",
    lessonSlug: "final",
    passingScore: 0.7,
  };

  it("finalExam gesetzt, aber nicht bestanden → nicht abgeschlossen (auch bei allen Lektionen erledigt)", () => {
    const d = decideCourseCompletion(
      baseInput({ finalExam, finalExamPassed: false }),
    );
    expect(d.complete).toBe(false);
  });

  it("finalExam gesetzt und bestanden + alle Lektionen erledigt → abgeschlossen, evidence.assessment.finalExam gesetzt (mit attempts), kein score irgendwo", () => {
    const d = decideCourseCompletion(
      baseInput({ finalExam, finalExamPassed: true, finalExamAttempts: 3 }),
    );
    expect(d.complete).toBe(true);
    if (d.complete) {
      expect(d.evidence.type).toBe("all_lessons_and_assessment");
      expect(d.evidence.assessment?.finalExam).toEqual({
        ...finalExam,
        attempts: 3,
      });
      expect(d.evidence.assessment?.quizzes).toBeUndefined();
      expect(JSON.stringify(d.evidence)).not.toContain('"score"');
    }
  });

  it("finalExam bestanden, aber finalExamAttempts: 0 → evidence.assessment.finalExam.attempts bleibt weg (kein Feld)", () => {
    const d = decideCourseCompletion(
      baseInput({ finalExam, finalExamPassed: true, finalExamAttempts: 0 }),
    );
    expect(d.complete).toBe(true);
    if (d.complete) {
      expect(d.evidence.assessment?.finalExam).toEqual(finalExam);
      expect(d.evidence.assessment?.finalExam?.attempts).toBeUndefined();
      expect("attempts" in (d.evidence.assessment?.finalExam ?? {})).toBe(
        false,
      );
    }
  });

  it("finalExam überstimmt assessmentRequired: bestanden, aber ein formatives Quiz NICHT bestanden → trotzdem abgeschlossen", () => {
    const d = decideCourseCompletion(
      baseInput({
        finalExam,
        finalExamPassed: true,
        assessmentRequired: true,
        quizLessons: [{ sectionSlug: "s1", lessonSlug: "q1" }],
        passedQuizzes: [], // formatives Quiz NICHT bestanden
      }),
    );
    expect(d.complete).toBe(true);
    if (d.complete) {
      expect(d.evidence.type).toBe("all_lessons_and_assessment");
      expect(d.evidence.assessment?.finalExam).toEqual(finalExam);
    }
  });

  it("kein finalExam → Regression: assessmentRequired-Gate wie bisher, evidence-quizzes ohne score", () => {
    const d = decideCourseCompletion(
      baseInput({
        finalExam: null,
        finalExamPassed: false,
        assessmentRequired: true,
        quizLessons: [{ sectionSlug: "s1", lessonSlug: "q1" }],
        passedQuizzes: [quiz("s1", "q1", 0.9)],
      }),
    );
    expect(d.complete).toBe(true);
    if (d.complete) {
      expect(d.evidence.assessment?.quizzes).toEqual([
        { sectionSlug: "s1", lessonSlug: "q1" },
      ]);
      expect(JSON.stringify(d.evidence)).not.toContain('"score"');
    }
  });

  it("finalExam gesetzt + bestanden, aber confirmationRequired && !confirmed → nicht abgeschlossen", () => {
    const d = decideCourseCompletion(
      baseInput({
        finalExam,
        finalExamPassed: true,
        confirmationRequired: true,
        confirmed: false,
      }),
    );
    expect(d.complete).toBe(false);
  });

  it("finalExam gesetzt + bestanden + confirmationRequired && confirmed → abgeschlossen mit Confirmation-Nachweis", () => {
    const d = decideCourseCompletion(
      baseInput({
        finalExam,
        finalExamPassed: true,
        confirmationRequired: true,
        confirmed: true,
      }),
    );
    expect(d.complete).toBe(true);
    if (d.complete) {
      expect(d.evidence.confirmation?.confirmed).toBe(true);
      expect(d.evidence.assessment?.finalExam).toEqual(finalExam);
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
