/**
 * Validiert einen `next`-Redirect-Pfad gegen Open-Redirect-Angriffe.
 *
 * Erlaubt sind nur relative Pfade, die:
 *   - mit `/` beginnen (kein externer Link)
 *   - NICHT mit `//` beginnen (sonst: protokoll-relativer Redirect auf
 *     fremde Domain, z. B. `//evil.com`)
 *   - als URL parsebar sind (kein Malformed-Input)
 *
 * Bei jedem Verstoß wird `/dashboard` zurückgegeben.
 *
 * Verwendung:
 *   import { safeNextPath } from "@/lib/auth/safe-next";
 *   const target = safeNextPath(searchParams.get("next") ?? "");
 */
export function safeNextPath(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  try {
    const url = new URL(raw, "https://dummy");
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}
