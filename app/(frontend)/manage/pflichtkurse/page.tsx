import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";

import { can } from "@/lib/auth/capabilities";
import { resolveEffectiveCapabilities } from "@/lib/auth/effective-capabilities";
import { getCurrentUser } from "@/lib/auth/session";
import { getComplianceOverview } from "@/lib/training/compliance";
import { getComplianceAggregate } from "@/lib/training/compliance-aggregate";
import {
  collectDriverOptions,
  filterCoursesByDriver,
  type Participant,
  type ParticipantStatus,
} from "@/lib/training/compliance-compute";
import { driverLabel } from "@/lib/training/compliance-drivers";
import { resolveViewerScope } from "@/lib/training/viewer-scope";

import { ComplianceAggregateView } from "./aggregate-view";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Pflichtkurse — Nachweis",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ driver?: string }>;

const STATUS_LABEL: Record<ParticipantStatus, string> = {
  nicht_gestartet: "Nicht gestartet",
  gestartet: "Gestartet",
  abgeschlossen: "Abgeschlossen",
};

const STATUS_BADGE_CLASS: Record<ParticipantStatus, string> = {
  nicht_gestartet: styles.badgeNeutral,
  gestartet: styles.badgeAmber,
  abgeschlossen: styles.badgeGreen,
};

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function ParticipantRow({ participant }: { participant: Participant }) {
  return (
    <tr>
      <td>{participant.displayName}</td>
      <td>
        <span className={`${styles.badge} ${STATUS_BADGE_CLASS[participant.status]}`}>
          {STATUS_LABEL[participant.status]}
        </span>
      </td>
      <td className={styles.numCell}>{formatDate(participant.startedAt)}</td>
      <td className={styles.numCell}>{formatDate(participant.completedAt)}</td>
    </tr>
  );
}

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = (await getCurrentUser())!;
  const caps = await resolveEffectiveCapabilities(me.id, me.role);
  const canNamed = can(caps, "compliance:view-named");
  const canAggregate = can(caps, "compliance:view-aggregate");
  // ADR 0007 P3b: Zugang haengt an Capabilities. `view-named` -> namentliche
  // (scoped) Sicht; NUR `view-aggregate` -> PII-freie Aggregat-Sicht; weder
  // noch -> kein Zugang. `view-named` hat Vorrang (Obermenge: wer Namen sehen
  // darf, sieht die vollere Sicht). curator/admin haben view-named
  // (byte-identisch).
  if (!canNamed && !canAggregate) {
    redirect("/manage?error=no_compliance_permission");
  }

  if (!canNamed && canAggregate) {
    const aggregateScope = await resolveViewerScope(
      me.id,
      "compliance:view-aggregate",
    );
    const aggregate = await getComplianceAggregate({ viewerScope: aggregateScope });
    return <ComplianceAggregateView aggregate={aggregate} />;
  }

  const { driver: driverRaw } = await searchParams;
  const driver = driverRaw && driverRaw.length > 0 ? driverRaw : null;

  const viewerScope = await resolveViewerScope(me.id, "compliance:view-named");
  const fullOverview = await getComplianceOverview({ viewerScope });
  const driverOptions = collectDriverOptions(fullOverview);
  const overview = filterCoursesByDriver(fullOverview, driver);

  const exportHref = driver
    ? `/manage/pflichtkurse/export?driver=${encodeURIComponent(driver)}`
    : "/manage/pflichtkurse/export";

  return (
    <>
      <Link href="/manage" className={styles.backLink}>
        <ArrowLeft size={14} /> Verwaltung
      </Link>

      <header className={styles.hero}>
        <div className={styles.kicker}>Verwaltung</div>
        <h1 className={styles.title}>Pflichtkurse</h1>
        <p className={styles.lede}>
          Erfüllungsquote je Pflichtkurs — wer welche Pflichtschulung wann
          absolviert hat. Nenner ist die Anzahl zugewiesener Teilnehmer:innen.
        </p>
      </header>

      {fullOverview.length > 0 && (
        <nav className={styles.filterBar} aria-label="Nach Compliance-Treiber filtern">
          {driverOptions.length > 0 && (
            <>
              <Link
                href="/manage/pflichtkurse"
                className={`${styles.filterLink} ${!driver ? styles.filterLinkActive : ""}`}
              >
                Alle
              </Link>
              {driverOptions.map((value) => (
                <Link
                  key={value}
                  href={`/manage/pflichtkurse?driver=${encodeURIComponent(value)}`}
                  className={`${styles.filterLink} ${driver === value ? styles.filterLinkActive : ""}`}
                >
                  {driverLabel(value)}
                </Link>
              ))}
            </>
          )}
          <a href={exportHref} className={styles.exportLink}>
            <Download size={14} /> CSV exportieren
          </a>
        </nav>
      )}

      {overview.length === 0 ? (
        <div className={styles.empty}>
          {driver ? (
            <>
              Kein Pflichtkurs mit diesem Treiber gefunden.{" "}
              <Link href="/manage/pflichtkurse" className={styles.emptyLink}>
                Filter zurücksetzen →
              </Link>
            </>
          ) : (
            <>
              Es sind aktuell keine Pflichtkurse definiert. Markiere einen Kurs
              als &bdquo;Pflichtkurs&ldquo; oder lege eine Pflicht-Anforderung an.{" "}
              <Link href="/manage/courses" className={styles.emptyLink}>
                Zu den Kursen →
              </Link>
            </>
          )}
        </div>
      ) : (
        <section className={styles.courseList}>
          {overview.map((course) => (
            <article key={course.courseSlug} className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h2 className={styles.cardTitle}>{course.title}</h2>
                  <div className={styles.cardSlug}>{course.courseSlug}</div>
                  {course.drivers.length > 0 && (
                    <div className={styles.driverBadges}>
                      {course.drivers.map((value) => (
                        <span key={value} className={styles.driverBadge}>
                          {driverLabel(value)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className={styles.quote}>
                  <span className={styles.quoteNum}>
                    {course.completed} / {course.assigned}
                  </span>
                  <span className={styles.quotePct}>{course.pct}%</span>
                </div>
              </div>

              <div className={styles.progressBar}>
                <span style={{ width: `${course.pct}%` }} />
              </div>

              <div className={styles.breakdown}>
                <span>
                  <strong>{course.notStarted}</strong> nicht gestartet
                </span>
                <span>
                  <strong>{course.started}</strong> gestartet
                </span>
                <span>
                  <strong>{course.completed}</strong> abgeschlossen
                </span>
              </div>

              <details className={styles.drillDown}>
                <summary>
                  Teilnehmer:innen anzeigen ({course.participants.length})
                </summary>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Teilnehmer</th>
                        <th>Status</th>
                        <th>Startdatum</th>
                        <th>Abschlussdatum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {course.participants.map((participant) => (
                        <ParticipantRow
                          key={participant.userId}
                          participant={participant}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </article>
          ))}
        </section>
      )}

      <Link href="/manage" className={styles.backLink}>
        <ArrowLeft size={14} /> Zurück zur Übersicht
      </Link>
    </>
  );
}
