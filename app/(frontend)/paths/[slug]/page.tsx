import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TopNav } from "@/components/top-nav";
import { getCurrentUser, viewerCanSeeDrafts } from "@/lib/auth/session";
import { getPath, type PathRole } from "@/lib/paths";
import { getPathProgress, type PathProgress } from "@/lib/paths-progress";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<PathRole, string> = {
  required: "Kern",
  recommended: "Empfohlen",
  optional: "Optional",
};

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const path = await getPath(slug, { includeDrafts: await viewerCanSeeDrafts() });
  if (!path) return { title: "Lernpfad nicht gefunden" };
  return {
    title: path.title,
    description: path.description ?? path.subtitle,
    alternates: { canonical: `/paths/${path.slug}` },
  };
}

export default async function PathDetailPage({ params }: Props) {
  const { slug } = await params;
  const path = await getPath(slug, { includeDrafts: await viewerCanSeeDrafts() });
  if (!path) notFound();

  const user = await getCurrentUser();
  const progress: PathProgress | null = user
    ? await getPathProgress(user.id, path)
    : null;

  // Pro-Kurs-Statistik per Slug nachschlagen (nur auflösbare Kurse haben Stats).
  const statBySlug = new Map(
    (progress?.perCourse ?? []).map((c) => [c.courseSlug, c]),
  );

  const isLoose = path.fuehrungsgrad === "lose";

  return (
    <>
      <TopNav active="pfade" />

      <header className={styles.head}>
        <Link href="/paths" className={styles.back}>
          ← Alle Lernpfade
        </Link>
        <span className={styles.badge}>{isLoose ? "Empfohlen" : "Geführt"}</span>
        {path.status === "draft" && (
          <span className={styles.draftBadge}>Entwurf — noch nicht veröffentlicht</span>
        )}
        <h1>{path.title}</h1>
        {path.subtitle && <p className={styles.sub}>{path.subtitle}</p>}
        {path.description && <p className={styles.desc}>{path.description}</p>}

        {progress && progress.coursesTotal > 0 && (
          <div className={styles.progress}>
            <div className={styles.progressMeta}>
              {progress.coursesDone} von {progress.coursesTotal} Kursen
              abgeschlossen
            </div>
            <div className={styles.progressBar}>
              <span style={{ width: `${progress.pct}%` }} />
            </div>
            {progress.nextCourseSlug && (
              <Link
                href={`/courses/${progress.nextCourseSlug}`}
                className="btn btn-primary"
              >
                Weiterlernen →
              </Link>
            )}
          </div>
        )}
      </header>

      <main className={styles.wrap}>
        <p className={styles.hint}>
          {isLoose
            ? "Lose Reihe — die Reihenfolge ist eine Empfehlung, du kannst frei wählen."
            : "Geführte Reihe — am besten der Reihe nach durcharbeiten."}
        </p>

        <ol className={styles.courseList}>
          {path.courses.map((member, i) => {
            const stat = statBySlug.get(member.courseSlug);
            const resolved = member.course;
            return (
              <li key={`${member.courseSlug}-${i}`} className={styles.courseItem}>
                <span className={styles.num}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {resolved ? (
                  <Link
                    href={`/courses/${member.courseSlug}`}
                    className={styles.courseRow}
                  >
                    <span className={styles.rowText}>
                      <span className={styles.rowTop}>
                        <span
                          className={styles.roleBadge}
                          data-role={member.role}
                        >
                          {ROLE_LABEL[member.role]}
                        </span>
                        {resolved.frontmatter.category && (
                          <span className={styles.cat}>
                            {resolved.frontmatter.category}
                          </span>
                        )}
                      </span>
                      <span className={styles.rowTitle}>
                        {resolved.frontmatter.title}
                      </span>
                      {stat && (
                        <span className={styles.rowSub}>
                          {stat.completedLessons} / {stat.totalLessons} Lektionen
                          {stat.done && stat.totalLessons > 0
                            ? " · ✓ abgeschlossen"
                            : stat.started
                              ? " · in Arbeit"
                              : ""}
                        </span>
                      )}
                    </span>
                    {stat && (
                      <span className={styles.rowProgress}>
                        <span className={styles.rowPb}>
                          <span
                            style={{
                              width: `${
                                stat.totalLessons === 0
                                  ? 0
                                  : Math.round(
                                      (stat.completedLessons /
                                        stat.totalLessons) *
                                        100,
                                    )
                              }%`,
                            }}
                          />
                        </span>
                      </span>
                    )}
                    <span className={styles.arrow}>→</span>
                  </Link>
                ) : (
                  <span className={`${styles.courseRow} ${styles.unavailable}`}>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>
                        {member.courseSlug}
                      </span>
                      <span className={styles.rowSub}>
                        Zurzeit nicht verfügbar
                      </span>
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </main>
    </>
  );
}
