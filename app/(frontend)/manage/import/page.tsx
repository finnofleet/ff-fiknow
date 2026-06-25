import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { canManageCourses } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";

import { ImportForm } from "./import-form";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Kurs importieren",
  robots: { index: false, follow: false },
};

export default async function AdminImportPage() {
  // Auth-Shell prüft schon dass User Curator/Admin ist (canSeeAdmin).
  // Hier zusätzlich die Course-Capability nochmal — semantisch ehrlicher
  // und schützt vor späteren Rolle-Erweiterungen die SeeAdmin geben
  // ohne Course-Mgmt-Rechte.
  const user = (await getCurrentUser())!;
  if (!canManageCourses(user.role)) {
    redirect("/manage?error=no_course_permission");
  }

  return (
    <>
      <Link href="/manage" className={styles.backLink}>
        <ArrowLeft size={14} /> Verwaltung
      </Link>

      <header className={styles.hero}>
        <div className={styles.kicker}>Verwaltung</div>
        <h1 className={styles.title}>Kurs importieren</h1>
        <p className={styles.lede}>
          Lade ein Course-Bundle (.zip) hoch — das Format wird vom
          Authoring-Plugin (Claude Cowork) erzeugt oder kann manuell
          aus einem Bundle-Folder erstellt werden. Schema-Details siehe{" "}
          <code>docs/AUTHORING_BUNDLE.md</code>.
        </p>
      </header>

      <section className={styles.section}>
        <ImportForm />
      </section>

      <section className={styles.howto}>
        <h2>So funktioniert&apos;s</h2>
        <ol>
          <li>
            Bundle-Folder lokal vorliegen haben (vom Plugin generiert
            oder manuell als <code>&lt;slug&gt;/course.mdx + ...</code>).
          </li>
          <li>
            ZIP des Bundle-Folders erzeugen (Plugin macht das automatisch,
            manuell: <code>zip -r &lt;slug&gt;.zip &lt;slug&gt;/</code>).
          </li>
          <li>
            ZIP hier reinziehen oder Datei wählen, dann „Hochladen".
          </li>
          <li>
            Course-Slug wird aus dem Top-Level-Ordner-Namen im ZIP
            gelesen. Existierende Kurse mit gleichem Slug werden{" "}
            <strong>überschrieben</strong> (idempotent).
          </li>
          <li>
            Jeder Upload landet als <strong>Draft</strong>. Mit dem
            „Veröffentlichen"-Button im Erfolgs-Dialog wird der Kurs live.
          </li>
        </ol>
      </section>
    </>
  );
}
