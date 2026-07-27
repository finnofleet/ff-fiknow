import pkg from "@/package.json";

/**
 * Zentrale Quelle für „welcher Build läuft hier?" — konsumiert von
 * `/version` (app/(frontend)/version/route.ts) und dem `/manage`-Footer
 * (app/(frontend)/manage/layout.tsx).
 *
 * - `version`: package.json-Version wird zur Buildzeit über den JSON-Import
 *   ins Bundle inlined (Next.js/TypeScript unterstützt das nativ via
 *   `resolveJsonModule`, siehe tsconfig.json) — keine Laufzeit-Env nötig,
 *   kann also nie von der tatsächlich gebauten Version abweichen. Ein
 *   optionales `APP_VERSION`-Env kann das übersteuern (z. B. für Hotfix-Tags
 *   ohne package.json-Bump).
 * - `commit`: kommt aus `GIT_COMMIT`, das der Dockerfile-Runner-Stage per
 *   `ARG GIT_COMMIT` + `ENV GIT_COMMIT=$GIT_COMMIT` setzt. Der Wert muss beim
 *   `docker build` als `--build-arg GIT_COMMIT=<short-sha>` mitgegeben werden
 *   (im CI z. B. `github.sha`, gekürzt). Ohne Build-Arg: "unknown".
 * - `builtAt`: analog über `BUILD_TIME` (`--build-arg BUILD_TIME=<ISO-8601>`).
 *   Ohne Build-Arg: "unknown".
 *
 * Enthält bewusst keine weiteren Build-/Env-Details — keine Secrets, keine
 * internen Hostnamen o. Ä.
 */
export interface AppVersionInfo {
  version: string;
  commit: string;
  builtAt: string;
}

const FALLBACK_VERSION = pkg.version ?? "0.0.0";

export function getAppVersion(): AppVersionInfo {
  return {
    version: process.env.APP_VERSION?.trim() || FALLBACK_VERSION,
    commit: process.env.GIT_COMMIT?.trim() || "unknown",
    builtAt: process.env.BUILD_TIME?.trim() || "unknown",
  };
}
