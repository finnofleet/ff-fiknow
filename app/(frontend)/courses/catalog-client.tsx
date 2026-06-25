"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { CourseCard } from "@/components/course-card";

import styles from "./page.module.css";

// Minimum-Shape: was die CourseCard + Filter brauchen. Damit der Client
// nicht das ganze Course-Type-Universum kennen muss.
export type CatalogCourse = {
  slug: string;
  frontmatter: {
    title: string;
    subtitle?: string;
    description?: string;
    category?: string;
    difficulty?: string;
    estimated_minutes?: number;
    cover_alt?: string;
  };
  sections: Array<{ lessons: unknown[] }>;
};

type Props = {
  courses: CatalogCourse[];
};

const DIFFICULTY_LABELS: Record<string, string> = {
  einsteiger: "Einsteiger",
  fortgeschritten: "Fortgeschritten",
  experte: "Experte",
};

export function CatalogClient({ courses }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [category, setCategory] = useState(searchParams.get("cat") ?? "");
  const [difficulty, setDifficulty] = useState(searchParams.get("diff") ?? "");

  // URL synchron mit Filter-State halten — Reload, Share, Browser-Zurück
  // funktionieren dann wie erwartet. Replace statt Push damit's keine
  // History-Einträge pro Tastendruck gibt.
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (category) params.set("cat", category);
    if (difficulty) params.set("diff", difficulty);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? "?" + qs : ""}`, { scroll: false });
  }, [query, category, difficulty, pathname, router]);

  // Verfügbare Kategorien aus den Daten ableiten
  const availableCategories = useMemo(() => {
    return Array.from(
      new Set(courses.map((c) => c.frontmatter.category).filter(Boolean)),
    ) as string[];
  }, [courses]);

  const availableDifficulties = useMemo(() => {
    return Array.from(
      new Set(courses.map((c) => c.frontmatter.difficulty).filter(Boolean)),
    ) as string[];
  }, [courses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses.filter((c) => {
      if (category && c.frontmatter.category !== category) return false;
      if (difficulty && c.frontmatter.difficulty !== difficulty) return false;
      if (q) {
        const haystack = [
          c.frontmatter.title,
          c.frontmatter.subtitle,
          c.frontmatter.description,
          c.frontmatter.category,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [courses, query, category, difficulty]);

  const hasActiveFilter = Boolean(query || category || difficulty);

  function clearAll() {
    setQuery("");
    setCategory("");
    setDifficulty("");
  }

  return (
    <>
      <aside className={styles.filter}>
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suche im Katalog"
            className={styles.searchInput}
            aria-label="Volltextsuche"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className={styles.searchClear}
              aria-label="Suche löschen"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {availableCategories.length > 0 && (
          <>
            <h5>Kategorie</h5>
            <div className={styles.fList}>
              {availableCategories.map((cat) => {
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(active ? "" : cat)}
                    className={`${styles.fItem} ${active ? styles.fItemActive : ""}`}
                    aria-pressed={active}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {availableDifficulties.length > 0 && (
          <>
            <h5>Schwierigkeit</h5>
            <div className={styles.fList}>
              {availableDifficulties.map((d) => {
                const active = difficulty === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(active ? "" : d)}
                    className={`${styles.fItem} ${active ? styles.fItemActive : ""}`}
                    aria-pressed={active}
                  >
                    {DIFFICULTY_LABELS[d] ?? d}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {hasActiveFilter && (
          <button type="button" onClick={clearAll} className={styles.clearAll}>
            Filter zurücksetzen
          </button>
        )}
      </aside>

      <section className={styles.grid}>
        {filtered.length === 0 ? (
          <p className={styles.empty}>
            {hasActiveFilter
              ? "Keine Kurse passen zu diesen Filtern."
              : "Noch keine Kurse synchronisiert."}
          </p>
        ) : (
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          filtered.map((course) => <CourseCard key={course.slug} course={course as any} />)
        )}
      </section>
    </>
  );
}
