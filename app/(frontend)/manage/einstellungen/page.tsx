import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { can } from "@/lib/auth/capabilities";
import { resolveEffectiveCapabilities } from "@/lib/auth/effective-capabilities";
import { getCurrentUser } from "@/lib/auth/session";
import { getResolvedSettings } from "@/lib/settings/store";

import pageStyles from "../pflichtkurse/page.module.css";
import { updateSettingAction } from "./actions";
import styles from "./einstellungen.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Einstellungen",
  robots: { index: false, follow: false },
};

const SOURCE_LABEL: Record<string, string> = {
  db: "hier gesetzt",
  env: "aus der Deployment-Konfiguration",
  default: "Standardwert",
};

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

type SearchParams = Promise<{ error?: string; saved?: string }>;

/**
 * Policy-Einstellungen (/manage/einstellungen).
 *
 * Hier stehen NUR Werte, die eine fachliche Rolle besitzt und ohne
 * Auslieferung ändern können soll — heute die Aufbewahrungsfrist, die der
 * Datenschutzbeauftragte final abnimmt. Deployment- und Integrationswerte
 * (Bootstrap-Flags, OIDC-Claim-Namen, Secrets) bleiben bewusst Env-Vars: sie
 * werden gebraucht, bevor die DB nutzbar ist, oder unterscheiden sich je
 * Umgebung.
 *
 * Jede Änderung schreibt eine Audit-Zeile (`setting.changed`) — der Grund,
 * warum diese Werte überhaupt in der DB und nicht in der Env liegen.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, saved } = await searchParams;
  const me = (await getCurrentUser())!;
  const caps = await resolveEffectiveCapabilities(me.id, me.role, me.roleKeys);
  if (!can(caps, "settings:manage")) {
    redirect("/manage?error=no_settings_permission");
  }

  const resolved = await getResolvedSettings();

  return (
    <>
      <Link href="/manage" className={pageStyles.backLink}>
        <ArrowLeft size={14} /> Verwaltung
      </Link>

      <header className={pageStyles.hero}>
        <div className={pageStyles.kicker}>Verwaltung</div>
        <h1 className={pageStyles.title}>Einstellungen</h1>
        <p className={pageStyles.lede}>
          Fachliche Richtwerte, die ohne Auslieferung geändert werden können.
          Jede Änderung wird protokolliert. Technische Deployment-Werte stehen
          bewusst nicht hier, sondern in der Umgebungskonfiguration.
        </p>
      </header>

      {error && (
        // Der Text kommt aus der Query und ist damit fremdbestimmt. React
        // escaped ihn; zusätzlich gekappt, damit niemand das Banner als
        // Fläche für eine lange Fremdmeldung missbraucht.
        <p className={`${styles.banner} ${styles.bannerError}`} role="alert">
          {error.slice(0, 200)}
        </p>
      )}
      {saved && !error && (
        <p className={styles.banner} role="status">
          Gespeichert. Die Änderung wurde protokolliert.
        </p>
      )}

      <ul className={styles.list}>
        {resolved.map((setting) => (
          <li key={setting.def.key} className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>{setting.def.label}</h2>
              <code className={styles.key}>{setting.def.key}</code>
            </div>

            <p className={styles.description}>{setting.def.description}</p>
            {setting.def.rationale && (
              <p className={styles.rationale}>{setting.def.rationale}</p>
            )}

            <form action={updateSettingAction} className={styles.form}>
              <input type="hidden" name="key" value={setting.def.key} />
              <label htmlFor={`v-${setting.def.key}`} className={styles.label}>
                Wert
              </label>
              <input
                id={`v-${setting.def.key}`}
                name="value"
                type="number"
                inputMode="numeric"
                defaultValue={setting.value}
                min={setting.def.min}
                max={setting.def.max}
                className={styles.input}
              />
              <span className={styles.unit}>{setting.def.unit}</span>
              <button type="submit" className="btn btn-ghost">
                Speichern
              </button>
            </form>

            <p className={styles.meta}>
              Aktuell wirksam: <strong>{setting.value}</strong>{" "}
              {setting.def.unit} ({SOURCE_LABEL[setting.source]})
              {setting.source === "db" && (
                <> · zuletzt geändert {formatDate(setting.updatedAt)}</>
              )}
              {setting.source === "env" && setting.def.envVar && (
                <>
                  {" "}
                  · <code>{setting.def.envVar}</code> ist gesetzt und gilt,
                  solange hier nichts eingetragen ist
                </>
              )}
              {" · zulässig "}
              {setting.def.min}–{setting.def.max} {setting.def.unit}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
