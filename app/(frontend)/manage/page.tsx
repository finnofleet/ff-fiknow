import type { Metadata } from "next";
import Link from "next/link";
import { Upload, Users, BookOpen, ArrowRight, ExternalLink } from "lucide-react";

import { brandFullName } from "@/lib/brand";
import { canManageCourses, canManageUsers, ROLE_LABEL } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Verwaltung",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  // Auth wird im /manage/layout.tsx schon geprüft — hier nur User-Daten holen.
  const user = (await getCurrentUser())!;

  type Tile = {
    title: string;
    desc: string;
    href: string;
    icon: React.ReactNode;
    available: boolean;
    external?: boolean;
  };

  const tiles: Tile[] = [
    {
      title: "Kurs importieren",
      desc: "Course-Bundle (.zip) hochladen — vom Authoring-Plugin generiert oder manuell gepackt.",
      href: "/manage/import",
      icon: <Upload size={22} strokeWidth={1.5} />,
      available: canManageCourses(user.role),
    },
    {
      title: "Kurse",
      desc: "Kurse veröffentlichen, offline nehmen, löschen und den KI-Tutor freischalten.",
      href: "/manage/courses",
      icon: <BookOpen size={22} strokeWidth={1.5} />,
      available: canManageCourses(user.role),
    },
    {
      title: "Nutzer:innen",
      desc: "Rollen vergeben, Nutzer:innen sperren oder entsperren.",
      href: "/manage/users",
      icon: <Users size={22} strokeWidth={1.5} />,
      available: canManageUsers(user.role),
    },
  ];

  return (
    <>
      <header className={styles.hero}>
        <div className={styles.kicker}>Verwaltung</div>
        <h1 className={styles.title}>Übersicht</h1>
        <p className={styles.lede}>
          Du bist auf {brandFullName} eingeloggt als{" "}
          <strong>{user.email}</strong> · Rolle{" "}
          <strong>{ROLE_LABEL[user.role]}</strong>.
        </p>
      </header>

      <section className={styles.tiles}>
        {tiles.map((tile) =>
          tile.available ? (
            <Link
              key={tile.href}
              href={tile.href}
              className={styles.tile}
              // External-Tiles (z.B. Payload-Admin) im neuen Tab — Payload
              // hat eigene Navigation und keinen Back-to-App-Link, daher
              // soll die verstande-Verwaltung im Original-Tab erhalten
              // bleiben.
              target={tile.external ? "_blank" : undefined}
              rel={tile.external ? "noopener noreferrer" : undefined}
            >
              <div className={styles.tileIcon}>{tile.icon}</div>
              <div className={styles.tileBody}>
                <div className={styles.tileTitle}>
                  {tile.title}
                  {tile.external && (
                    <ExternalLink
                      size={13}
                      strokeWidth={1.5}
                      className={styles.tileExternalIcon}
                      aria-label="öffnet in neuem Tab"
                    />
                  )}
                </div>
                <div className={styles.tileDesc}>{tile.desc}</div>
              </div>
              <ArrowRight size={18} strokeWidth={1.5} className={styles.tileArrow} />
            </Link>
          ) : (
            <div
              key={tile.href}
              className={`${styles.tile} ${styles.tileDisabled}`}
              aria-disabled="true"
              title="Diese Funktion erfordert mehr Berechtigungen"
            >
              <div className={styles.tileIcon}>{tile.icon}</div>
              <div className={styles.tileBody}>
                <div className={styles.tileTitle}>{tile.title}</div>
                <div className={styles.tileDesc}>{tile.desc}</div>
                <div className={styles.tileLockNote}>
                  Erfordert Admin-Rolle
                </div>
              </div>
            </div>
          ),
        )}
      </section>

      <section className={styles.section}>
        <Link href="/dashboard" className="btn btn-ghost">
          ← Zurück zu Mein Lernen
        </Link>
      </section>
    </>
  );
}
