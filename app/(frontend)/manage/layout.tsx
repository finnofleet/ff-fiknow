import { redirect } from "next/navigation";

import { TopNav } from "@/components/top-nav";
import { getAppVersion } from "@/lib/app-version";
import { can } from "@/lib/auth/capabilities";
import { resolveEffectiveCapabilities } from "@/lib/auth/effective-capabilities";
import { getCurrentUser } from "@/lib/auth/session";

import styles from "./layout.module.css";

/**
 * Admin-Bereich-Layout. Schützt alle /admin/* Routes durch eine zentrale
 * Auth-/Role-Prüfung — pro Page muss nichts mehr selbst geprüft werden.
 *
 * Layout-Aufbau:
 *   - TopNav (mit active="admin")
 *   - Max-Width-Wrapper für konsistente Page-Breite
 *
 * Sub-Navigation (Dashboard/Kurs-Import/Nutzer) lebt im Dashboard selber,
 * sodass kein zusätzlicher Sidebar-Chrome nötig ist.
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/manage");
  // ADR 0007 P3: Zugang zum /manage-Shell haengt an der Legacy-Rolle ODER an
  // effektiven Capabilities. Scoped Compliance-Betrachter sind per Session
  // `learner`, bekommen ihre Rechte aber aus role_assignments — der reine
  // Legacy-Check (canSeeAdmin) sperrte sie faelschlich VOR der Page aus. Rein
  // additiv: wer bisher rein durfte, darf weiterhin; zusaetzlich duerfen
  // Traeger irgendeiner Management-Capability rein (leerer Cap-Satz = Lerner
  // -> weiterhin raus). Die FEINE Berechtigung pro Unterseite
  // (Kurse/Nutzer/Pflichtkurse) macht jede Page selbst.
  const caps = await resolveEffectiveCapabilities(user.id, user.role, user.roleKeys);
  if (!can(caps, "courses:manage") && caps.size === 0) {
    redirect("/dashboard?error=no_admin_access");
  }

  const { version, commit } = getAppVersion();

  return (
    <div className={styles.shell}>
      <TopNav active="manage" />
      <main className={styles.wrap}>{children}</main>
      <footer className={styles.footer}>
        v{version} · {commit}
      </footer>
    </div>
  );
}
