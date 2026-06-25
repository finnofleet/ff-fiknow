import type { Metadata } from "next";
import { ArrowRight, BookOpen, Clock, Layers, ListChecks, PlayCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TopNav } from "@/components/top-nav";
import { brand } from "@/lib/brand";
import { getCourse } from "@/lib/content";
import { getCurrentUser, viewerCanSeeDrafts } from "@/lib/auth/session";
import { truncateDescription } from "@/lib/seo";
import { db } from "@/lib/db/client";
import { enrollments } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

import { enrollAction } from "./actions";
import styles from "./page.module.css";

type RouteParams = Promise<{ slug: string }>;

const TYPE_ICON = {
  reading: BookOpen,
  video: PlayCircle,
  quiz: ListChecks,
} as const;

const DIFFICULTY_LABEL: Record<string, string> = {
  einsteiger: "Einsteiger",
  mittel: "Mittel",
  fortgeschritten: "Fortgeschritten",
};

export async function generateMetadata({
  params,
}: {
  params: RouteParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const includeDrafts = await viewerCanSeeDrafts();
  const course = await getCourse(slug, { includeDrafts });

  if (!course) {
    // Kurs nicht gefunden — minimale Fallback-Metadata, notFound() greift in der Page
    return { title: "Kurs nicht gefunden" };
  }

  // Draft-Kurse nie indexieren (nur für Kuratoren sichtbar).
  if (course.frontmatter.status === "draft") {
    return { title: course.frontmatter.title, robots: { index: false, follow: false } };
  }

  const title = course.frontmatter.title;

  // Beschreibung: eigene description bevorzugt, sonst subtitle, sonst Generisch.
  const rawDescription =
    course.frontmatter.description ??
    course.frontmatter.subtitle ??
    `${title} auf ${brand.name} — Lektion für Lektion zum Ziel.`;
  const description = truncateDescription(rawDescription);

  return {
    // title als String: wird via template in layout.tsx zu "<Titel> | <Brand>" expandiert
    title,
    description,
    alternates: {
      canonical: `/courses/${slug}`,
    },
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

export default async function CourseDetailPage({
  params,
}: {
  params: RouteParams;
}) {
  const { slug } = await params;
  const includeDrafts = await viewerCanSeeDrafts();
  const course = await getCourse(slug, { includeDrafts });
  if (!course) notFound();

  const isDraft = course.frontmatter.status === "draft";

  const user = await getCurrentUser();

  let isEnrolled = false;
  if (user) {
    const rows = await db
      .select()
      .from(enrollments)
      .where(
        and(eq(enrollments.userId, user.id), eq(enrollments.courseSlug, slug)),
      );
    isEnrolled = rows.length > 0;
  }

  const lessonCount = course.sections.reduce(
    (sum, s) => sum + s.lessons.length,
    0,
  );
  const minutes = course.frontmatter.estimated_minutes;
  const hours = minutes ? Math.round((minutes / 60) * 10) / 10 : null;
  const firstSection = course.sections.find((s) => s.lessons.length > 0);
  const firstLesson = firstSection?.lessons[0];
  const continueHref =
    firstSection && firstLesson
      ? `/learn/${course.slug}/${firstSection.slug}/${firstLesson.slug}`
      : null;

  return (
    <>
      <TopNav active="katalog" />

      {isDraft && (
        <div className={styles.draftBanner}>
          <strong>Entwurf</strong> — nur für Kuratoren sichtbar, noch nicht
          veröffentlicht. So sieht der Kurs für Lernende nach dem Publish aus.
        </div>
      )}

      {course.frontmatter.coverImageUrl && (
        <div className={styles.coverHero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={course.frontmatter.coverImageUrl}
            alt={course.frontmatter.cover_alt ?? ""}
            className={styles.coverHeroImg}
          />
        </div>
      )}

      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.kicker}>{course.frontmatter.category ?? "Kurs"}</div>
          <h1 className={styles.title}>{course.frontmatter.title}</h1>
          {course.frontmatter.subtitle && (
            <p className={styles.subtitle}>{course.frontmatter.subtitle}</p>
          )}
          <div className={styles.metaRow}>
            <span className={styles.metaItem}>
              <Layers size={14} strokeWidth={1.5} />
              {course.sections.length} Sections
            </span>
            <span className={styles.metaItem}>
              <BookOpen size={14} strokeWidth={1.5} />
              {lessonCount} Lektionen
            </span>
            {hours !== null && (
              <span className={styles.metaItem}>
                <Clock size={14} strokeWidth={1.5} />
                ≈ {hours} h
              </span>
            )}
            {course.frontmatter.difficulty && (
              <span className={styles.metaItem}>
                {DIFFICULTY_LABEL[course.frontmatter.difficulty] ?? course.frontmatter.difficulty}
              </span>
            )}
          </div>

          {course.body && <div className={styles.lede}>{course.body.split("\n\n").slice(0, 2).join("\n\n")}</div>}

          {course.frontmatter.prerequisites && (
            <div className={styles.prerequisites}>
              <div className={styles.prerequisitesLabel}>Voraussetzungen</div>
              <p>{course.frontmatter.prerequisites}</p>
            </div>
          )}

          <div className={styles.actions}>
            {isEnrolled && continueHref ? (
              <Link href={continueHref} className="btn btn-primary">
                Weiterlernen <ArrowRight size={14} strokeWidth={1.75} />
              </Link>
            ) : user ? (
              <form action={enrollAction}>
                <input type="hidden" name="course_slug" value={course.slug} />
                <button type="submit" className="btn btn-primary">
                  Einschreiben <ArrowRight size={14} strokeWidth={1.75} />
                </button>
              </form>
            ) : (
              <Link
                href={`/login?redirect=/courses/${course.slug}`}
                className="btn btn-primary"
              >
                Anmelden zum Einschreiben <ArrowRight size={14} strokeWidth={1.75} />
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className={styles.curriculum}>
        <div className={styles.curriculumInner}>
          <div className={styles.sectionHd}>
            <h2>Curriculum</h2>
            <span className={styles.sectionMeta}>
              {course.sections.length} Sections · {lessonCount} Lektionen
            </span>
          </div>

          <ol className={styles.sectionList}>
            {course.sections.map((section) => (
              <li key={section.slug} className={styles.sectionItem}>
                <header className={styles.sectionHead}>
                  <div className={styles.sectionNum}>
                    {String(section.order).padStart(2, "0")}
                  </div>
                  <div>
                    <h3 className={styles.sectionTitle}>
                      {section.frontmatter.title}
                    </h3>
                    {section.frontmatter.description && (
                      <p className={styles.sectionDesc}>
                        {section.frontmatter.description}
                      </p>
                    )}
                  </div>
                  <span className={styles.sectionLessonCount}>
                    {section.lessons.length} {section.lessons.length === 1 ? "Lektion" : "Lektionen"}
                  </span>
                </header>

                {section.lessons.length > 0 && (
                  <ul className={styles.lessonList}>
                    {section.lessons.map((lesson) => {
                      const IconComp = TYPE_ICON[lesson.frontmatter.type] ?? BookOpen;
                      return (
                        <li key={lesson.slug}>
                          <Link
                            href={`/learn/${course.slug}/${section.slug}/${lesson.slug}`}
                            className={styles.lessonLink}
                          >
                            <IconComp size={14} strokeWidth={1.5} className={styles.lessonIcon} />
                            <span className={styles.lessonTitle}>
                              {lesson.frontmatter.title}
                            </span>
                            <span className={styles.lessonMeta}>
                              {lesson.frontmatter.estimated_minutes
                                ? `${lesson.frontmatter.estimated_minutes} Min`
                                : ""}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
