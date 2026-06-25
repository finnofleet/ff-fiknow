import type { Metadata } from "next";
import { ArrowRight, Check, Circle, CircleCheck, CircleDot } from "lucide-react";
import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LessonCompanion } from "@/components/tutor/lesson-companion";
import { mdxComponents } from "@/components/mdx";
import { hardenedMdxOptions } from "@/lib/mdx/options";
import { QuizShell } from "@/components/quiz/quiz-shell";
import { BrandSignature } from "@/components/brand-signature";
import { BrandWordmark } from "@/components/brand-wordmark";
import { brand } from "@/lib/brand";
import { getCourse, getLesson } from "@/lib/content";
import { getCurrentUser, viewerCanSeeDrafts } from "@/lib/auth/session";
import { truncateDescription } from "@/lib/seo";
import {
  getCourseProgress,
  markLessonInProgress,
  progressKey,
} from "@/lib/progress";

import { completeAndContinueAction } from "./actions";
import styles from "./page.module.css";

type RouteParams = Promise<{
  courseSlug: string;
  sectionSlug: string;
  lessonSlug: string;
}>;

export async function generateStaticParams() {
  // Lesson-Seiten sind user-spezifisch (Progress) — Static-Params disabled.
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: RouteParams;
}): Promise<Metadata> {
  const { courseSlug, sectionSlug, lessonSlug } = await params;
  const includeDrafts = await viewerCanSeeDrafts();
  const lesson = await getLesson(courseSlug, sectionSlug, lessonSlug, {
    includeDrafts,
  });
  const course = lesson?.course ?? (await getCourse(courseSlug, { includeDrafts }));

  const lessonTitle = lesson?.frontmatter.title ?? "Lektion";
  const courseTitle = course?.frontmatter.title;

  // Titel: "Lektions-Titel — Kurs-Titel" — ignoriert das layout.tsx-Template
  // (title.absolute), damit kein dreifaches Anhängen entsteht.
  const fullTitle = courseTitle
    ? `${lessonTitle} — ${courseTitle}`
    : lessonTitle;

  // Beschreibung: summary-Feld bevorzugt (optional im Schema), sonst Generisch.
  // Kein Body-Truncate — Body ist MDX-Markup, kein Plaintext.
  const rawDescription =
    lesson?.frontmatter.summary ??
    `${lessonTitle} — Lektion in ${brand.name}.`;
  const description = truncateDescription(rawDescription);

  return {
    // absolute: ignoriert title.template aus dem Layout (kein "… | Brand" anhängen,
    // da der Brand-Name schon im Kurs-Titel steckt).
    title: { absolute: fullTitle },
    description,
    alternates: {
      canonical: `/learn/${courseSlug}/${sectionSlug}/${lessonSlug}`,
    },
    // Lektionen sind login-pflichtig: keine Indexierung durch Search-Engines.
    robots: {
      index: false,
      follow: false,
    },
  };
}

export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: RouteParams }) {
  const { courseSlug, sectionSlug, lessonSlug } = await params;
  // Kuratoren/Admins dürfen Draft-Lektionen im echten Shell ansehen.
  const includeDrafts = await viewerCanSeeDrafts();
  const lesson = await getLesson(courseSlug, sectionSlug, lessonSlug, {
    includeDrafts,
  });
  if (!lesson) notFound();

  const course = await getCourse(courseSlug, { includeDrafts });
  if (!course) notFound();

  const isDraft = course.frontmatter.status === "draft";

  const user = await getCurrentUser();

  const progress = user ? await getCourseProgress(user.id, courseSlug) : new Map();

  // Draft-Vorschau zählt NICHT als Lernfortschritt (Vorschau ≠ Lernen) — sonst
  // tauchten unveröffentlichte Kurse im Dashboard/Progress des Kurators auf.
  if (user && !isDraft) {
    await markLessonInProgress({
      userId: user.id,
      courseSlug,
      sectionSlug,
      lessonSlug,
    });
    progress.set(progressKey(sectionSlug, lessonSlug), "in_progress");
  }

  const flat = course.sections.flatMap((s) => s.lessons.map((l) => ({ s, l })));
  const completedCount = flat.filter(
    ({ s, l }) => progress.get(progressKey(s.slug, l.slug)) === "completed",
  ).length;
  const progressPct = Math.round((completedCount / flat.length) * 100);

  const nextHref = lesson.next
    ? `/learn/${lesson.next.courseSlug}/${lesson.next.sectionSlug}/${lesson.next.lessonSlug}`
    : null;

  const isQuiz = lesson.frontmatter.type === "quiz";
  const questionCount = isQuiz
    ? (lesson.body.match(/<Question[\s>]/g) ?? []).length
    : 0;
  const passingScore = lesson.frontmatter.passing_score ?? 0.7;

  return (
    <div className={styles.shell}>
      <nav className={styles.topNav}>
        <Link href="/dashboard" className={styles.brand}>
          <BrandSignature
            markClassName={styles.mark}
            nameClassName={styles.name}
            tldClassName={styles.tld}
          />
        </Link>
        <div className={styles.crumb}>
          <Link href={`/courses/${courseSlug}`}>{course.frontmatter.title}</Link>
          <span className={styles.crumbSep}>·</span>
          <span>{lesson.section.frontmatter.title}</span>
          <span className={styles.crumbSep}>·</span>
          <span className={styles.crumbCurrent}>{lesson.frontmatter.title}</span>
        </div>
        <div className={styles.topMeta}>
          {completedCount} / {flat.length}
        </div>
        <div className={styles.topProgress} aria-hidden>
          <span style={{ width: `${progressPct}%` }} />
        </div>
      </nav>

      {isDraft && (
        <div className={styles.draftStrip}>
          <strong>Entwurf</strong> — Vorschau, noch nicht veröffentlicht. Nur für
          Kuratoren sichtbar.
        </div>
      )}

      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Kurs-Curriculum">
          <div className={styles.courseHead}>
            <div className={styles.courseKicker}>{course.frontmatter.category ?? "Kurs"}</div>
            <div className={styles.courseTitle}>{course.frontmatter.title}</div>
            <div className={styles.courseProgress}>
              <span className={styles.pb}>
                <span style={{ width: `${progressPct}%` }} />
              </span>
              <span>
                {completedCount} / {flat.length}
              </span>
            </div>
          </div>

          {course.sections.map((s) => (
            <div key={s.slug} className={styles.chap}>
              <h5>
                <span>{s.frontmatter.title}</span>
                <span>{s.lessons.length}</span>
              </h5>
              <ul>
                {s.lessons.map((l) => {
                  const isCurrent = s.slug === sectionSlug && l.slug === lessonSlug;
                  const status = progress.get(progressKey(s.slug, l.slug));
                  const isDone = status === "completed";
                  const isStarted = status === "in_progress";
                  // Status-Icon statt handgezeichnetem CSS-Dot: lucide-SVGs sind
                  // konstruktionsbedingt zentriert + crisp bei jedem Zoom/DPI.
                  const StatusIcon = isDone
                    ? CircleCheck
                    : isCurrent || isStarted
                      ? CircleDot
                      : Circle;
                  return (
                    <li key={l.slug}>
                      <Link
                        href={`/learn/${courseSlug}/${s.slug}/${l.slug}`}
                        className={[
                          isCurrent ? styles.cur : "",
                          isDone ? styles.done : "",
                          isStarted && !isCurrent ? styles.started : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <StatusIcon
                          size={14}
                          strokeWidth={2}
                          className={styles.lessonIcon}
                          aria-hidden
                        />
                        <span>{l.frontmatter.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        <article className={styles.read}>
          <div className={styles.eyebrow}>
            {lesson.section.frontmatter.title} ·{" "}
            {lesson.frontmatter.type === "quiz"
              ? "Quiz"
              : lesson.frontmatter.type === "video"
                ? "Video"
                : "Lesen"}
          </div>
          {isQuiz ? (
            <QuizShell
              courseSlug={courseSlug}
              sectionSlug={sectionSlug}
              lessonSlug={lessonSlug}
              questionCount={questionCount}
              passingScore={passingScore}
              nextHref={nextHref}
            >
              <div className={styles.prose} data-tutor-prose>
                <MDXRemote
                  source={lesson.body}
                  components={mdxComponents}
                  options={{ mdxOptions: hardenedMdxOptions }}
                />
              </div>
            </QuizShell>
          ) : (
            <div className={styles.prose} data-tutor-prose>
              <MDXRemote
                source={lesson.body}
                components={mdxComponents}
                options={{ mdxOptions: hardenedMdxOptions }}
              />
            </div>
          )}

          <nav className={styles.bottomNav} aria-label="Weiter / Zurück">
            {lesson.prev ? (
              <Link
                className={styles.bottomLink}
                href={`/learn/${lesson.prev.courseSlug}/${lesson.prev.sectionSlug}/${lesson.prev.lessonSlug}`}
              >
                <div className={styles.bottomKicker}>← Vorherige</div>
                <div className={styles.bottomTitle}>{lesson.prev.title}</div>
              </Link>
            ) : (
              <span />
            )}

            {!isQuiz && (
              <form action={completeAndContinueAction} className={styles.completeForm}>
                <input type="hidden" name="course_slug" value={courseSlug} />
                <input type="hidden" name="section_slug" value={sectionSlug} />
                <input type="hidden" name="lesson_slug" value={lessonSlug} />
                <input type="hidden" name="next" value={nextHref ?? ""} />
                <button
                  type="submit"
                  className={`btn btn-primary ${styles.completeBtn}`}
                  disabled={!user}
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
            )}
          </nav>

          <footer className={styles.lessonFoot}>
            <span>
              <BrandWordmark tldClassName={styles.tld} />
            </span>
            {brand.tagline && (
              <>
                <span className={styles.lessonFootSep}>·</span>
                <span>{brand.tagline}</span>
              </>
            )}
          </footer>
        </article>

        <LessonCompanion
          courseSlug={courseSlug}
          sectionSlug={sectionSlug}
          lessonSlug={lessonSlug}
          bundleVersion={course.frontmatter.version ?? null}
          tutorEnabled={Boolean(course.frontmatter.tutor_enabled)}
        />
      </div>
    </div>
  );
}
