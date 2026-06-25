import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TopNav } from "@/components/top-nav";
import { getCurrentUser } from "@/lib/auth/session";
import { listCourses } from "@/lib/content";
import { getPath, listPaths } from "@/lib/paths";
import { getPathProgress } from "@/lib/paths-progress";
import { getCourseProgress, progressKey } from "@/lib/progress";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Dashboard",
  // Login-pflichtige Page — keine Indexierung
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  const displayName =
    user.displayName ?? user.email?.split("@")[0] ?? "Du";

  const courses = await listCourses();
  const today = new Date().toLocaleDateString("de-CH", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Progress je Kurs einsammeln
  const courseStats = await Promise.all(
    courses.map(async (course) => {
      const progress = await getCourseProgress(user.id, course.slug);
      const flat = course.sections.flatMap((s) =>
        s.lessons.map((l) => ({ s, l })),
      );
      const completed = flat.filter(
        ({ s, l }) => progress.get(progressKey(s.slug, l.slug)) === "completed",
      ).length;
      const inProgress = flat.filter(
        ({ s, l }) => progress.get(progressKey(s.slug, l.slug)) === "in_progress",
      ).length;
      const nextItem =
        flat.find(({ s, l }) => progress.get(progressKey(s.slug, l.slug)) !== "completed") ??
        flat[0];
      const continueHref = nextItem
        ? `/learn/${course.slug}/${nextItem.s.slug}/${nextItem.l.slug}`
        : `/courses/${course.slug}`;
      const continueTitle = nextItem?.l.frontmatter.title;
      return {
        course,
        flatTotal: flat.length,
        completed,
        inProgress,
        continueHref,
        continueTitle,
        pct: flat.length === 0 ? 0 : Math.round((completed / flat.length) * 100),
      };
    }),
  );

  const startedCourses = courseStats.filter((c) => c.completed > 0 || c.inProgress > 0);
  const continueCourse =
    startedCourses.find((c) => c.completed < c.flatTotal) ?? courseStats[0];

  // Lernpfade + abgeleiteter Pfad-Fortschritt (Coursera-Muster: X/Y Kurse).
  const pathSummaries = await listPaths();
  const pathStats = await Promise.all(
    pathSummaries.map(async (summary) => {
      const full = await getPath(summary.slug);
      const prog = full ? await getPathProgress(user.id, full) : null;
      return { summary, prog };
    }),
  );

  return (
    <div className={styles.shell}>
      <TopNav active="lernen" />

      <main className={styles.wrap}>
        <header className={styles.greet}>
          <div>
            <div className={styles.kicker}>{today}</div>
            <h1>
              Guten Tag,
              <br />
              <em>{displayName}</em>.
            </h1>
          </div>
        </header>

        {continueCourse && continueCourse.continueTitle && (
          <section className={styles.continue}>
            <div className={styles.continueKicker}>Weiterlernen</div>
            <h2 className={styles.continueTitle}>{continueCourse.continueTitle}</h2>
            <div className={styles.continueMeta}>
              {continueCourse.course.frontmatter.title} · {continueCourse.completed} von{" "}
              {continueCourse.flatTotal} Lektionen erledigt
            </div>
            <div className={styles.progressBar}>
              <span style={{ width: `${continueCourse.pct}%` }} />
            </div>
            <Link href={continueCourse.continueHref} className="btn btn-primary">
              Weiterlernen →
            </Link>
          </section>
        )}

        {pathStats.length > 0 && (
          <section>
            <div className={styles.sectionHd}>
              <h3>Deine Lernpfade</h3>
              <span className={styles.sectionMeta}>
                {pathStats.length} {pathStats.length === 1 ? "Pfad" : "Pfade"}
              </span>
            </div>
            <ul className={styles.courseList}>
              {pathStats.map(({ summary, prog }, i) => (
                <li key={summary.slug}>
                  <Link href={`/paths/${summary.slug}`} className={styles.courseRow}>
                    <span className={styles.rowNum}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.rowCat}>
                        {summary.fuehrungsgrad === "linear" ? "Geführt" : "Empfohlen"}
                      </span>
                      <span className={styles.rowTitle}>{summary.title}</span>
                      <span className={styles.rowSub}>
                        {prog
                          ? `${prog.coursesDone} / ${prog.coursesTotal} Kurse${
                              prog.coursesTotal > 0 &&
                              prog.coursesDone === prog.coursesTotal
                                ? " · ✓ abgeschlossen"
                                : ""
                            }`
                          : `${summary.courseCount} Kurse`}
                      </span>
                    </span>
                    <span className={styles.rowProgress}>
                      <span className={styles.rowPb}>
                        <span style={{ width: `${prog?.pct ?? 0}%` }} />
                      </span>
                      <span className={styles.rowPct}>{prog?.pct ?? 0}%</span>
                    </span>
                    <span className={styles.rowArrow}>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <div className={styles.sectionHd}>
            <h3>Meine Kurse</h3>
            <span className={styles.sectionMeta}>
              {courses.length} {courses.length === 1 ? "Kurs" : "Kurse"} verfügbar
            </span>
          </div>

          {courseStats.length === 0 ? (
            <p className={styles.empty}>Noch keine Kurse synchronisiert.</p>
          ) : (
            <ul className={styles.courseList}>
              {courseStats.map((stat, i) => (
                <li key={stat.course.slug}>
                  <Link href={stat.continueHref} className={styles.courseRow}>
                    <span className={styles.rowNum}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.rowCat}>
                        {stat.course.frontmatter.category ?? "—"}
                      </span>
                      <span className={styles.rowTitle}>{stat.course.frontmatter.title}</span>
                      <span className={styles.rowSub}>
                        {stat.completed} / {stat.flatTotal} Lektionen
                        {stat.completed === stat.flatTotal && stat.flatTotal > 0
                          ? " · ✓ abgeschlossen"
                          : stat.continueTitle
                            ? ` · weiter: ${stat.continueTitle}`
                            : ""}
                      </span>
                    </span>
                    <span className={styles.rowProgress}>
                      <span className={styles.rowPb}>
                        <span style={{ width: `${stat.pct}%` }} />
                      </span>
                      <span className={styles.rowPct}>{stat.pct}%</span>
                    </span>
                    <span className={styles.rowArrow}>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
