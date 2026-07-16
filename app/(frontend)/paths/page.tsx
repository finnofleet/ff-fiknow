import type { Metadata } from "next";
import Link from "next/link";

import { TopNav } from "@/components/top-nav";
import { viewerCanSeeDrafts } from "@/lib/auth/session";
import { brand } from "@/lib/brand";
import { listPaths } from "@/lib/paths";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Lernpfade",
  description: `Lernpfade auf ${brand.name} — mehrere Kurse zu einer Reihe gebündelt, geführt oder als lose Empfehlung.`,
  alternates: {
    canonical: "/paths",
  },
};

export const dynamic = "force-dynamic";

export default async function PathsPage() {
  // Autoren/Admins sehen zusätzlich Draft-Pfade (mit „Entwurf"-Badge).
  const includeDrafts = await viewerCanSeeDrafts();
  const paths = await listPaths({ includeDrafts });

  return (
    <>
      <TopNav active="pfade" />
      <header className={styles.head}>
        <h1>
          Lern<em>pfade</em>.
        </h1>
        <p>
          Mehrere Kurse, zu einer Reihe gebündelt — geführt von Anfang bis Ende
          oder als lose Empfehlung, nach Bedarf navigierbar.
        </p>
      </header>

      <main className={styles.wrap}>
        {paths.length === 0 ? (
          <p className={styles.empty}>Noch keine Lernpfade angelegt.</p>
        ) : (
          <ul className={styles.grid}>
            {paths.map((p) => (
              <li key={p.slug}>
                <Link href={`/paths/${p.slug}`} className={styles.card}>
                  <span className={styles.badgeRow}>
                    <span className={styles.badge}>
                      {p.fuehrungsgrad === "linear" ? "Geführt" : "Empfohlen"}
                    </span>
                    {p.status === "draft" && (
                      <span className={styles.draftBadge}>Entwurf</span>
                    )}
                  </span>
                  <span className={styles.cardTitle}>{p.title}</span>
                  {p.subtitle && (
                    <span className={styles.cardSub}>{p.subtitle}</span>
                  )}
                  <span className={styles.cardMeta}>
                    {p.courseCount} {p.courseCount === 1 ? "Kurs" : "Kurse"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
