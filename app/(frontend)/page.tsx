import Link from "next/link";
import { BrandSignature } from "@/components/brand-signature";
import { TopNav } from "@/components/top-nav";
import { brand, brandConfig, brandFullName } from "@/lib/brand";
import {
  type CourseSummary,
  listCourseSummaries,
} from "@/lib/content";
import styles from "./page.module.css";

type SearchParams = Promise<{ signedout?: string }>;

const DIFFICULTY_LABEL: Record<
  NonNullable<CourseSummary["frontmatter"]["difficulty"]>,
  string
> = {
  einsteiger: "Einsteiger",
  mittel: "Mittel",
  fortgeschritten: "Fortgeschritten",
};

/**
 * Zufallsauswahl von bis zu `count` Elementen aus `arr` (Fisher-Yates).
 * Per Request neu — Wiederbesuch zeigt andere Kurse, das ist gewollt für
 * eine „wo du anfangen kannst"-Sektion.
 */
function pickRandom<T>(arr: readonly T[], count: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function tileDescription(fm: CourseSummary["frontmatter"]): string {
  if (fm.subtitle) return fm.subtitle;
  const desc = fm.description?.trim();
  if (!desc) return "";
  if (desc.length <= 120) return desc;
  return `${desc.slice(0, 117).trimEnd()}…`;
}

function tileLabel(fm: CourseSummary["frontmatter"]): string {
  if (fm.difficulty) return DIFFICULTY_LABEL[fm.difficulty];
  if (fm.category) return fm.category;
  return "Zum Kurs";
}

/**
 * Plattform-Roadmap — was wir hinter den heute verfügbaren Inhalten
 * für die kommenden Monate planen. Bewusst auf der öffentlichen Landing
 * (kein Login nötig), damit Interessenten die Richtung sehen.
 *
 * Statusfarben:
 *   in-arbeit  → wird gerade gebaut
 *   geplant    → nächstes Quartal angesetzt
 *   später     → auf der Wunschliste, kein Datum
 *
 * WICHTIG — Pflege beim Ausliefern: Diese Liste zeigt NUR noch Offenes.
 * Geht ein Feature live, wird es hier ENTFERNT (nicht auf „fertig" gesetzt —
 * es gibt bewusst keinen Done-Status) und in `docs/ROADMAP.md` (intern)
 * abgehakt. Beides nachführen, sonst steht hier Ausgeliefertes als „geplant".
 */
const roadmap: { status: "in-arbeit" | "geplant" | "später"; title: string; desc: string }[] = [
  {
    status: "geplant",
    title: "Lernpfade",
    desc: "Mehrere Kurse zu Reihen bündeln, mit eigenem Fortschrittstracking — der Mehrwert, den die meisten MOOCs auslassen.",
  },
  {
    status: "geplant",
    title: "Repetitionsfragen",
    desc: "Spaced Repetition: Fragen aus abgeschlossenen Lektionen tauchen wieder auf, wenn sie reif sind.",
  },
  {
    status: "geplant",
    title: "Scroll-Fortschrittsbalken",
    desc: "Dünner Balken am oberen Rand zeigt beim Lesen einer Lektion, wie weit man im Text ist.",
  },
  {
    status: "geplant",
    title: "Übungs-Vorschau im Curriculum",
    desc: "Schon auf der Kursübersicht sehen, wie viele Übungen pro Abschnitt warten.",
  },
  {
    status: "später",
    title: "Video-Lektionen",
    desc: "Eingebettete Video-Erklärungen mit Transkript und Sprung-Markern.",
  },
  {
    status: "später",
    title: "Zertifikate",
    desc: "Bestätigung nach Kursabschluss — nice-to-have, sobald die Kurse länger sind.",
  },
];

const statusLabel: Record<string, string> = {
  "in-arbeit": "In Arbeit",
  geplant: "Geplant",
  später: "Später",
};

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const allCourses = await listCourseSummaries();
  const featured = pickRandom(allCourses, 3);
  const { signedout } = await searchParams;

  return (
    <>
      <TopNav />
      <main className={styles.wrap}>
        {signedout && (
          <div className={styles.notice}>
            Du bist abgemeldet — bis bald.
          </div>
        )}
        <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.brandLine}>
            <BrandSignature
              markClassName={styles.mark}
              nameClassName={styles.name}
              tldClassName={styles.tld}
            />
          </div>
          {brand.tagline && <div className={styles.tag}>{brand.tagline}</div>}
        </div>
        <div className={styles.lede}>
          <h1>{brand.description}</h1>
          {brandConfig.hero.intro && <p>{brandConfig.hero.intro}</p>}
        </div>
      </header>

      {featured.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionLabel}>Wo du anfangen kannst</div>
          <div className={styles.tiles}>
            {featured.map((course, idx) => {
              const num = String(idx + 1).padStart(2, "0");
              const desc = tileDescription(course.frontmatter);
              return (
                <Link
                  key={course.slug}
                  href={`/courses/${course.slug}`}
                  className={styles.tile}
                >
                  <div className={styles.num}>{num}</div>
                  <div className={styles.ttl}>
                    {course.frontmatter.title}
                  </div>
                  {desc && <div className={styles.desc}>{desc}</div>}
                  <div className={styles.tileFooter}>
                    <span>{tileLabel(course.frontmatter)}</span>
                    <span className={styles.arrow}>→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

        <section className={styles.section}>
          <div className={styles.sectionLabel}>Was wir als Nächstes bauen</div>
          <ul className={styles.roadmap}>
            {roadmap.map((item) => (
              <li key={item.title} className={styles.roadmapItem}>
                <span
                  className={`${styles.roadmapStatus} ${
                    styles[`status_${item.status.replace("ä", "ae")}`] ?? ""
                  }`}
                >
                  {statusLabel[item.status]}
                </span>
                <div>
                  <div className={styles.roadmapTitle}>{item.title}</div>
                  <div className={styles.roadmapDesc}>{item.desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <footer className={styles.footer}>
          <div>{brandFullName} · v0.1</div>
          <div>{brand.tagline}</div>
        </footer>
      </main>
    </>
  );
}
