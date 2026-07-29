"use client";

import { ArrowRight, Check } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { QuizContext, type QuestionResult } from "./quiz-context";
import { submitQuizAttemptAction } from "@/app/(frontend)/learn/[courseSlug]/[sectionSlug]/[lessonSlug]/actions";
import { summarizeQuiz } from "@/lib/quiz/grade";
import styles from "./quiz-shell.module.css";

type Props = {
  courseSlug: string;
  sectionSlug: string;
  lessonSlug: string;
  passingScore: number;
  questionCount: number;
  nextHref: string | null;
  /** Kurs-Flag `confirmationRequired` — Checkbox nur auf der letzten Lektion. */
  confirmationRequired: boolean;
  /**
   * Nur bei Fragen-Pool-Praefungen gesetzt (ADR 0009, D2-ii-a): der Seed, mit
   * dem die auf DIESER Seite gerenderten Fragen gezogen wurden
   * (`selectPoolQuestions`). Wird beim Submit mitgeschickt, damit der Server
   * dieselbe Ziehung reproduzieren und server-seitig neu bewerten kann.
   */
  seed?: string;
  children: ReactNode;
};

export function QuizShell({
  courseSlug,
  sectionSlug,
  lessonSlug,
  passingScore,
  questionCount,
  nextHref,
  confirmationRequired,
  seed,
  children,
}: Props) {
  const [results, setResults] = useState<Map<string, QuestionResult>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Verständnisbestätigung greift nur auf der letzten Lektion des Kurses.
  const needsConfirmation = confirmationRequired && nextHref === null;

  const reportResult = useCallback((id: string, result: QuestionResult) => {
    setResults((prev) => {
      const next = new Map(prev);
      next.set(id, result);
      return next;
    });
  }, []);

  const ctxValue = useMemo(() => ({ reportResult }), [reportResult]);

  const { answered, correct, allAnswered, score, passed, scorePct } =
    summarizeQuiz([...results.values()], questionCount, passingScore);

  async function onSubmit() {
    setSubmitting(true);
    const payload = {
      answers: [...results.values()],
      score,
      passed,
      next: nextHref ?? "",
      courseSlug,
      sectionSlug,
      lessonSlug,
      confirmed,
      seed,
    };
    await submitQuizAttemptAction(payload);
    // Action navigiert weiter — kein setSubmitting(false) nötig
  }

  return (
    <QuizContext.Provider value={ctxValue}>
      {children}

      <section className={styles.summary} aria-live="polite">
        <div className={styles.kicker}>Auswertung</div>
        <div className={styles.headline}>
          {allAnswered ? (
            <>
              <strong>{correct}</strong> von <strong>{questionCount}</strong> richtig
              <span className={styles.pct}>· {scorePct}%</span>
            </>
          ) : (
            <>
              {answered} von {questionCount} beantwortet
            </>
          )}
        </div>
        {allAnswered && (
          <div className={`${styles.verdict} ${passed ? styles.passed : styles.failed}`}>
            {passed
              ? `Bestanden — Bestehensgrenze ${Math.round(passingScore * 100)}%`
              : `Nicht bestanden — Bestehensgrenze ${Math.round(passingScore * 100)}%`}
          </div>
        )}

        {needsConfirmation && (
          <label className={styles.confirmRow}>
            <input
              type="checkbox"
              className={styles.confirmCheckbox}
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Ich bestätige, den Inhalt verstanden zu haben.
          </label>
        )}

        <button
          type="button"
          className={`btn btn-primary ${styles.submit}`}
          onClick={onSubmit}
          disabled={!allAnswered || (needsConfirmation && !confirmed) || submitting}
        >
          {submitting ? (
            "…"
          ) : nextHref ? (
            <>
              Quiz abschicken &amp; weiter
              <ArrowRight size={14} strokeWidth={1.75} />
            </>
          ) : (
            <>
              <Check size={14} strokeWidth={1.75} />
              Quiz abschicken &amp; Kurs abschließen
            </>
          )}
        </button>
      </section>
    </QuizContext.Provider>
  );
}
