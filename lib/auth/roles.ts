/**
 * Zentrale Role-Definitionen (Normalisierung + Anzeige).
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
 * ADR 0007 (abgeschlossen): dieses Modul trifft KEINE Rechteentscheidungen
 * mehr. Berechtigungen kommen ausschliesslich aus der Capability-Schicht
 * (`resolveEffectiveCapabilities` + `can`); die frueheren Wrapper
 * (`canSeeAdmin`/`canManageCourses`/`canManageUsers`) und der Rang
 * (`ROLE_RANK`/`roleMeetsTarget`) sind entfallen — siehe die ENTFALLEN-Notiz
 * weiter unten. Uebrig bleiben Normalisierung, Anzeige-Labels und die zwei
 * Zustands-Praedikate `canLearn`/`isSuspended`.
 */

export type Role = "learner" | "curator" | "admin" | "suspended";

export const ALL_ROLES: Role[] = ["learner", "curator", "admin", "suspended"];

/**
 * Liest einen Role-String-Wert aus der DB sicher in unseren Role-Type um.
 * Unbekannte Werte (Tippfehler etc.) und `null` werden zu `learner`
 * — defensive default, niemals zufällig Admin-Rechte vergeben.
 *
 * Der Legacy-Wert `editor` (aus der Zeit vor Keycloak) wird hier NICHT mehr
 * abgefangen: der Initializer `normalize-legacy-roles` schreibt ihn beim Boot
 * auf `curator` um, bevor irgendetwas ihn liest. Der Code-Zweig war die
 * Dauer-Kompensation für Daten, die einmalig zu bereinigen waren.
 */
export function normalizeRole(raw: string | null | undefined): Role {
  if (raw === "admin") return "admin";
  if (raw === "curator") return "curator";
  if (raw === "suspended") return "suspended";
  return "learner";
}

/*
 * ENTFALLEN: `ROLE_RANK` und `roleMeetsTarget`.
 *
 * Beide bildeten eine TOTALE Ordnung über die Rollen („diese Rolle ODER
 * höher") — brauchbar, solange alle Rollen ineinander liegen, aber
 * grundsätzlich unfähig, gleichrangige/orthogonale Rollen auszudrücken
 * (Compliance-Einsicht ist weder über noch unter Administration). Die
 * Ordnung war ausserdem nur an einer einzigen Stelle wirklich Ordnung:
 * beim Pflichtschulungs-Ziel.
 *
 * Ersetzt durch Mengen-Zugehörigkeit: jede Person trägt in
 * `profiles.role_keys` ihre vollständige Rollen-Menge (`completeRoleKeys` in
 * `lib/auth/role-keys.ts`) — inklusive des impliziten `learner` und der einen
 * tatsächlich geltenden Implikation `admin ⇒ curator`. Rechte wie Ziele
 * lesen dieselbe Menge. Die fachliche Aussage von ADR 0011 („wer mehr darf,
 * ist auch Lernende:r") bleibt damit erhalten, steht aber als Datum statt als
 * Zahlenvergleich.
 */

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

/*
 * ENTFALLEN: `canSeeAdmin` / `canManageCourses` / `canManageUsers`.
 *
 * Diese Wrapper prueften eine Capability, nahmen aber nur die Rang-Rolle als
 * Eingabe — die Matrix-Rollen aus dem IdP (`profiles.role_keys`) sahen sie
 * nicht. Nach dem Abschluss der Rechte-Achse (ADR 0007 §2) waere ihr
 * Weiterbestehen eine Falle: ein neuer Call-Site haette damit unbemerkt
 * WENIGER Rechte gesehen als die Person hat. Gates prueffen deshalb direkt
 * `can(caps, …)` mit `resolveEffectiveCapabilities`.
 */

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
