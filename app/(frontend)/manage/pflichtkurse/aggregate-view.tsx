/**
 * PII-freie Aggregat-Sicht auf Pflichtkurse (ADR 0007 §9, Phase P3b).
 *
 * Rendert ausschliesslich die von `getComplianceAggregate` gelieferten
 * Buckets (Kurs × Land) — KEINE Namen, KEINE User-IDs. Reine
 * Server-Component ohne Interaktivitaet, daher kein "use client".
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import type { CourseAggregate } from "@/lib/training/compliance-aggregate-compute";

import styles from "./aggregate-view.module.css";
import pageStyles from "./page.module.css";

export function ComplianceAggregateView({
  aggregate,
}: {
  aggregate: CourseAggregate[];
}) {
  return (
    <>
      <Link href="/manage" className={pageStyles.backLink}>
        <ArrowLeft size={14} /> Verwaltung
      </Link>

      <header className={pageStyles.hero}>
        <div className={pageStyles.kicker}>Verwaltung</div>
        <h1 className={pageStyles.title}>Pflichtkurse — Aggregat</h1>
        <p className={pageStyles.lede}>
          Aggregierte, anonymisierte Kennzahlen je Land — diese Sicht enthaelt
          keine namentlichen Daten.
        </p>
      </header>

      {aggregate.length === 0 ? (
        <div className={pageStyles.empty}>Keine Daten im Sichtbereich.</div>
      ) : (
        <section className={styles.courseList}>
          {aggregate.map((course) => (
            <article key={course.courseSlug} className={styles.card}>
              <h2 className={styles.cardTitle}>{course.title}</h2>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Land</th>
                      <th>Zugewiesen</th>
                      <th>Abgeschlossen</th>
                      <th>Quote</th>
                    </tr>
                  </thead>
                  <tbody>
                    {course.buckets.map((bucket) => (
                      <tr key={bucket.land}>
                        <td>{bucket.land}</td>
                        {bucket.suppressed ? (
                          <td className={styles.suppressedCell} colSpan={3}>
                            &lt; 5 — unterdrueckt
                          </td>
                        ) : (
                          <>
                            <td className={styles.numCell}>{bucket.assigned}</td>
                            <td className={styles.numCell}>{bucket.completed}</td>
                            <td className={styles.numCell}>{bucket.pct}%</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>
      )}

      <p className={styles.footnote}>
        Aggregierte, anonymisierte Kennzahlen. Gruppen mit weniger als 5
        Personen werden zum Schutz vor Rueckschluessen auf Einzelpersonen
        unterdrueckt (k-Anonymitaet).
      </p>
    </>
  );
}
