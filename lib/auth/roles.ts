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
 */

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

// ============================================================
// Permission-Checks — eine Funktion pro Capability, NICHT pro Rolle.
// Wer das prüfen will, fragt die Capability ab, nicht die Rolle direkt.
// Damit kann sich das Rollen-Modell ändern, ohne dass alle Call-Sites
// angepasst werden müssen.
// ============================================================

export function isSuspended(role: Role): boolean {
  return role === "suspended";
}

/** Darf Lektionen besuchen, Quiz machen, Fortschritt tracken. */
export function canLearn(role: Role): boolean {
  return role !== "suspended";
}

/** Darf den Admin-Bereich überhaupt sehen (egal welche Aktionen). */
export function canSeeAdmin(role: Role): boolean {
  return role === "curator" || role === "admin";
}

/** Darf Kurs-Bundles hochladen + publishen. */
export function canManageCourses(role: Role): boolean {
  return role === "curator" || role === "admin";
}

/** Darf Nutzer:innen verwalten (Rolle ändern, sperren). */
export function canManageUsers(role: Role): boolean {
  return role === "admin";
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
