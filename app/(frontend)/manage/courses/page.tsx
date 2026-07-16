import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { listManagedCourses } from "@/lib/authoring/lifecycle";

import { CourseRow } from "./course-row";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Kurse verwalten",
  robots: { index: false, follow: false },
};

export default async function ManageCoursesPage() {
  // Auth ist im /manage/layout.tsx geprüft — hier nur die Kursliste laden.
  const courses = await listManagedCourses();

  return (
    <>
      <Link href="/manage" className={styles.backLink}>
        <ArrowLeft size={14} /> Verwaltung
      </Link>

      <header className={styles.hero}>
        <div className={styles.kicker}>Verwaltung</div>
        <h1 className={styles.title}>Kurse</h1>
        <p className={styles.lede}>
          Kurse veröffentlichen, offline nehmen, löschen und den KI-Tutor
          pro Kurs freischalten.
        </p>
      </header>

      <section className={styles.section}>
        <h2>Alle Kurse ({courses.length})</h2>
        <div className={styles.courseList}>
          {courses.length === 0 ? (
            <div className={styles.empty}>
              Noch keine Kurse importiert.{" "}
              <Link href="/manage/import" className={styles.emptyLink}>
                Jetzt importieren →
              </Link>
            </div>
          ) : (
            courses.map((course) => (
              <CourseRow key={course.id} course={course} />
            ))
          )}
        </div>
      </section>

      <Link href="/manage" className={styles.backLink}>
        <ArrowLeft size={14} /> Zurück zur Übersicht
      </Link>
    </>
  );
}
