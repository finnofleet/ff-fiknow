/**
 * Reine Validierung/Normalisierung für Pfad-Authoring — KEINE I/O, nur
 * `import type` (zur Laufzeit gelöscht). Damit unit-testbar ohne Payload/DB,
 * gleiches Muster wie lib/paths-progress-compute.ts.
 *
 * Aufrufer (lib/authoring/lifecycle.ts.upsertLearningPath) reicht die Liste der
 * bekannten Kurs-Slugs (`listManagedCourses`) rein; diese Funktion entscheidet
 * rein deterministisch, ob der Input gültig ist und wie er normalisiert wird.
 */
import type { Fuehrungsgrad, PathRole } from "../paths";

const SLUG_RE = /^[a-z0-9-]+$/;
const ROLES: PathRole[] = ["required", "recommended", "optional"];
const FUEHRUNGSGRADE: Fuehrungsgrad[] = ["linear", "lose"];

export type PathCourseInputRaw = {
  courseSlug: string;
  role?: string;
};

export type PathInputRaw = {
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  fuehrungsgrad: string;
  courses: PathCourseInputRaw[];
};

export type NormalizedPathInput = {
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  fuehrungsgrad: Fuehrungsgrad;
  courses: { courseSlug: string; role: PathRole }[];
};

export type ValidationResult =
  | { ok: true; value: NormalizedPathInput }
  | { ok: false; errors: string[] };

/**
 * Validiert + normalisiert einen Pfad-Input gegen die bekannten Kurs-Slugs.
 * Dedupliziert doppelte Kurse (erstes Vorkommen gewinnt, behält Reihenfolge).
 * Unbekannte Kurs-Slugs sind ein Fehler (Tippfehlerschutz). Draft-Kurse dürfen
 * referenziert werden — sie müssen nur als Slug existieren.
 */
export function validatePathInput(
  input: PathInputRaw,
  knownCourseSlugs: Iterable<string>,
): ValidationResult {
  const errors: string[] = [];
  const known = new Set(knownCourseSlugs);

  const slug = (input.slug ?? "").trim();
  if (!SLUG_RE.test(slug)) {
    errors.push(`Ungültiger Slug "${input.slug}" — erlaubt: ^[a-z0-9-]+$.`);
  }

  const title = (input.title ?? "").trim();
  if (title.length === 0) errors.push("Titel darf nicht leer sein.");

  if (!FUEHRUNGSGRADE.includes(input.fuehrungsgrad as Fuehrungsgrad)) {
    errors.push(
      `Ungültiger fuehrungsgrad "${input.fuehrungsgrad}" — erlaubt: ${FUEHRUNGSGRADE.join(", ")}.`,
    );
  }

  const rawCourses = Array.isArray(input.courses) ? input.courses : [];
  if (rawCourses.length === 0) {
    errors.push("Ein Pfad braucht mindestens einen Kurs.");
  }

  const seen = new Set<string>();
  const courses: { courseSlug: string; role: PathRole }[] = [];
  const unknown: string[] = [];
  for (const c of rawCourses) {
    const cs = (c?.courseSlug ?? "").trim();
    if (cs.length === 0) {
      errors.push("Kurs-Eintrag ohne courseSlug.");
      continue;
    }
    const role = (c.role ?? "required") as PathRole;
    if (!ROLES.includes(role)) {
      errors.push(`Ungültige Rolle "${c.role}" bei "${cs}" — erlaubt: ${ROLES.join(", ")}.`);
      continue;
    }
    if (seen.has(cs)) continue; // Dedupe — erstes Vorkommen gewinnt
    seen.add(cs);
    if (!known.has(cs)) unknown.push(cs);
    courses.push({ courseSlug: cs, role });
  }

  if (unknown.length > 0) {
    errors.push(`Unbekannte Kurs-Slugs: ${unknown.join(", ")}.`);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      slug,
      title,
      subtitle: input.subtitle?.trim() || undefined,
      description: input.description?.trim() || undefined,
      fuehrungsgrad: input.fuehrungsgrad as Fuehrungsgrad,
      courses,
    },
  };
}
