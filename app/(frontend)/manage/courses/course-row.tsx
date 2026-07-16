"use client";

import { useState, useTransition } from "react";

import type { ManagedCourse } from "@/lib/authoring/lifecycle";

import {
  deleteCourseAction,
  publishCourseAction,
  toggleTutorAction,
  unpublishCourseAction,
} from "./actions";
import styles from "./page.module.css";

type Props = {
  course: ManagedCourse;
};

export function CourseRow({ course }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onPublish() {
    setError(null);
    startTransition(async () => {
      const res = await publishCourseAction(course.id);
      if (!res.ok) setError(res.error);
    });
  }

  function onUnpublish() {
    setError(null);
    startTransition(async () => {
      const res = await unpublishCourseAction(course.id);
      if (!res.ok) setError(res.error);
    });
  }

  function onTutorToggle() {
    setError(null);
    startTransition(async () => {
      const res = await toggleTutorAction(course.id, !course.tutorEnabled);
      if (!res.ok) setError(res.error);
    });
  }

  function onDelete() {
    if (
      !window.confirm(
        `Kurs "${course.title}" samt allen Sections und Lessons unwiderruflich löschen?`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await deleteCourseAction(course.id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className={styles.courseRow}>
      <div className={styles.courseMain}>
        <div className={styles.courseIdentity}>
          <div className={styles.courseTitle}>{course.title}</div>
          <div className={styles.courseSlug}>{course.slug}</div>
        </div>
        <div className={styles.courseMeta}>
          {course.version && <>v{course.version}</>}
        </div>
      </div>

      <div className={styles.courseActions}>
        <span
          className={`${styles.statusBadge} ${
            course.status === "published"
              ? styles.statusPublished
              : styles.statusDraft
          }`}
        >
          {course.status === "published" ? "Live" : "Entwurf"}
        </span>

        {course.status === "draft" ? (
          <button
            type="button"
            className={styles.publishBtn}
            onClick={onPublish}
            disabled={pending}
          >
            Veröffentlichen
          </button>
        ) : (
          <button
            type="button"
            className={styles.unpublishBtn}
            onClick={onUnpublish}
            disabled={pending}
          >
            Offline nehmen
          </button>
        )}

        <label className={styles.tutorLabel}>
          <input
            type="checkbox"
            className={styles.tutorCheckbox}
            checked={course.tutorEnabled}
            onChange={onTutorToggle}
            disabled={pending}
            aria-label={`KI-Tutor für ${course.title}`}
          />
          KI-Tutor
        </label>

        <button
          type="button"
          className={styles.deleteBtn}
          onClick={onDelete}
          disabled={pending}
          title="Kurs unwiderruflich löschen"
        >
          Löschen
        </button>
      </div>

      {error && <div className={styles.rowError}>{error}</div>}
    </div>
  );
}
