import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TopNav } from "@/components/top-nav";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getMyTrainingAssignments,
  type MyTrainingItem,
} from "@/lib/training/user-view";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Meine Pflichtschulungen",
  // Login-pflichtige Page — keine Indexierung
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const AMPEL_BADGE_CLASS: Record<MyTrainingItem["ampel"]["color"], string> = {
  green: styles.badgeGreen,
  amber: styles.badgeAmber,
  red: styles.badgeRed,
  neutral: styles.badgeNeutral,
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function metaText(item: MyTrainingItem): string {
  if (item.ampel.status === "erledigt") {
    return item.completedAt
      ? `Erledigt am ${formatDate(item.completedAt)}`
      : "Erledigt";
  }
  if (item.dueDate) {
    return `Fällig bis ${formatDate(item.dueDate)}`;
  }
  return "Keine feste Frist";
}

type Group = { heading: string; items: MyTrainingItem[] };

function groupItems(items: MyTrainingItem[]): Group[] {
  const ueberfaellig = items.filter((i) => i.ampel.status === "ueberfaellig");
  const offen = items.filter(
    (i) => i.ampel.status === "offen" || i.ampel.status === "faellig_bald",
  );
  const erledigt = items.filter((i) => i.ampel.status === "erledigt");

  const groups: Group[] = [];
  if (ueberfaellig.length > 0) {
    groups.push({ heading: "Überfällig", items: ueberfaellig });
  }
  if (offen.length > 0) {
    groups.push({ heading: "Offen", items: offen });
  }
  if (erledigt.length > 0) {
    groups.push({ heading: "Erledigt", items: erledigt });
  }
  return groups;
}

export default async function MeinePflichtschulungenPage() {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  const items = await getMyTrainingAssignments(user.id);
  const groups = groupItems(items);

  return (
    <div className={styles.shell}>
      <TopNav />

      <main className={styles.wrap}>
        <header className={styles.head}>
          <div className={styles.kicker}>Compliance</div>
          <h1>Meine Pflichtschulungen</h1>
        </header>

        {items.length === 0 ? (
          <p className={styles.empty}>
            Dir sind aktuell keine Pflichtschulungen zugewiesen.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.heading} className={styles.group}>
              <div className={styles.sectionHd}>
                <h3>{group.heading}</h3>
                <span className={styles.sectionMeta}>
                  {group.items.length}{" "}
                  {group.items.length === 1 ? "Schulung" : "Schulungen"}
                </span>
              </div>

              <ul className={styles.courseList}>
                {group.items.map((item) => (
                  <li key={`${item.courseSlug}-${item.cycle}`}>
                    <Link href={item.href} className={styles.courseRow}>
                      <span className={styles.rowText}>
                        <span className={styles.rowTitle}>
                          {item.title}
                          {item.cycle > 1 && (
                            <span className={styles.recertTag}>Wiederholung</span>
                          )}
                        </span>
                        <span className={styles.rowSub}>{metaText(item)}</span>
                      </span>
                      <span
                        className={`${styles.badge} ${AMPEL_BADGE_CLASS[item.ampel.color]}`}
                      >
                        {item.ampel.label}
                      </span>
                      <span className={styles.rowArrow}>→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
