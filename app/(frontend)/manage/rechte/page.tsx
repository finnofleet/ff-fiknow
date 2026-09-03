import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { can } from "@/lib/auth/capabilities";
import { resolveEffectiveCapabilities } from "@/lib/auth/effective-capabilities";
import {
  inspectUserRights,
  listInspectableProfiles,
} from "@/lib/auth/rights-inspector";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { describeViewerScope } from "@/lib/training/entity-scope";

import pageStyles from "../pflichtkurse/page.module.css";
import styles from "./rechte.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rechte-Inspektor",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ user?: string }>;

/**
 * Rechte-Inspektor (ADR 0007 §8) — read-only Ansicht der effektiven Rechte +
 * Sicht-Scopes eines Users. Zeigt die Vereinigung ueber Legacy-Rolle +
 * additive Rollen-Zuweisungen, damit Nachvollziehbarkeit besteht, die
 * Variante A (Scope als erstklassiger Wert statt eigener Rolle) im
 * Rollennamen selbst nicht mitliefert.
 */
export default async function RightsInspectorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = (await getCurrentUser())!;
  const caps = await resolveEffectiveCapabilities(me.id, me.role, me.roleKeys);
  if (!can(caps, "users:manage")) {
    redirect("/manage?error=no_rights_inspector");
  }

  const { user: selectedUserId } = await searchParams;

  const profiles = await listInspectableProfiles();
  const inspection = selectedUserId
    ? await inspectUserRights(selectedUserId)
    : null;

  return (
    <>
      <Link href="/manage" className={pageStyles.backLink}>
        <ArrowLeft size={14} /> Verwaltung
      </Link>

      <header className={pageStyles.hero}>
        <div className={pageStyles.kicker}>Verwaltung</div>
        <h1 className={pageStyles.title}>Rechte-Inspektor</h1>
        <p className={pageStyles.lede}>
          Zeigt die effektiven Rechte + Sicht-Scopes eines Users — die
          Vereinigung aus Legacy-Rolle und additiven Rollen-Zuweisungen (ADR
          0007 §8). Read-only, aendert nichts.
        </p>
      </header>

      <div className={styles.layout}>
        <nav className={styles.profileList} aria-label="User auswaehlen">
          {profiles.map((p) => (
            <Link
              key={p.userId}
              href={`/manage/rechte?user=${encodeURIComponent(p.userId)}`}
              className={`${styles.profileLink} ${
                selectedUserId === p.userId ? styles.profileLinkActive : ""
              }`}
            >
              {p.displayName ?? p.userId}
              <span className={styles.profileRoleBadge}>
                {ROLE_LABEL[p.role]}
              </span>
            </Link>
          ))}
        </nav>

        {selectedUserId && !inspection && (
          <div className={styles.empty}>Kein Profil zu dieser userId.</div>
        )}

        {inspection && (
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>
                {inspection.displayName ?? inspection.userId}
              </h2>
              <div className={styles.cardSubline}>{inspection.userId}</div>
            </div>

            <div className={styles.metaRow}>
              <span>
                Legacy-Rolle: <strong>{ROLE_LABEL[inspection.legacyRole]}</strong>
              </span>
              <span>
                IdP-Rollen-Keys:{" "}
                <strong>
                  {inspection.roleKeys.length > 0
                    ? inspection.roleKeys.join(", ")
                    : "—"}
                </strong>
              </span>
              <span>
                Land: <strong>{inspection.land ?? "—"}</strong>
              </span>
              <span>
                BU: <strong>{inspection.bu ?? "—"}</strong>
              </span>
            </div>

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Effektive Capabilities</h3>
              {inspection.effectiveCapabilities.length === 0 ? (
                <div className={styles.empty}>keine</div>
              ) : (
                <div className={styles.chipRow}>
                  {inspection.effectiveCapabilities.map((cap) => (
                    <span key={cap} className={styles.chip}>
                      {cap}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Rollen-Zuweisungen</h3>
              {inspection.assignments.length === 0 ? (
                <div className={styles.empty}>keine (nur Legacy-Rolle)</div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Rolle</th>
                        <th>Scope Land</th>
                        <th>Scope BU</th>
                        <th>Capabilities</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspection.assignments.map((a, i) => (
                        <tr key={a.roleKey + i}>
                          <td>
                            {a.roleLabel}
                            <div className={styles.roleKey}>{a.roleKey}</div>
                          </td>
                          <td>{a.scopeLand?.join(", ") ?? "alle"}</td>
                          <td>{a.scopeBu?.join(", ") ?? "alle"}</td>
                          <td>
                            <div className={styles.chipRow}>
                              {a.capabilities.map((cap) => (
                                <span key={cap} className={styles.chip}>
                                  {cap}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Sicht-Scope je Capability</h3>
              {inspection.scopedCapabilities.length === 0 ? (
                <div className={styles.empty}>keine scoped Capability</div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Capability</th>
                        <th>Sicht-Scope</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspection.scopedCapabilities.map((sc) => (
                        <tr key={sc.capability}>
                          <td>{sc.capability}</td>
                          <td>{describeViewerScope(sc.scope)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </article>
        )}
      </div>

      <Link href="/manage" className={pageStyles.backLink}>
        <ArrowLeft size={14} /> Zurueck zur Uebersicht
      </Link>
    </>
  );
}
