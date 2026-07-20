/**
 * Reine, framework-unabhängige Quiz-Bewertungslogik — die EINZIGE Wahrheit
 * für „ist diese Antwort korrekt?".
 *
 * Bewusst ohne React/DOM: Die Bewertung darf NICHT von Effekt-Timing,
 * Registrierungs-Reihenfolge oder Client-Hydration abhängen. Genau diese
 * Kopplung hat das Quiz wiederholt kaputtgemacht (korrekte Antworten als
 * falsch angezeigt), weil die Options-Liste clientseitig per useEffect
 * aufgebaut wurde und ihre Reihenfolge gegen die `correct`-Flags verrutschte.
 *
 * Hier arbeiten wir ausschließlich über positionsstabile `correctFlags`
 * (ein Boolean pro Option, in Options-Reihenfolge) und ausgewählte Indizes.
 * Diese Datei ist vollständig unit-testbar (siehe grade.test.ts).
 */

export type QuestionMode = "single" | "multi";

export type OptionVisualState =
  | "default"
  | "selected"
  | "correct"
  | "wrong"
  | "missed";

/** Indizes aller als korrekt markierten Optionen, aufsteigend sortiert. */
export function correctIndices(correctFlags: readonly boolean[]): number[] {
  const out: number[] = [];
  correctFlags.forEach((isCorrect, i) => {
    if (isCorrect) out.push(i);
  });
  return out;
}

/**
 * Korrekt genau dann, wenn die Auswahl exakt der Menge der korrekten
 * Optionen entspricht — keine fehlende, keine zusätzliche. Gilt für single
 * (genau 1 korrekt) und multi (n korrekt) identisch.
 */
export function isAnswerCorrect(
  correctFlags: readonly boolean[],
  selected: Iterable<number>,
): boolean {
  const sel = new Set(selected);
  const correct = correctIndices(correctFlags);
  if (sel.size !== correct.length) return false;
  return correct.every((i) => sel.has(i));
}

/**
 * Visueller Zustand einer einzelnen Option — steuert Häkchen/Kreuz-Icon und
 * Farbgebung. Vor dem Absenden nur default/selected; danach die volle
 * Auswertung inkl. „missed" (korrekt, aber nicht gewählt).
 */
export function optionVisualState(
  index: number,
  params: {
    submitted: boolean;
    selected: ReadonlySet<number>;
    correctFlags: readonly boolean[];
  },
): OptionVisualState {
  const { submitted, selected, correctFlags } = params;
  if (!submitted) return selected.has(index) ? "selected" : "default";
  const isSelected = selected.has(index);
  const isCorrect = Boolean(correctFlags[index]);
  if (isSelected && isCorrect) return "correct";
  if (isSelected && !isCorrect) return "wrong";
  if (!isSelected && isCorrect) return "missed";
  return "default";
}

export type QuizSummary = {
  /** Anzahl beantworteter Fragen */
  answered: number;
  /** Anzahl korrekt beantworteter Fragen */
  correct: number;
  /** Alle Fragen der Lesson beantwortet? */
  allAnswered: boolean;
  /** Anteil korrekt (0..1) über die beantworteten Fragen */
  score: number;
  /** Bestanden gemäß Bestehensgrenze? Erst aussagekräftig, wenn allAnswered. */
  passed: boolean;
  /** Score als ganze Prozent (0..100) für die Anzeige */
  scorePct: number;
};

/**
 * Aggregiert die Einzel-Ergebnisse einer Quiz-Lesson zur Auswertung.
 * `questionCount` kommt aus dem Lesson-Body (Anzahl <Question>), damit
 * „alle beantwortet" unabhängig davon stimmt, wie viele Ergebnisse bereits
 * eingetrudelt sind.
 */
export function summarizeQuiz(
  results: readonly { isCorrect: boolean }[],
  questionCount: number,
  passingScore: number,
): QuizSummary {
  const answered = results.length;
  const correct = results.filter((r) => r.isCorrect).length;
  const allAnswered = questionCount > 0 && answered >= questionCount;
  const score = answered === 0 ? 0 : correct / answered;
  const passed = score >= passingScore;
  return {
    answered,
    correct,
    allAnswered,
    score,
    passed,
    scorePct: Math.round(score * 100),
  };
}
