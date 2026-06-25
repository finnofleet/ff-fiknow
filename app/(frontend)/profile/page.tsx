import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";

import { TopNav } from "@/components/top-nav";
import { db } from "@/lib/db/client";
import {
  enrollments,
  lessonProgress,
  profiles,
  quizAttempts,
} from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageCourses, normalizeRole } from "@/lib/auth/roles";
import { listAuthoringTokens } from "@/lib/auth/authoring-token";

import { AccessTokensManager, type TokenView } from "./access-tokens";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Profil",
  // Profil-Page ist login-pflichtig — keine Indexierung
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/oidc/login");

  // Profil aus DB (oder Fallback auf Session)
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id));

  const displayName =
    profile?.displayName ??
    user.displayName ??
    user.email?.split("@")[0] ??
    "";
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const role = normalizeRole(profile?.role ?? "learner");

  // Authoring-Tokens: nur für curator/admin serverseitig laden
  let authoringTokens: TokenView[] = [];
  if (canManageCourses(role)) {
    const rawTokens = await listAuthoringTokens(user.id);
    authoringTokens = rawTokens.map((t) => ({
      id: t.id,
      label: t.label,
      createdAt: t.createdAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      revoked: t.revoked,
      expired: t.expired,
    }));
  }

  // Stats
  const [enrollCount] = await db
    .select({ n: count() })
    .from(enrollments)
    .where(eq(enrollments.userId, user.id));
  const [completedCount] = await db
    .select({ n: count() })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, user.id),
        eq(lessonProgress.status, "completed"),
      ),
    );
  const [attemptCount] = await db
    .select({ n: count() })
    .from(quizAttempts)
    .where(eq(quizAttempts.userId, user.id));

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("de-CH", {
        year: "numeric",
        month: "long",
      })
    : "—";

  return (
    <div className={styles.shell}>
      <TopNav />

      <main className={styles.wrap}>
        <header className={styles.hero}>
          <div className={styles.avatar}>{initial}</div>
          <div className={styles.heroBody}>
            <div className={styles.kicker}>Profil</div>
            <h1 className={styles.name}>{displayName}</h1>
            <div className={styles.email}>
              {user.email}
              <span className={styles.dot}>·</span>
              Rolle: <strong>{role}</strong>
              <span className={styles.dot}>·</span>
              dabei seit {memberSince}
            </div>
          </div>
        </header>

        <section className={styles.stats}>
          <div className={styles.statTile}>
            <div className={styles.statN}>{enrollCount?.n ?? 0}</div>
            <div className={styles.statL}>eingeschrieben</div>
          </div>
          <div className={styles.statTile}>
            <div className={styles.statN}>{completedCount?.n ?? 0}</div>
            <div className={styles.statL}>Lektionen erledigt</div>
          </div>
          <div className={styles.statTile}>
            <div className={styles.statN}>{attemptCount?.n ?? 0}</div>
            <div className={styles.statL}>Quiz-Versuche</div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHd}>
            <h3>Account</h3>
            <span className={styles.sectionMeta}>Übersicht</span>
          </div>
          <dl className={styles.account}>
            <div className={styles.accountRow}>
              <dt>E-Mail-Adresse</dt>
              <dd>{user.email ?? "—"}</dd>
            </div>
            <div className={styles.accountRow}>
              <dt>Konto erstellt</dt>
              <dd>
                {profile?.createdAt
                  ? new Date(profile.createdAt).toLocaleString("de-CH")
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>

        {canManageCourses(role) && (
          <section className={styles.section}>
            <div className={styles.sectionHd}>
              <h3>Zugriffstokens</h3>
              <span className={styles.sectionMeta}>
                für MCP-/CLI-Authoring
              </span>
            </div>
            <AccessTokensManager initialTokens={authoringTokens} />
          </section>
        )}

        <section className={styles.section}>
          <div className={styles.sectionHd}>
            <h3>Konto-Verwaltung</h3>
          </div>
          <p>
            Name, Passwort, E-Mail-Adresse und Konto werden zentral über deinen
            Identity-Provider (Single Sign-On) verwaltet.
          </p>
        </section>
      </main>
    </div>
  );
}
