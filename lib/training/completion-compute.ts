/**
 * Reine, I/O-freie Abschluss-Entscheidung für Pflichtkurse (ADR 0005 §4 +
 * Abschnitt 6 „Art.-4-Schärfung").
 *
 * Bewusst ohne DB/Payload: entscheidet allein aus übergebenen Fakten, ob ein
 * Kurs als abgeschlossen gilt, und baut den Nachweis-`evidence`-Payload, der
 * beim Abschluss eingefroren wird. Dadurch vollständig unit-testbar
 * (siehe completion-compute.test.ts) — Konvention wie
 * `paths-progress-compute.ts` / `compliance-compute.ts`.
 *
 * Abschluss-Definition:
 *   1. Alle Lektionen erledigt (0-Lektionen-Kurs = vacuously done) — wie bisher.
 *   2. NEU, opt-in: Ist `assessmentRequired` gesetzt UND enthält der Kurs
 *      mindestens ein Quiz, muss JEDES Quiz bestanden sein (`passed`-Versuch
 *      vorhanden). Ohne Quiz greift das Flag nicht (der häufige Fall bleibt
 *      unberührt).
 *   3. NEU, opt-in (Phase 6c): Ist `confirmationRequired` gesetzt, muss der
 *      Aufrufer eine explizite Verständnisbestätigung (`confirmed: true`)
 *      mitliefern. Ohne das Flag greift diese Bedingung nicht.
 */

/** Ein Quiz im Kurs, adressiert über Section- + Lesson-Slug. */
export type QuizLessonRef = {
  sectionSlug: string;
  lessonSlug: string;
};

/** Ein bestandener Quiz-Versuch (aus `quiz_attempts`, `passed = true`). */
export type PassedQuiz = {
  sectionSlug: string;
  lessonSlug: string;
  /** Bester Score (0..1) des bestandenen Versuchs für diese Lesson. */
  score: number;
};

/** In `training_assignments.evidence` eingefrorener Nachweis-Payload. */
export type CompletionEvidence = {
  /** Abschluss-Kriterium, das gegriffen hat. */
  type: "all_lessons" | "all_lessons_and_assessment";
  /** Compliance-Treiber-Snapshot (z. B. ["eu_ai_act"]) — leer weggelassen. */
  drivers?: string[];
  /** Nominaler Umfang (Minuten) zum Abschlusszeitpunkt — Art.-4-„Umfang". */
  estimatedMinutes?: number;
  /**
   * Nachweis der bestandenen Lernkontrolle — STAFF-LESBAR (via RLS-Policy
   * training_assignments_select_staff). Darf daher NIE Score/Rohantworten
   * enthalten, nur Status/Referenzen. Der Detail-Score bleibt owner-only in
   * quiz_attempts (ADR 0005 Entscheidung 4, Kollegen-Review Punkt 2).
   */
  assessment?: {
    /** Verbindlicher Abschlusstest (final_exam), falls der Kurs einen hat. */
    finalExam?: {
      sectionSlug: string;
      lessonSlug: string;
      passingScore: number;
      /**
       * Anzahl Versuche bis zum ersten Bestehen (aus quiz_attempts). NUR
       * Zaehler — kein Score/keine Rohantworten (staff-lesbar).
       */
      attempts?: number;
    };
    /** Formatives Lernkontroll-Gate (assessmentRequired, 6b): bestandene Quizze — OHNE Score. */
    quizzes?: { sectionSlug: string; lessonSlug: string }[];
  };
  /**
   * Nur bei `confirmationRequired`: Nachweis der Verständnisbestätigung.
   * `confirmedAt` wird NICHT hier gesetzt (reine Funktion) — das übernimmt
   * `syncCourseCompletion` (I/O-Schicht) nach der Entscheidung.
   */
  confirmation?: {
    confirmed: true;
    confirmedAt?: string;
  };
};

export type CompletionDecision =
  | { complete: false }
  | { complete: true; evidence: CompletionEvidence };

export type CompletionInput = {
  totalLessons: number;
  completedLessons: number;
  /** Kurs-Flag `assessmentRequired`. */
  assessmentRequired: boolean;
  /** Alle Quiz-Lektionen des Kurses. */
  quizLessons: readonly QuizLessonRef[];
  /** Quiz-Lektionen, für die ein bestandener Versuch existiert. */
  passedQuizzes: readonly PassedQuiz[];
  /** `complianceDrivers`-Snapshot des Kurses. */
  drivers: readonly string[];
  /** `estimatedMinutes` des Kurses (nominaler Umfang) oder null. */
  estimatedMinutes: number | null;
  /** Kurs-Flag `confirmationRequired`. */
  confirmationRequired: boolean;
  /** Hat der Nutzer die Verständnisbestätigung mit dieser Aktion abgegeben? */
  confirmed: boolean;
  /** Der Abschlusstest-Lesson-Ref des Kurses (frontmatter.final_exam), falls vorhanden. */
  finalExam: { sectionSlug: string; lessonSlug: string; passingScore: number } | null;
  /** Existiert ein server-bestandener Versuch fuer den Abschlusstest? */
  finalExamPassed: boolean;
  /** Versuche bis Bestehen; 0 wenn kein final_exam oder nicht bestanden. */
  finalExamAttempts: number;
};

const quizKey = (q: { sectionSlug: string; lessonSlug: string }): string =>
  `${q.sectionSlug} ${q.lessonSlug}`;

/**
 * Reichert ein frisch erzeugtes `evidence`-Grundgerüst (nur `type` gesetzt)
 * um die von beiden Zweigen gemeinsam genutzten Felder an: Treiber-Snapshot,
 * nominaler Umfang, Verständnisbestätigung. Mutiert `evidence` in-place.
 */
function enrichEvidence(
  evidence: CompletionEvidence,
  input: CompletionInput,
): void {
  const drivers = input.drivers.filter((d) => d.length > 0);
  if (drivers.length > 0) evidence.drivers = [...drivers];

  if (typeof input.estimatedMinutes === "number") {
    evidence.estimatedMinutes = input.estimatedMinutes;
  }

  if (input.confirmationRequired) {
    evidence.confirmation = { confirmed: true };
  }
}

/**
 * Entscheidet, ob der Kurs abgeschlossen ist, und liefert bei Abschluss den
 * `evidence`-Payload. Keine Seiteneffekte.
 */
export function decideCourseCompletion(
  input: CompletionInput,
): CompletionDecision {
  const allLessonsDone =
    input.totalLessons === 0 ||
    input.completedLessons >= input.totalLessons;
  if (!allLessonsDone) return { complete: false };

  // Abschlusstest-Gate (verbindlich, Phase 7a): existiert ein final_exam,
  // ENTSCHEIDET dessen server-gewerteter Bestehens-Status allein — es
  // ÜBERSTIMMT das formative assessmentRequired-Gate (kein zusätzliches
  // „alle Quizze bestanden" nötig, wenn ein Abschlusstest vorhanden ist).
  if (input.finalExam) {
    if (!input.finalExamPassed) return { complete: false };

    // Verständnisbestätigungs-Gate greift auch hier, wenn opt-in gesetzt.
    if (input.confirmationRequired && !input.confirmed) {
      return { complete: false };
    }

    const evidence: CompletionEvidence = { type: "all_lessons_and_assessment" };
    enrichEvidence(evidence, input);
    evidence.assessment = {
      finalExam: {
        sectionSlug: input.finalExam.sectionSlug,
        lessonSlug: input.finalExam.lessonSlug,
        passingScore: input.finalExam.passingScore,
        ...(input.finalExamAttempts > 0
          ? { attempts: input.finalExamAttempts }
          : {}),
      },
    };

    return { complete: true, evidence };
  }

  // Lernkontroll-Gate greift nur, wenn opt-in gesetzt UND ein Quiz existiert.
  const gate = input.assessmentRequired && input.quizLessons.length > 0;

  if (gate) {
    const passedKeys = new Set(input.passedQuizzes.map(quizKey));
    const allQuizzesPassed = input.quizLessons.every((q) =>
      passedKeys.has(quizKey(q)),
    );
    if (!allQuizzesPassed) return { complete: false };
  }

  // Verständnisbestätigungs-Gate greift nur, wenn opt-in gesetzt.
  if (input.confirmationRequired && !input.confirmed) {
    return { complete: false };
  }

  const evidence: CompletionEvidence = {
    type: gate ? "all_lessons_and_assessment" : "all_lessons",
  };
  enrichEvidence(evidence, input);

  if (gate) {
    // Nur die tatsächlich zum Kurs gehörenden, bestandenen Quizze in den
    // Nachweis — OHNE Score (STAFF-lesbar, ADR 0005 Entscheidung 4).
    const wanted = new Set(input.quizLessons.map(quizKey));
    const seen = new Set<string>();
    const quizzes: { sectionSlug: string; lessonSlug: string }[] = [];
    for (const q of input.passedQuizzes) {
      const key = quizKey(q);
      if (!wanted.has(key) || seen.has(key)) continue;
      seen.add(key);
      quizzes.push({ sectionSlug: q.sectionSlug, lessonSlug: q.lessonSlug });
    }
    evidence.assessment = { quizzes };
  }

  return { complete: true, evidence };
}
