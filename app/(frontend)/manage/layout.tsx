import { redirect } from "next/navigation";

import { TopNav } from "@/components/top-nav";
import { canSeeAdmin } from "@/lib/auth/roles";
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
  if (!canSeeAdmin(user.role)) {
    redirect("/dashboard?error=no_admin_access");
  }

  return (
    <div className={styles.shell}>
      <TopNav active="manage" />
      <main className={styles.wrap}>{children}</main>
    </div>
  );
}
