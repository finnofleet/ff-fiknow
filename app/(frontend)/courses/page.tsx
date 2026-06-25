import type { Metadata } from "next";

import { TopNav } from "@/components/top-nav";
import { brand } from "@/lib/brand";
import { listCourses } from "@/lib/content";
import { viewerCanSeeDrafts } from "@/lib/auth/session";

import { CatalogClient, type CatalogCourse } from "./catalog-client";
import styles from "./page.module.css";

// "Kurse" wird via title.template in layout.tsx zu "Kurse | <BrandName>" expandiert.
export const metadata: Metadata = {
  title: "Kurse",
  description: `Alle Kurse auf ${brand.name} — ruhig aufgebaut, mit Beispielen und Übungsfragen. Frei zugänglich, auch ohne Konto.`,
  alternates: {
    canonical: "/courses",
  },
};

// Draft-Sichtbarkeit ist pro-User → kein statisches Caching des Katalogs.
export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  // Kuratoren/Admins sehen zusätzlich Draft-Kurse (im selben Katalog, mit Badge).
  const includeDrafts = await viewerCanSeeDrafts();
  const courses = await listCourses({ includeDrafts });
  const totalLessons = courses.reduce(
    (sum, c) => sum + c.sections.reduce((s, sec) => s + sec.lessons.length, 0),
    0,
  );

  // Serializable Daten an die Client-Component übergeben — Client kümmert
  // sich um Filter + URL-Sync.
  const catalogCourses: CatalogCourse[] = courses.map((c) => ({
    slug: c.slug,
    frontmatter: c.frontmatter,
    sections: c.sections.map((s) => ({ lessons: s.lessons })),
  }));

  return (
    <>
      <TopNav active="katalog" />
      <header className={styles.head}>
        <h1>
          Alle <em>{courses.length} {courses.length === 1 ? "Kurs" : "Kurse"}</em>.
        </h1>
        <p>
          {totalLessons} Lektionen insgesamt. Jeder Kurs ist ruhig aufgebaut, mit Beispielen
          und Übungsfragen — zum Lesen, Verstehen, Wiederkommen.
        </p>
      </header>

      <main className={styles.wrap}>
        <CatalogClient courses={catalogCourses} />
      </main>
    </>
  );
}
