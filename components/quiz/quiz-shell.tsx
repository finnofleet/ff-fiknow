"use client";

import { ArrowRight, Check } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { QuizContext, type QuestionResult } from "./quiz-context";
import { submitQuizAttemptAction } from "@/app/(frontend)/learn/[courseSlug]/[sectionSlug]/[lessonSlug]/actions";
import styles from "./quiz-shell.module.css";

type Props = {
  courseSlug: string;
  sectionSlug: string;
  lessonSlug: string;
  passingScore: number;
  questionCount: number;
  nextHref: string | null;
  children: ReactNode;
};

export function QuizShell({
  courseSlug,
  sectionSlug,
  lessonSlug,
  passingScore,
  questionCount,
  nextHref,
  children,
}: Props) {
  const [results, setResults] = useState<Map<string, QuestionResult>>(new Map());
  const [submitting, setSubmitting] = useState(false);

  const reportResult = useCallback((id: string, result: QuestionResult) => {
    setResults((prev) => {
      const next = new Map(prev);
      next.set(id, result);
      return next;
    });
  }, []);

  const ctxValue = useMemo(() => ({ reportResult }), [reportResult]);

  const answered = results.size;
  const correct = [...results.values()].filter((r) => r.isCorrect).length;
  const allAnswered = answered >= questionCount;
  const score = answered === 0 ? 0 : correct / answered;
  const passed = score >= passingScore;
  const scorePct = Math.round(score * 100);

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

        <button
          type="button"
          className={`btn btn-primary ${styles.submit}`}
          onClick={onSubmit}
          disabled={!allAnswered || submitting}
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
