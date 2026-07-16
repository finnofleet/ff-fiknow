import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { canManageCourses } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getComplianceOverview } from "@/lib/training/compliance";
import type { Participant, ParticipantStatus } from "@/lib/training/compliance-compute";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Pflichtkurse — Nachweis",
  robots: { index: false, follow: false },
};

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

export default async function CompliancePage() {
  const me = (await getCurrentUser())!;
  if (!canManageCourses(me.role)) {
    redirect("/manage?error=no_compliance_permission");
  }

  const overview = await getComplianceOverview();

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

      {overview.length === 0 ? (
        <div className={styles.empty}>
          Es sind aktuell keine Pflichtkurse definiert. Markiere einen Kurs
          als &bdquo;Pflichtkurs&ldquo; oder lege eine Pflicht-Anforderung an.{" "}
          <Link href="/manage/courses" className={styles.emptyLink}>
            Zu den Kursen →
          </Link>
        </div>
      ) : (
        <section className={styles.courseList}>
          {overview.map((course) => (
            <article key={course.courseSlug} className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h2 className={styles.cardTitle}>{course.title}</h2>
                  <div className={styles.cardSlug}>{course.courseSlug}</div>
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
