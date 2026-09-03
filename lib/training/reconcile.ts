/**
 * Reconciler für Pflichtkurse (ADR 0005, Entscheidung 1: "eine Wahrheit, zwei
 * Eingänge"). Liest beide autoritativen Quellen —
 *
 *   - `courses.mandatory`         (Toggle, sourceType='course_mandatory')
 *   - `training-requirements`     (Payload-Collection, sourceType='requirement')
 *
 * — und materialisiert daraus `training_assignments`-Zeilen (Drizzle) über
 * denselben Pfad. Alle Inserts laufen mit `onConflictDoNothing` auf dem
 * Unique-Index `(user_id, source_type, source_id, cycle)` — der Reconciler
 * ist dadurch beliebig oft wiederholbar (idempotent), auch bei
 * Teil-Fehlschlägen.
 *
 * Läuft über die privilegierte Server-`db`-Connection (RLS-Bypass, siehe
 * lib/db/schema.ts training_assignments-Policies) und den Payload
 * Local-API-Client (`overrideAccess: true`, weil dies ein Systemvorgang ist,
 * kein User-Request).
 */
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getPayload, type Where } from "payload";
import config from "@payload-config";

import { normalizeRole, type Role } from "@/lib/auth/roles";
import { db } from "@/lib/db/client";
import { enrollments, profiles, trainingAssignments } from "@/lib/db/schema";

import { computeDueDate, isRecertDue, type DueRule } from "./due-date";
import { passesEntityScope, scopeValues } from "./entity-scope";

// ============================================================
// Payload-Singleton (Muster wie lib/content.ts / lib/paths.ts)
// ============================================================

let _payloadPromise: ReturnType<typeof getPayload> | null = null;
function payload() {
  if (!_payloadPromise) _payloadPromise = getPayload({ config });
  return _payloadPromise;
}

// ============================================================
// Interne Typen (Payload-Docs, minimal getypt)
// ============================================================

type CourseDoc = {
  slug?: string | null;
  mandatory?: boolean | null;
};

type RequirementTargetUserEntry = { userId?: string | null };
type RequirementTargetLandEntry = { land?: string | null };
type RequirementTargetBuEntry = { bu?: string | null };

type RequirementTarget = {
  type?: "role" | "user" | null;
  role?: string | null;
  userIds?: RequirementTargetUserEntry[] | null;
  landScope?: RequirementTargetLandEntry[] | null;
  buScope?: RequirementTargetBuEntry[] | null;
};

type RequirementDueRule = {
  type?: "ab_start" | "ab_zuweisung" | "fixes_datum" | null;
  offsetDays?: number | null;
  fixedDate?: string | null;
};

type RequirementDoc = {
  id: string | number;
  courseSlug?: string | null;
  target?: RequirementTarget | null;
  dueRule?: RequirementDueRule | null;
  recurrenceMonths?: number | null;
  active?: boolean | null;
};

type ProfileRow = {
  userId: string;
  role: string;
  /** Vollstaendige Rollen-Menge (`completeRoleKeys`) — Basis des Ziel-Matchs. */
  roleKeys: string[] | null;
  land: string | null;
  bu: string | null;
};

type AssignmentInsert = {
  sourceType: string;
  sourceId: string;
  userId: string;
  courseSlug: string;
  assignedAt: Date;
  dueDate: Date | null;
  cycle: number;
};

// Lockere UUID-Prüfung (OIDC/Keycloak-sub-UUIDs) — für die Requirement-Zielgruppe
// "Einzelne User" und für reconcileForUser(userId).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// Payload-Reads
// ============================================================

async function fetchMandatoryCourseSlugs(): Promise<string[]> {
  const p = await payload();
  const result = await p.find({
    collection: "courses",
    where: { mandatory: { equals: true } },
    limit: 1000,
    overrideAccess: true,
  });
  return (result.docs as CourseDoc[])
    .map((d) => d.slug)
    .filter((s): s is string => Boolean(s));
}

async function fetchCourseMandatoryFlag(courseSlug: string): Promise<boolean> {
  const p = await payload();
  const result = await p.find({
    collection: "courses",
    where: { slug: { equals: courseSlug } },
    limit: 1,
    overrideAccess: true,
  });
  const doc = result.docs[0] as CourseDoc | undefined;
  return Boolean(doc?.mandatory);
}

async function fetchActiveRequirements(
  courseSlug?: string,
): Promise<RequirementDoc[]> {
  const p = await payload();
  const where: Where = courseSlug
    ? {
        and: [
          { active: { equals: true } },
          { courseSlug: { equals: courseSlug } },
        ],
      }
    : { active: { equals: true } };
  const result = await p.find({
    collection: "training-requirements",
    where,
    limit: 1000,
    overrideAccess: true,
  });
  return result.docs as RequirementDoc[];
}

// ============================================================
// Profile-Reads + Zielgruppen-Auflösung
// ============================================================

async function fetchAllProfiles(): Promise<ProfileRow[]> {
  return db
    .select({
      userId: profiles.userId,
      role: profiles.role,
      roleKeys: profiles.roleKeys,
      land: profiles.land,
      bu: profiles.bu,
    })
    .from(profiles);
}

/** "Alle nicht-gesperrten Profile" (Toggle-Zielgruppe) — defensiv via normalizeRole. */
function nonSuspendedUserIds(rows: ProfileRow[]): string[] {
  return rows
    .filter((r) => normalizeRole(r.role) !== "suspended")
    .map((r) => r.userId);
}

function roleTargetUserIds(rows: ProfileRow[], role: Role): string[] {
  // MENGEN-ZUGEHÖRIGKEIT statt Rangvergleich (löst ADR 0011 ab): trifft zu,
  // wer den Ziel-Key in `profiles.role_keys` trägt. Die fachliche Aussage von
  // ADR 0011 bleibt exakt erhalten, sie steckt jetzt in der Key-Menge selbst
  // (`completeRoleKeys`): jede Person trägt implizit `learner`, ein Admin
  // zusätzlich `curator`. Ein learner-Ziel erfasst damit weiterhin ALLE
  // aktiven Personen — der Punkt, an dem seinerzeit ein Kurator fälschlich
  // durchs Raster fiel.
  //
  // `suspended` fliegt weiterhin raus, und zwar an der Quelle: für ein
  // gesperrtes Konto setzt `completeRoleKeys` gar keine Rollen-Keys.
  return rows
    .filter(
      (r) =>
        normalizeRole(r.role) !== "suspended" &&
        (r.roleKeys ?? []).includes(role),
    )
    .map((r) => r.userId);
}

/**
 * Validiert die explizite User-ID-Liste einer Requirement-Zielgruppe.
 * Ungültige UUIDs werden übersprungen + geloggt (Report ist v1 nur der
 * console.warn — ein UI-Report ist nicht Teil dieser Phase).
 */
function explicitUserTargetIds(
  entries: RequirementTargetUserEntry[] | null | undefined,
  context: string,
): string[] {
  const ids: string[] = [];
  for (const entry of entries ?? []) {
    const id = entry.userId?.trim();
    if (!id) continue;
    if (UUID_RE.test(id)) {
      ids.push(id);
    } else {
      console.warn(
        `[training/reconcile] Ungültige User-ID "${id}" in ${context} übersprungen.`,
      );
    }
  }
  return ids;
}

/**
 * Löst die Zielgruppe einer Requirement gegen die übergebene Profile-Menge
 * auf. Für `type==='role'` wird `target.role` HIERARCHISCH gematcht (via
 * `roleMeetsTarget`: „diese Rolle ODER höher", siehe lib/auth/roles) — ein
 * learner-Ziel erfasst also auch Kurator:innen/Admins. `target.role` selbst ist
 * ein kuratierter Enum-Wert aus dem Payload-Select (kein rohes DB-Rollenfeld,
 * daher kein normalizeRole darauf); fehlt/ist ungültig, wird die Requirement
 * übersprungen + geloggt.
 *
 * Land/BU-Scope (ADR 0007 §4) filtert die so ermittelte Basis-Zielmenge
 * zusätzlich (UND) — additiv und verhaltensneutral: sind beide Scopes leer,
 * wird die Basis-Zielmenge unverändert zurückgegeben (identisch zum
 * Vor-P2a-Verhalten, kein Profil-Lookup nötig).
 */
function resolveRequirementTargetUserIds(
  requirement: RequirementDoc,
  candidateProfiles: ProfileRow[],
): string[] {
  const target = requirement.target;
  if (!target?.type) return [];

  let baseUserIds: string[];
  if (target.type === "role") {
    if (
      target.role !== "learner" &&
      target.role !== "curator" &&
      target.role !== "admin"
    ) {
      console.warn(
        `[training/reconcile] Requirement ${requirement.id}: Zielgruppe-Typ ` +
          "'role' ohne gültige Rolle, übersprungen.",
      );
      return [];
    }
    baseUserIds = roleTargetUserIds(candidateProfiles, target.role);
  } else if (target.type === "user") {
    baseUserIds = explicitUserTargetIds(
      target.userIds,
      `Requirement ${requirement.id}`,
    );
  } else {
    return [];
  }

  const landScope = scopeValues(target.landScope, "land");
  const buScope = scopeValues(target.buScope, "bu");
  if (landScope.length === 0 && buScope.length === 0) return baseUserIds;

  const profileByUserId = new Map(
    candidateProfiles.map((p) => [p.userId, p] as const),
  );
  return baseUserIds.filter((userId) => {
    const profile = profileByUserId.get(userId);
    if (!profile) return false;
    return passesEntityScope(profile, landScope, buScope);
  });
}

function requirementTargetsUser(
  requirement: RequirementDoc,
  userId: string,
  soloProfile: ProfileRow[],
): boolean {
  return resolveRequirementTargetUserIds(requirement, soloProfile).includes(
    userId,
  );
}

function normalizeDueRule(raw: RequirementDoc["dueRule"]): DueRule {
  return {
    type: raw?.type ?? "ab_zuweisung",
    offsetDays: raw?.offsetDays ?? null,
    fixedDate: raw?.fixedDate ?? null,
  };
}

// ============================================================
// Enrollments-Lookup (für "ab_start"-Fristen)
// ============================================================

async function fetchStartedAtMap(
  courseSlug: string,
  userIds: string[],
): Promise<Map<string, Date | null>> {
  const map = new Map<string, Date | null>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select({ userId: enrollments.userId, startedAt: enrollments.startedAt })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseSlug, courseSlug),
        inArray(enrollments.userId, userIds),
      ),
    );
  for (const row of rows) map.set(row.userId, row.startedAt);
  return map;
}

// ============================================================
// Insert (idempotent via onConflictDoNothing)
// ============================================================

async function insertAssignments(rows: AssignmentInsert[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(trainingAssignments)
    .values(rows)
    .onConflictDoNothing({
      target: [
        trainingAssignments.userId,
        trainingAssignments.sourceType,
        trainingAssignments.sourceId,
        trainingAssignments.cycle,
      ],
    });
}

// ============================================================
// Toggle-Quelle
// ============================================================

async function reconcileToggleForCourse(
  courseSlug: string,
  targetUserIds: string[],
  now: Date,
): Promise<void> {
  const rows: AssignmentInsert[] = targetUserIds.map((userId) => ({
    sourceType: "course_mandatory",
    sourceId: courseSlug,
    userId,
    courseSlug,
    assignedAt: now,
    // Toggle hat in v1 keine Frist (ADR 0005 §1).
    dueDate: null,
    cycle: 1,
  }));
  await insertAssignments(rows);
}

// ============================================================
// Requirement-Quelle — Zyklus 1
// ============================================================

async function reconcileRequirementCycle1(
  requirement: RequirementDoc,
  targetUserIds: string[],
  now: Date,
): Promise<void> {
  const courseSlug = requirement.courseSlug?.trim();
  if (!courseSlug || targetUserIds.length === 0) return;

  const dueRule = normalizeDueRule(requirement.dueRule);
  const startedAtMap = await fetchStartedAtMap(courseSlug, targetUserIds);

  const rows: AssignmentInsert[] = targetUserIds.map((userId) => ({
    sourceType: "requirement",
    sourceId: String(requirement.id),
    userId,
    courseSlug,
    assignedAt: now,
    dueDate: computeDueDate(dueRule, {
      assignedAt: now,
      startedAt: startedAtMap.get(userId) ?? null,
    }),
    cycle: 1,
  }));
  await insertAssignments(rows);
}

// ============================================================
// Requirement-Quelle — lazy Rezertifizierung
// ============================================================

/**
 * Findet je User die höchste ABGESCHLOSSENE Zyklus-Zeile für eine Requirement
 * und materialisiert bei Fälligkeit den nächsten Zyklus. Existiert bereits
 * eine (nicht abgeschlossene) Folgezeile, no-opt `onConflictDoNothing` sauber
 * — keine Doppel-Zuweisung.
 *
 * `onlyUserId` scoped die Prüfung auf einen einzelnen User (reconcileForUser).
 */
async function reconcileRequirementRecert(
  requirement: RequirementDoc,
  now: Date,
  onlyUserId?: string,
): Promise<void> {
  const recurrenceMonths = requirement.recurrenceMonths ?? 0;
  if (recurrenceMonths <= 0) return;

  const courseSlug = requirement.courseSlug?.trim();
  if (!courseSlug) return;

  const sourceId = String(requirement.id);
  const whereClauses = [
    eq(trainingAssignments.sourceType, "requirement"),
    eq(trainingAssignments.sourceId, sourceId),
    isNotNull(trainingAssignments.completedAt),
  ];
  if (onlyUserId) whereClauses.push(eq(trainingAssignments.userId, onlyUserId));

  const latestCompleted = await db
    .selectDistinctOn([trainingAssignments.userId], {
      userId: trainingAssignments.userId,
      cycle: trainingAssignments.cycle,
      completedAt: trainingAssignments.completedAt,
    })
    .from(trainingAssignments)
    .where(and(...whereClauses))
    .orderBy(trainingAssignments.userId, desc(trainingAssignments.cycle));

  const due = latestCompleted.filter(
    (row): row is typeof row & { completedAt: Date } =>
      row.completedAt != null &&
      isRecertDue(row.completedAt, recurrenceMonths, now),
  );
  if (due.length === 0) return;

  const dueRule = normalizeDueRule(requirement.dueRule);
  const startedAtMap = await fetchStartedAtMap(
    courseSlug,
    due.map((r) => r.userId),
  );

  const rows: AssignmentInsert[] = due.map((row) => ({
    sourceType: "requirement",
    sourceId,
    userId: row.userId,
    courseSlug,
    assignedAt: now,
    dueDate: computeDueDate(dueRule, {
      assignedAt: now,
      startedAt: startedAtMap.get(row.userId) ?? null,
    }),
    cycle: row.cycle + 1,
  }));
  await insertAssignments(rows);
}

// ============================================================
// Öffentliche API
// ============================================================

/** Reconcilet Toggle + Requirements für EINEN Kurs (afterChange-Hooks). */
export async function reconcileForCourse(courseSlug: string): Promise<void> {
  const slug = courseSlug?.trim();
  if (!slug) return;
  const now = new Date();

  const [isMandatory, requirements, allProfiles] = await Promise.all([
    fetchCourseMandatoryFlag(slug),
    fetchActiveRequirements(slug),
    fetchAllProfiles(),
  ]);

  if (isMandatory) {
    await reconcileToggleForCourse(slug, nonSuspendedUserIds(allProfiles), now);
  }

  for (const requirement of requirements) {
    const targetUserIds = resolveRequirementTargetUserIds(
      requirement,
      allProfiles,
    );
    await reconcileRequirementCycle1(requirement, targetUserIds, now);
    await reconcileRequirementRecert(requirement, now);
  }
}

/** Reconcilet alle Pflichten für EINEN User (lazy Nutzung, Phase 3). */
export async function reconcileForUser(userId: string): Promise<void> {
  if (!UUID_RE.test(userId)) {
    console.warn(
      `[training/reconcile] Ungültige User-ID "${userId}" für reconcileForUser übersprungen.`,
    );
    return;
  }
  const now = new Date();

  const [profileRows, mandatorySlugs, requirements] = await Promise.all([
    db
      .select({
        userId: profiles.userId,
        role: profiles.role,
        roleKeys: profiles.roleKeys,
        land: profiles.land,
        bu: profiles.bu,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId)),
    fetchMandatoryCourseSlugs(),
    fetchActiveRequirements(),
  ]);
  const profileRow = profileRows[0];
  const soloProfile = profileRow ? [profileRow] : [];

  if (profileRow && normalizeRole(profileRow.role) !== "suspended") {
    for (const slug of mandatorySlugs) {
      await reconcileToggleForCourse(slug, [userId], now);
    }
  }

  for (const requirement of requirements) {
    if (requirementTargetsUser(requirement, userId, soloProfile)) {
      await reconcileRequirementCycle1(requirement, [userId], now);
    }
    await reconcileRequirementRecert(requirement, now, userId);
  }
}

/** Voller Lauf: alle mandatory-Kurse + alle aktiven Requirements. */
export async function reconcileAssignments(): Promise<void> {
  const now = new Date();

  const [mandatorySlugs, requirements, allProfiles] = await Promise.all([
    fetchMandatoryCourseSlugs(),
    fetchActiveRequirements(),
    fetchAllProfiles(),
  ]);

  const toggleTargets = nonSuspendedUserIds(allProfiles);
  for (const slug of mandatorySlugs) {
    await reconcileToggleForCourse(slug, toggleTargets, now);
  }

  for (const requirement of requirements) {
    const targetUserIds = resolveRequirementTargetUserIds(
      requirement,
      allProfiles,
    );
    await reconcileRequirementCycle1(requirement, targetUserIds, now);
    await reconcileRequirementRecert(requirement, now);
  }
}
