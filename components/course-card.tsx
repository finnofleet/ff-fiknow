import Link from "next/link";
import type { Course } from "@/lib/content";
import styles from "./course-card.module.css";

const DIFFICULTY_LABEL: Record<string, string> = {
  einsteiger: "Einsteiger",
  mittel: "Mittel",
  fortgeschritten: "Fortgeschritten",
};

export function CourseCard({ course }: { course: Course }) {
  const lessonCount = course.sections.reduce(
    (sum, s) => sum + s.lessons.length,
    0,
  );
  const minutes = course.frontmatter.estimated_minutes;
  const hours = minutes ? Math.round((minutes / 60) * 10) / 10 : null;

  return (
    <Link href={`/courses/${course.slug}`} className={styles.card}>
      <div className={styles.cover} aria-hidden>
        {course.frontmatter.status === "draft" && (
          <span className={styles.draftBadge}>Entwurf</span>
        )}
        {course.frontmatter.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.frontmatter.coverImageUrl} alt="" className={styles.coverImg} />
        ) : (
          <>
            <span className={styles.coverKicker}>{course.frontmatter.category ?? "Kurs"}</span>
            <span className={styles.coverTitle}>{course.frontmatter.title.split(" ").slice(0, 2).join(" ")}</span>
          </>
        )}
      </div>
      <div className={styles.body}>
        <h3 className={styles.title}>{course.frontmatter.title}</h3>
        <p className={styles.sub}>
          {course.frontmatter.description ?? course.frontmatter.subtitle ?? ""}
        </p>
      </div>
      <div className={styles.foot}>
        <div className={styles.chips}>
          {hours !== null && <span className="chip">{hours} h</span>}
          {course.frontmatter.difficulty && (
            <span className="chip">
              {DIFFICULTY_LABEL[course.frontmatter.difficulty] ?? course.frontmatter.difficulty}
            </span>
          )}
        </div>
        <span className={styles.lessonCount}>
          {lessonCount} Lekt.
        </span>
      </div>
    </Link>
  );
}
