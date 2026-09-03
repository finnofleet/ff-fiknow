"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { can } from "@/lib/auth/capabilities";
import { resolveEffectiveCapabilities } from "@/lib/auth/effective-capabilities";
import { getCurrentUser } from "@/lib/auth/session";
import { setSettingValue } from "@/lib/settings/store";

/**
 * Server-Action der Policy-Einstellungen (/manage/einstellungen).
 *
 * Auth-Check PRO ACTION, nicht nur im Layout: eine Server-Action ist ein
 * eigener POST-Endpunkt gegen die Seite und durchläuft die Page-Auth NICHT —
 * jede Action ist ein untrusted entry point (Next-Doku „Server Actions →
 * Security"). Gleiches Muster wie manage/courses/actions.ts.
 *
 * Rückgabe ist bewusst `void`: `<form action={…}>` akzeptiert nur
 * `void | Promise<void>`. Rückmeldung läuft daher über einen Redirect mit
 * Query-Parameter — dieselbe Mechanik, die der /manage-Bereich schon für
 * `?error=` nutzt, und ohne Client-Komponente.
 */
const PAGE = "/manage/einstellungen";

function back(params: Record<string, string>): never {
  const query = new URLSearchParams(params).toString();
  // `redirect` wirft eine Control-Flow-Exception — danach läuft nichts mehr.
  redirect(`${PAGE}?${query}`);
}

export async function updateSettingAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) back({ error: "Nicht eingeloggt." });

  const caps = await resolveEffectiveCapabilities(
    user.id,
    user.role,
    user.roleKeys,
  );
  if (!can(caps, "settings:manage")) {
    back({ error: "Keine Berechtigung für Einstellungen." });
  }

  const key = formData.get("key");
  const value = formData.get("value");
  if (typeof key !== "string" || typeof value !== "string") {
    back({ error: "Unvollständige Eingabe." });
  }

  try {
    await setSettingValue(key as string, value as string, {
      userId: user.id,
      role: user.role,
    });
  } catch (err) {
    // Die Meldung aus `setSettingValue` ist für die bedienende Person
    // gedacht (Grenzen, „keine Zahl") und darf durchgereicht werden.
    back({
      error: err instanceof Error ? err.message : "Speichern fehlgeschlagen.",
    });
  }

  // Revalidieren VOR dem Redirect, damit das Ziel den frischen Wert zeigt
  // (Next-Doku, „Server Actions").
  revalidatePath(PAGE);
  back({ saved: key as string });
}
