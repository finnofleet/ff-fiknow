/**
 * E2E-Seed-Skript — läuft als eigener `tsx`-Subprozess (aus global-setup.ts)
 * gegen die frisch migrierte E2E-Postgres-Instanz.
 *
 * Legt an:
 *   - 1 Kurator (Cora), 4 Lerner (Dana/Enno/Pia/Nino), 1 gesperrter User
 *   - 1 Pflichtkurs (Course → Section → Lesson) über die Payload Local-API
 *   - 1 training-requirement (Rolle=Lerner)
 *   - Reconcile + individuelle Fortschritts-/Abschluss-States pro Lerner
 *   - storageState-Cookie-Dateien für die Playwright-Projekte (learner/curator)
 *
 * WICHTIG: läuft mit `cwd` = Repo-Root (siehe global-setup.ts), damit die
 * `@/*` / `@payload-config` Pfad-Aliase auflösen.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import config from "@payload-config";
import { getPayload } from "payload";

import { db } from "@/lib/db/client";
import {
  enrollments,
  lessonProgress,
  profiles,
  roleAssignments,
  roleCapabilities,
  roles,
} from "@/lib/db/schema";
import { SESSION_COOKIE, signSession } from "@/lib/auth/provider/oidc/session";
import { markLessonCompleted } from "@/lib/progress";
import { reconcileAssignments } from "@/lib/training/reconcile";
import { syncCourseCompletion } from "@/lib/training/completion";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG = "[e2e/seed]";
function log(msg: string) {
  console.log(`${LOG} ${msg}`);
}

// ============================================================
// Fixed UUIDs (deterministic — the DB container is recreated every run)
// ============================================================
const CORA_ID = "11111111-1111-1111-1111-111111111111"; // curator
const DANA_ID = "22222222-2222-2222-2222-222222222222"; // learner — completed
const ENNO_ID = "33333333-3333-3333-3333-333333333333"; // learner — started (enrollment)
const PIA_ID = "44444444-4444-4444-4444-444444444444"; // learner — started (lesson_progress)
const NINO_ID = "55555555-5555-5555-5555-555555555555"; // learner — untouched (open)
const SUSPENDED_ID = "66666666-6666-6666-6666-666666666666"; // suspended

// --- ADR 0007 P2b/P3 — Rechte-/Scope-e2e ------------------------------------
// Zusaetzliche CH-Lerner, damit der CH-Bucket die k-Anon-Schwelle (5) erreicht
// und in der Aggregat-Sicht mit echten Zahlen (statt "< 5") erscheint.
// CH-Kohorte = Dana + Enno + diese drei = 5; DE-Kohorte = Pia + Nino = 2.
const CH_ANJA_ID = "a1a1a1a1-1111-1111-1111-111111111111"; // learner CH — open
const CH_BEA_ID = "a2a2a2a2-2222-2222-2222-222222222222"; // learner CH — open
const CH_CED_ID = "a3a3a3a3-3333-3333-3333-333333333333"; // learner CH — open
// Betrachter, die per Single-Role NICHTS duerfen (learner) und ihre
// Compliance-Rechte AUSSCHLIESSLICH ueber eine role_assignment bekommen.
const RHEA_ID = "a7a7a7a7-7777-7777-7777-777777777777"; // HR regional, view-named, Scope CH
const LEON_ID = "a8a8a8a8-8888-8888-8888-888888888888"; // Leitung, nur view-aggregate, group

const HR_ROLE_ID = "b1b1b1b1-1111-1111-1111-111111111111";
const LEITUNG_ROLE_ID = "b2b2b2b2-2222-2222-2222-222222222222";

const COURSE_SLUG = "datenschutz-grundlagen";
const COURSE_TITLE = "Datenschutz-Grundlagen";
const SECTION_SLUG = "grundlagen";
const LESSON_SLUG = "was-ist-datenschutz";
const QUIZ_LESSON_SLUG = "quiz-bausteine";

/**
 * Quiz-Lesson-Body für den RSC-Grading-Regressionstest (ADR 0007-Umfeld, Bug
 * „korrekte Antwort wird als falsch gewertet"). Nutzt bewusst `correct={true}`
 * (Expression-Attribut, wie im echten Kurs) — genau die Form, die über die
 * next-mdx-remote/rsc-Grenze brach, als <Question> die Options-Props noch
 * clientseitig introspizierte. Rendert über QuizShell → MDXRemote = echter
 * RSC-Pfad (den kein Unit-Test abdeckt).
 */
const QUIZ_BODY = `# Quiz: Bausteine

<Question
  prompt="Was ist ein Repository?"
  explanation="Ein Repository ist die zentrale Ablage eines Projekts — mit allen Dateien UND der kompletten Versionshistorie."
  type="single"
>
  <Option correct={true}>Die zentrale Projekt-Ablage mit allen Dateien und der ganzen Historie</Option>
  <Option>Eine einzelne, aktuelle Datei</Option>
  <Option>Ein Backup, das einmal pro Woche erstellt wird</Option>
  <Option>Der Ordner mit allen alten Versionen</Option>
</Question>
`;

const PAYLOAD_SECRET = process.env.PAYLOAD_SECRET;
if (!PAYLOAD_SECRET || PAYLOAD_SECRET.length < 16) {
  throw new Error(
    `${LOG} PAYLOAD_SECRET fehlt oder ist zu kurz — kann keine Test-Session-Cookies signieren.`,
  );
}

async function seedProfiles(): Promise<void> {
  log("Seeding profiles …");
  await db
    .insert(profiles)
    .values([
      { userId: CORA_ID, displayName: "Cora Curator", role: "curator" },
      // Land/BU (P2a): Dana+Enno in CH, Pia+Nino in DE — Basis fuer den
      // Scope-Filter (gegen aktuelle profiles.land, ADR §3) + Aggregat-Buckets.
      { userId: DANA_ID, displayName: "Dana", role: "learner", land: "CH" },
      { userId: ENNO_ID, displayName: "Enno", role: "learner", land: "CH" },
      { userId: PIA_ID, displayName: "Pia", role: "learner", land: "DE" },
      { userId: NINO_ID, displayName: "Nino", role: "learner", land: "DE" },
      { userId: SUSPENDED_ID, displayName: "Susi Suspended", role: "suspended" },
      // Weitere CH-Lerner, damit CH die k-Anon-Schwelle 5 erreicht.
      { userId: CH_ANJA_ID, displayName: "Anja", role: "learner", land: "CH" },
      { userId: CH_BEA_ID, displayName: "Bea", role: "learner", land: "CH" },
      { userId: CH_CED_ID, displayName: "Ced", role: "learner", land: "CH" },
      // Betrachter ohne eigene Land-Zuordnung (sie lernen nicht, sie schauen).
      { userId: RHEA_ID, displayName: "Rhea Regional", role: "learner" },
      { userId: LEON_ID, displayName: "Leon Leitung", role: "learner" },
    ])
    .onConflictDoNothing();
  log("Profiles seeded.");
}

/**
 * ADR 0007 P2b/P3: Rollen + Rollen×Capability-Matrix + Scope-Zuweisungen fuer
 * die Rechte-/Sichtbarkeits-e2e. Bewusst NICHT ueber die Legacy-Rolle
 * (`profiles.role`) — Rhea/Leon sind `learner` und duerfen per Single-Role
 * NICHTS; ihre Compliance-Rechte kommen ausschliesslich aus diesen
 * `role_assignments`. Genau der Uebergang „Single-Role -> explizite Grants",
 * den die e2e durchspielt.
 */
async function seedRolesAndAssignments(): Promise<void> {
  log("Seeding roles + capabilities + scoped assignments …");
  await db
    .insert(roles)
    .values([
      {
        id: HR_ROLE_ID,
        key: "hr-regional",
        label: "HR Regional",
        description: "Namentliche Compliance-Sicht, auf ein Land begrenzt.",
        isSystem: false,
      },
      {
        id: LEITUNG_ROLE_ID,
        key: "leitung",
        label: "Leitung",
        description: "Nur aggregierte (PII-freie) Compliance-Kennzahlen.",
        isSystem: false,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(roleCapabilities)
    .values([
      { roleId: HR_ROLE_ID, capability: "compliance:view-named" },
      { roleId: HR_ROLE_ID, capability: "compliance:export" },
      { roleId: LEITUNG_ROLE_ID, capability: "compliance:view-aggregate" },
    ])
    .onConflictDoNothing();

  await db
    .insert(roleAssignments)
    .values([
      // Rhea: namentliche Sicht, NUR CH (BU offen = alle).
      { userId: RHEA_ID, roleId: HR_ROLE_ID, scopeLand: ["CH"], scopeBu: null },
      // Leon: nur Aggregat, group-level (beide Achsen null = sieht alle Laender).
      {
        userId: LEON_ID,
        roleId: LEITUNG_ROLE_ID,
        scopeLand: null,
        scopeBu: null,
      },
    ])
    .onConflictDoNothing();
  log("Roles/assignments seeded.");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedCourseContent(payload: any): Promise<void> {
  log(`Creating course "${COURSE_TITLE}" (${COURSE_SLUG}) via Payload local API …`);
  const course = await payload.create({
    collection: "courses",
    data: {
      title: COURSE_TITLE,
      slug: COURSE_SLUG,
      mandatory: true,
      _status: "published",
    },
    overrideAccess: true,
  });
  log(`Course created: id=${course.id}`);

  const section = await payload.create({
    collection: "sections",
    data: {
      title: "Grundlagen",
      slug: SECTION_SLUG,
      course: course.id,
      orderIndex: 1,
      _status: "published",
    },
    overrideAccess: true,
  });
  log(`Section created: id=${section.id}`);

  const lesson = await payload.create({
    collection: "lessons",
    data: {
      title: "Was ist Datenschutz?",
      slug: LESSON_SLUG,
      section: section.id,
      orderIndex: 1,
      type: "reading",
      body: "Kurzer MDX-Body für den E2E-Test.",
      _status: "published",
    },
    overrideAccess: true,
  });
  log(`Lesson created: id=${lesson.id}`);

  const quizLesson = await payload.create({
    collection: "lessons",
    data: {
      title: "Quiz: Bausteine",
      slug: QUIZ_LESSON_SLUG,
      section: section.id,
      orderIndex: 2,
      type: "quiz",
      body: QUIZ_BODY,
      _status: "published",
    },
    overrideAccess: true,
  });
  log(`Quiz lesson created: id=${quizLesson.id}`);

  log("Creating training-requirement (target: role=learner) …");
  const requirement = await payload.create({
    collection: "training-requirements",
    data: {
      courseSlug: COURSE_SLUG,
      target: { type: "role", role: "learner" },
      dueRule: { type: "ab_zuweisung", offsetDays: 14 },
      recurrenceMonths: 0,
      active: true,
    },
    overrideAccess: true,
  });
  log(`Training-requirement created: id=${requirement.id}`);
}

async function seedProgressStates(): Promise<void> {
  log("Reconciling assignments for all learners …");
  await reconcileAssignments();

  log("Dana → completed: markLessonCompleted + syncCourseCompletion …");
  await markLessonCompleted({
    userId: DANA_ID,
    courseSlug: COURSE_SLUG,
    sectionSlug: SECTION_SLUG,
    lessonSlug: LESSON_SLUG,
  });
  await syncCourseCompletion(DANA_ID, COURSE_SLUG);

  log("Enno → started: enrollments row …");
  await db.insert(enrollments).values({
    userId: ENNO_ID,
    courseSlug: COURSE_SLUG,
    startedAt: new Date(),
  });

  log("Pia → started: lesson_progress row (in_progress) …");
  await db.insert(lessonProgress).values({
    userId: PIA_ID,
    courseSlug: COURSE_SLUG,
    sectionSlug: SECTION_SLUG,
    lessonSlug: LESSON_SLUG,
    status: "in_progress",
  });

  log("Nino → untouched (stays 'offen').");

  // Reconcile again so Dana's completion is reflected consistently (no-op
  // for already-materialized rows, idempotent via onConflictDoNothing).
  await reconcileAssignments();
}

async function writeStorageStates(): Promise<void> {
  log("Writing storageState files (e2e/.auth/*.json) …");
  const authDir = path.resolve(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });

  const nowSec = Math.floor(Date.now() / 1000);
  const maxAgeSec = 3600;

  const learnerCookie = await signSession(
    {
      sub: DANA_ID,
      email: "dana@example.test",
      emailVerified: true,
      name: "Dana",
      role: "learner",
    },
    PAYLOAD_SECRET!,
    maxAgeSec,
  );

  const curatorCookie = await signSession(
    {
      sub: CORA_ID,
      email: "cora@example.test",
      emailVerified: true,
      name: "Cora Curator",
      role: "curator",
    },
    PAYLOAD_SECRET!,
    maxAgeSec,
  );

  // Rhea/Leon: Session-Rolle ist `learner` (Single-Role) — ihre Compliance-
  // Rechte kommen zur Laufzeit AUS den role_assignments (resolveEffectiveCapabilities).
  const rheaCookie = await signSession(
    {
      sub: RHEA_ID,
      email: "rhea@example.test",
      emailVerified: true,
      name: "Rhea Regional",
      role: "learner",
    },
    PAYLOAD_SECRET!,
    maxAgeSec,
  );

  const leonCookie = await signSession(
    {
      sub: LEON_ID,
      email: "leon@example.test",
      emailVerified: true,
      name: "Leon Leitung",
      role: "learner",
    },
    PAYLOAD_SECRET!,
    maxAgeSec,
  );

  function storageState(cookieValue: string) {
    return {
      cookies: [
        {
          name: SESSION_COOKIE,
          value: cookieValue,
          domain: "localhost",
          path: "/",
          httpOnly: true,
          secure: false,
          sameSite: "Lax" as const,
          expires: nowSec + maxAgeSec,
        },
      ],
      origins: [],
    };
  }

  writeFileSync(
    path.join(authDir, "learner.json"),
    JSON.stringify(storageState(learnerCookie), null, 2),
  );
  writeFileSync(
    path.join(authDir, "curator.json"),
    JSON.stringify(storageState(curatorCookie), null, 2),
  );
  writeFileSync(
    path.join(authDir, "rhea.json"),
    JSON.stringify(storageState(rheaCookie), null, 2),
  );
  writeFileSync(
    path.join(authDir, "leon.json"),
    JSON.stringify(storageState(leonCookie), null, 2),
  );
  log("storageState files written.");
}

async function main(): Promise<void> {
  log("=== Starting seed ===");

  await seedProfiles();

  const payload = await getPayload({ config });
  await seedCourseContent(payload);

  await seedRolesAndAssignments();

  await seedProgressStates();
  await writeStorageStates();

  log("=== Seed complete ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(`${LOG} FATAL:`, err);
  process.exit(1);
});
