/**
 * Zentrale Role-Definitionen + Permission-Helpers.
 *
 * Drei aktive Rollen, plus ein Status:
 *
 *   - `learner`    Standard. Kann Kurse besuchen + Fortschritt tracken.
 *   - `curator`    Kann Kurse importieren + publishen. Kein User-Mgmt.
 *   - `admin`      Curator-Rechte + kann andere Nutzer:innen verwalten
 *                  (Rolle ändern, sperren).
 *   - `suspended`  Soft-Ban. Kann sich einloggen, hat aber keinerlei
 *                  Berechtigungen — auch Lerner-Funktionen sind blockiert.
 *                  Reversibel durch Admin (Rolle zurück auf `learner`).
 *
 * Backward-Compat: alter Wert `editor` wird als Curator behandelt, damit
 * Bestands-DB-Einträge ohne Migration weiterfunktionieren. Bei Gelegenheit
 * sollte `UPDATE profiles SET role='curator' WHERE role='editor'` laufen.
 *
 * ADR 0007 (Phase P1): die Permission-Checks unten delegieren intern an die
 * Capability-Schicht (`lib/auth/capabilities.ts`) via
 * `capabilitiesForLegacyRole` — Signaturen und Verhalten bleiben identisch,
 * nur die Herleitung läuft jetzt über Capabilities statt harter
 * `role === "…"`-Vergleiche. Das ist der erste Schritt Richtung additive
 * Rollen + feste Capabilities; Call-Sites ändern sich nicht.
 */
import { can, capabilitiesForLegacyRole } from "./capabilities";

export type Role = "learner" | "curator" | "admin" | "suspended";

export const ALL_ROLES: Role[] = ["learner", "curator", "admin", "suspended"];

/**
 * Liest eine Role-String-Wert aus DB sicher in unseren Role-Type um.
 * Unbekannte Werte (Tippfehler etc.) und `null` werden zu `learner`
 * — defensive default, niemals zufällig Admin-Rechte vergeben.
 *
 * `editor` wird auf `curator` gemappt (Legacy-Name).
 */
export function normalizeRole(raw: string | null | undefined): Role {
  if (raw === "admin") return "admin";
  if (raw === "curator" || raw === "editor") return "curator";
  if (raw === "suspended") return "suspended";
  return "learner";
}

/**
 * Rollen-Rang — die EINZIGE explizite Quelle der Rollen-Hierarchie. Eine höhere
 * Rolle schließt die niedrigere ein: für das Pflichtschulungs-Targeting zählt
 * ein Admin/Kurator damit auch als Lernende:r. `suspended` steht bewusst UNTER
 * `learner` (Deny-all-Status) und erfüllt daher kein Rollen-Ziel.
 *
 * ⚠️ BEKANNTE GRENZE (Multi-Rollen-Modell, siehe ADR 0007 + Multi-Rollen-Notiz): Dies
 * ist ein LINEARES Modell. Es kann KEINE gleichrangigen/orthogonalen Rollen
 * ausdrücken (zwei fachliche Rollen ohne Über-/Unterordnung). Sobald solche
 * Rollen kommen, greift `roleMeetsTarget` nicht mehr sinnvoll — dann braucht es
 * ein additives Multi-Rollen-Modell (Mitgliedschaft in einer Rollen-MENGE statt
 * eines einzelnen Rangs). Bis dahin bewusst linear.
 */
export const ROLE_RANK: Record<Role, number> = {
  suspended: -1,
  learner: 0,
  curator: 1,
  admin: 2,
};

/**
 * Erfüllt `userRole` ein Rollen-Ziel `targetRole`? Hierarchisch — „diese Rolle
 * ODER höher". Macht die vorher implizite Annahme explizit („wer mehr darf, ist
 * auch Lernende:r"), an der genau dieses Missverständnis entstand. `suspended`
 * erfüllt nie ein Ziel.
 */
export function roleMeetsTarget(userRole: Role, targetRole: Role): boolean {
  if (userRole === "suspended") return false;
  return ROLE_RANK[userRole] >= ROLE_RANK[targetRole];
}

// ============================================================
// Permission-Checks — eine Funktion pro Capability, NICHT pro Rolle.
// Wer das prüfen will, fragt die Capability ab, nicht die Rolle direkt.
// Damit kann sich das Rollen-Modell ändern, ohne dass alle Call-Sites
// angepasst werden müssen.
// ============================================================

export function isSuspended(role: Role): boolean {
  return role === "suspended";
}

/**
 * Darf Lektionen besuchen, Quiz machen, Fortschritt tracken.
 *
 * Bleibt bewusst ein direkter Status-Check statt einer Capability-Ableitung:
 * „lernen dürfen" ist kein gewährtes Recht, sondern der implizite
 * Grundzustand, den nur `suspended` (Deny-all-Status) aufhebt (ADR 0007 §2).
 */
export function canLearn(role: Role): boolean {
  return role !== "suspended";
}

/** Darf den Admin-Bereich überhaupt sehen (egal welche Aktionen). */
export function canSeeAdmin(role: Role): boolean {
  return can(capabilitiesForLegacyRole(role), "courses:manage");
}

/** Darf Kurs-Bundles hochladen + publishen. */
export function canManageCourses(role: Role): boolean {
  return can(capabilitiesForLegacyRole(role), "courses:manage");
}

/** Darf Nutzer:innen verwalten (Rolle ändern, sperren). */
export function canManageUsers(role: Role): boolean {
  return can(capabilitiesForLegacyRole(role), "users:manage");
}

// ============================================================
// Human-readable Labels — für UI-Anzeige + Logs
// ============================================================

export const ROLE_LABEL: Record<Role, string> = {
  learner: "Lernend",
  curator: "Kurator:in",
  admin: "Admin",
  suspended: "Gesperrt",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  learner: "Standard-Konto. Kann Kurse besuchen + Fortschritt tracken.",
  curator: "Kann Kurse hochladen und veröffentlichen.",
  admin: "Kann zusätzlich Nutzer:innen verwalten und Rollen vergeben.",
  suspended: "Konto ist gesperrt. Hat keinerlei Berechtigungen.",
};
