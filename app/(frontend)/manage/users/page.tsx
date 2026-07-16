import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { canManageUsers } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Nutzer:innen verwalten",
  robots: { index: false, follow: false },
};

/**
 * Benutzer-/Rollenverwaltung liegt bei FIKNOW vollständig im Identity-Provider
 * (Keycloak): Rollen werden bei jedem Login aus den Token-Claims übernommen,
 * eine App-interne Änderung hätte keinen Bestand. Daher nur ein Hinweis.
 */
export default async function AdminUsersPage() {
  const me = (await getCurrentUser())!;
  if (!canManageUsers(me.role)) {
    redirect("/manage?error=no_user_mgmt_permission");
  }

  return (
    <>
      <Link href="/manage" className={styles.backLink}>
        <ArrowLeft size={14} /> Verwaltung
      </Link>
      <header className={styles.hero}>
        <div className={styles.kicker}>Verwaltung</div>
        <h1 className={styles.title}>Nutzer:innen</h1>
        <p className={styles.lede}>
          Benutzer und Rollen werden zentral über Single Sign-On (Keycloak)
          verwaltet. Vergib die Realm-Rollen bzw. Gruppen dort (z. B.{" "}
          <code>fiknow-curator</code>, <code>fiknow-admin</code>) — sie werden
          bei jedem Login automatisch übernommen.
        </p>
      </header>
    </>
  );
}
