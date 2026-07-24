"use client";

import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";

import { completeAndContinueAction } from "./actions";
import styles from "./page.module.css";

type Props = {
  courseSlug: string;
  sectionSlug: string;
  lessonSlug: string;
  nextHref: string | null;
  /** Kurs-Flag `confirmationRequired` — Checkbox nur auf der letzten Lektion. */
  confirmationRequired: boolean;
  hasUser: boolean;
};

/**
 * Abschluss-Formular der letzten/mittleren Lektion (nicht Quiz). Client-
 * Komponente statt reinem Server-Form, weil die Verständnisbestätigung
 * (Phase 6c) den Submit-Button erst nach Anhaken aktivieren muss.
 */
export function CompleteForm({
  courseSlug,
  sectionSlug,
  lessonSlug,
  nextHref,
  confirmationRequired,
  hasUser,
}: Props) {
  const [confirmed, setConfirmed] = useState(false);

  // Verständnisbestätigung greift nur auf der letzten Lektion des Kurses.
  const needsConfirmation = confirmationRequired && nextHref === null;
  const canSubmit = hasUser && (!needsConfirmation || confirmed);

  return (
    <form action={completeAndContinueAction} className={styles.completeForm}>
      <input type="hidden" name="course_slug" value={courseSlug} />
      <input type="hidden" name="section_slug" value={sectionSlug} />
      <input type="hidden" name="lesson_slug" value={lessonSlug} />
      <input type="hidden" name="next" value={nextHref ?? ""} />

      {needsConfirmation && (
        <label className={styles.confirmRow}>
          <input
            type="checkbox"
            className={styles.confirmCheckbox}
            name="confirmed"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Ich bestätige, den Inhalt verstanden zu haben.
        </label>
      )}

      <button
        type="submit"
        className={`btn btn-primary ${styles.completeBtn}`}
        disabled={!canSubmit}
      >
        {nextHref ? (
          <>
            Erledigt &amp; weiter
            <ArrowRight size={14} strokeWidth={1.75} />
          </>
        ) : (
          <>
            <Check size={14} strokeWidth={1.75} />
            Kurs abschließen
          </>
        )}
      </button>
    </form>
  );
}
