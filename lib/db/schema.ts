import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Drizzle-Schema für USER-DATEN (Profile, Enrollments, Progress, Quiz).
 *
 * Content (Courses, Sections, Lessons, Media) lebt seit Phase 2 in
 * Payload CMS unter dem Postgres-Schema "payload" — siehe payload.config.ts
 * und payload/collections/.
 *
 * Die slug-Spalten in enrollments / lesson_progress / quiz_attempts sind
 * nominelle Referenzen auf Payload-Records (kein DB-FK), weil Payload und
 * Drizzle sich kein Schema teilen. Konsistenz wird Application-seitig
 * sichergestellt.
 *
 * RLS-Policies sind first-class hier deklariert, damit `drizzle-kit push`
 * sie als Owner sieht und nicht versehentlich droppt. auth.uid()/auth.role()
 * werden inline von lib/db/auto-migrate.ts angelegt und hier per raw SQL
 * referenziert.
 */

const ownsRow = sql`auth.uid() = user_id`;

/**
 * Curator/Admin-Bypass für Policies, die Staff über die eigenen Zeilen hinaus
 * lesen lassen sollen (ADR 0005, `training_assignments`). Nutzt `auth.role()`
 * — dieselbe JWT-Claim-Helper-Funktion wie `auth.uid()` (siehe
 * lib/db/auto-migrate.ts), hier zum ersten Mal in einer Policy referenziert.
 * Kein Bestandsmuster existierte dafür bisher (bisherige Tabellen sind reine
 * Owner-Policies; Staff-Zugriff lief bislang ausschließlich über die
 * privilegierte Server-`db`-Connection).
 */
const isStaffRole = sql`auth.role() in ('curator', 'admin')`;

/**
 * Profil pro Auth-User (OIDC/Keycloak-sub). Wir verlassen uns nicht auf auth.users-FK,
 * weil diese in einem anderen Schema liegt — RLS-Policies referenzieren
 * auth.uid() direkt.
 *
 * `role`-Werte (siehe lib/auth/roles.ts für Permission-Helpers):
 *   - `learner`    Standard, kann Kurse besuchen
 *   - `curator`    + kann Kurse importieren/publishen (was vorher `editor` war)
 *   - `admin`      + kann Nutzer-Rollen verwalten
 *   - `suspended`  Soft-Ban, keinerlei Berechtigungen
 *
 * `editor` als Legacy-Wert wird vom Code als Curator behandelt — bei
 * Gelegenheit per `UPDATE profiles SET role='curator' WHERE role='editor'`
 * normalisieren.
 */
export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id").primaryKey(),
    displayName: text("display_name"),
    role: text("role").notNull().default("learner"),
    /**
     * Aktuelle Land-/BU-Zugehörigkeit der Person (ADR 0007 §3),
     * app-befüllbar (Admin/Import, siehe scripts/set-user-entity.ts).
     * `null` = unbekannt/nicht gesetzt.
     */
    land: text("land"),
    bu: text("bu"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [
    pgPolicy("profiles_select_own", { for: "select", using: ownsRow }),
    pgPolicy("profiles_update_own", { for: "update", using: ownsRow }),
  ],
).enableRLS();

export const enrollments = pgTable(
  "enrollments",
  {
    userId: uuid("user_id").notNull(),
    courseSlug: text("course_slug").notNull(),
    // Zwei getrennte Ereignisse (bewusst NICHT konflatiert):
    //   enrolled_at = Einschreibung / Zuweisung (Zeile entsteht)
    //   started_at  = tatsaechlicher Lernbeginn (erste Lektion geoeffnet)
    // Ein "eingeschrieben, aber noch nicht gestartet"-Zustand hat daher
    // started_at = NULL. Das Compliance-„Startdatum" liest started_at.
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.courseSlug] }),
    pgPolicy("enrollments_select_own", { for: "select", using: ownsRow }),
    pgPolicy("enrollments_insert_own", {
      for: "insert",
      withCheck: ownsRow,
    }),
    pgPolicy("enrollments_update_own", { for: "update", using: ownsRow }),
    pgPolicy("enrollments_delete_own", { for: "delete", using: ownsRow }),
  ],
).enableRLS();

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: uuid("user_id").notNull(),
    courseSlug: text("course_slug").notNull(),
    sectionSlug: text("section_slug").notNull(),
    lessonSlug: text("lesson_slug").notNull(),
    status: text("status").notNull().default("in_progress"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /**
     * Eingefrorener Seed der Fragen-Pool-Ziehung fuer Abschlusstests (Bug-Fix:
     * `seed = randomUUID()` bei jedem Render reshuffelte die gezogenen Fragen
     * bei jedem Reload und verfaelschte die Zuordnung der Antworten). `null` =
     * noch nicht gezogen ODER nach explizitem "Neuer Versuch" zurueckgesetzt
     * (siehe `resetExamSeed`/`ensureExamSeed` in lib/progress.ts). Nur fuer
     * Pool-Abschlusstests relevant; bei allen anderen Lesson-Typen bleibt die
     * Spalte `null`.
     */
    examSeed: text("exam_seed"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [t.userId, t.courseSlug, t.sectionSlug, t.lessonSlug],
    }),
    pgPolicy("progress_select_own", { for: "select", using: ownsRow }),
    pgPolicy("progress_insert_own", {
      for: "insert",
      withCheck: ownsRow,
    }),
    pgPolicy("progress_update_own", { for: "update", using: ownsRow }),
  ],
).enableRLS();

/**
 * Scoped Course-Authoring-Token (ADR 0001, Sicherheits-Anforderung 5).
 *
 * Der Plugin-/CLI-Client authentifiziert die Authoring-Endpoints (import,
 * export, publish) über einen Bearer-Token statt das Browser-Session-Cookie
 * oder den Service-Key. Eigenschaften: nur auf Authoring gescoped (die Rolle
 * des Besitzers wird bei JEDER Nutzung frisch geprüft, kein eingebackenes
 * Admin-Recht), widerrufbar (`revoked_at`), kurze TTL (`expires_at`).
 *
 * NIE den Klartext speichern — nur `token_hash` (SHA-256 hex). Der Klartext
 * wird einmalig bei der Erstellung zurückgegeben. Da der Token 256 Bit
 * Entropie hat (kein Passwort), ist ein schneller Hash korrekt.
 *
 * `.enableRLS()` OHNE Policies = für die Browser-Rollen (anon/authenticated)
 * komplett unsichtbar; nur die serverseitige `db`-Connection (Postgres-Owner,
 * RLS-Bypass) liest/schreibt. Tokens werden nie direkt vom Client abgefragt.
 *
 * `user_id` ist eine nominelle Referenz auf profiles.user_id (kein DB-FK,
 * analog zu den slug-Referenzen oben).
 */
export const authoringTokens = pgTable(
  "authoring_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
).enableRLS();

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull(),
    courseSlug: text("course_slug").notNull(),
    sectionSlug: text("section_slug").notNull(),
    lessonSlug: text("lesson_slug").notNull(),
    answers: jsonb("answers").notNull(),
    score: real("score").notNull(),
    passed: boolean("passed").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [
    pgPolicy("attempts_select_own", { for: "select", using: ownsRow }),
    pgPolicy("attempts_insert_own", {
      for: "insert",
      withCheck: ownsRow,
    }),
  ],
).enableRLS();

/**
 * Annotations-Schicht (ADR 0002) — das gemeinsame Primitiv hinter Markierung,
 * Notiz und Tutor-Erklärung: eine User-Auswahl, verankert an einer Stelle im
 * geteilten, unveränderlichen Content (MDX-Bundle).
 *
 * Geteilter Content (für alle gleich) + benutzer-spezifisches Overlay
 * (Annotationen, pro User) — wie Kindle-Highlights / Google-Docs-Kommentare.
 * RLS-Policies stellen sicher, dass jeder nur seine eigenen sieht/schreibt; die
 * serverseitige `db`-Connection (Owner, RLS-Bypass) scopet zusätzlich
 * application-seitig auf `user_id` (Defense-in-Depth, analog progress.ts).
 *
 * Anchoring (robust gegen Anchor-Drift bei Bundle-Neu-Upload, ADR 0001):
 *   - `anchor_quote` + `anchor_prefix`/`anchor_suffix` = primärer text-quote-Anker
 *     (markiertes Zitat + Kontext, wie Hypothes.is). Übersteht Verschiebungen.
 *   - `anchor_start`/`anchor_end` = text-position-Fallback (schnell, aber driftet).
 *   - `bundle_version` = gegen welche Course-Version verankert wurde (`course.version`).
 *     Driftet die Position, wird über das Zitat neu lokalisiert; sonst „verwaist"
 *     die Annotation sauber (Liste statt falsch inline) statt falsch zu zeigen.
 *
 * `type`:
 *   - `highlight`            Markierung (nur `color`, kein `body`)
 *   - `note`                 User-Notiz (`body` = Notiztext)
 *   - `tutor_explanation`    gespeicherte Tutor-Antwort (`body` = Markdown)
 *   - `flashcard`            späterer Slice (Spaced Repetition)
 *
 * slug-Spalten sind nominelle Referenzen auf Payload-Records (kein DB-FK),
 * konsistent mit lesson_progress / quiz_attempts.
 */
export const annotations = pgTable(
  "annotations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull(),
    courseSlug: text("course_slug").notNull(),
    sectionSlug: text("section_slug").notNull(),
    lessonSlug: text("lesson_slug").notNull(),
    bundleVersion: text("bundle_version"),
    type: text("type").notNull(),
    anchorQuote: text("anchor_quote"),
    anchorPrefix: text("anchor_prefix"),
    anchorSuffix: text("anchor_suffix"),
    anchorStart: integer("anchor_start"),
    anchorEnd: integer("anchor_end"),
    color: text("color"),
    body: text("body"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Lade-Pfad: alle Annotationen eines Users für genau eine Lesson.
    index("annotations_user_lesson_idx").on(
      t.userId,
      t.courseSlug,
      t.sectionSlug,
      t.lessonSlug,
    ),
    pgPolicy("annotations_select_own", { for: "select", using: ownsRow }),
    pgPolicy("annotations_insert_own", { for: "insert", withCheck: ownsRow }),
    pgPolicy("annotations_update_own", { for: "update", using: ownsRow }),
    pgPolicy("annotations_delete_own", { for: "delete", using: ownsRow }),
  ],
).enableRLS();

/**
 * RAG-Index für den KI-Tutor (ADR 0003) — Embeddings der Lektions-Chunks.
 *
 * Konsistent mit ADR 0001 ist das **nur ein generierter Index über das Bundle**
 * (Bundle = Wahrheit): versions-gekeyt an `courses.version` wie der
 * Bundle-Storage. Bei neuer Version wird neu embedded; alte Chunks werden
 * beim Re-Index der neuen Version ersetzt.
 *
 * slug-Spalten sind nominelle Referenzen auf Payload-Records (kein DB-FK),
 * konsistent mit lesson_progress / annotations.
 *
 * `embedding` ist NOT NULL: Chunks werden nur geschrieben, wenn das Embedding
 * erfolgreich war (atomar pro Lesson). Schlägt der Embedding-Call fehl, wird
 * gar nichts geschrieben und der Kurs in `course_index_state` als
 * `needs_reindex` markiert — kein Halb-Index mit Null-Vektoren, der die
 * Retrieval-Query verkompliziert.
 *
 * Embedding als plain `real[]` (KEIN pgvector — die vector-Extension ist auf dem
 * Prod-Postgres nicht installierbar). Ähnlichkeitssuche läuft App-seitig
 * (Brute-Force-Cosine pro Kurs); für den v1-Scope (aktueller Kurs, ~Hunderte
 * Chunks) ist das ausreichend — ein ANN-Index (hnsw) lohnt erst bei großem,
 * kursübergreifendem Korpus. 1024 Floats = Voyage-Dim, vom Client garantiert.
 *
 * `.enableRLS()` OHNE Policies = für Browser-Rollen unsichtbar; nur die
 * serverseitige `db`-Connection (Owner, RLS-Bypass) liest/schreibt. Der Tutor
 * macht das Retrieval serverseitig.
 */
export const lessonChunks = pgTable(
  "lesson_chunks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    courseSlug: text("course_slug").notNull(),
    sectionSlug: text("section_slug").notNull(),
    lessonSlug: text("lesson_slug").notNull(),
    version: text("version").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    // Das Heading des Abschnitts, aus dem der Chunk stammt (für Quellen-
    // Verankerung in Phase 2). Null bei Pre-Heading-Inhalt.
    heading: text("heading"),
    content: text("content").notNull(),
    embedding: real("embedding").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Kein ANN-/Vektor-Index (pgvector steht nicht zur Verfügung). v1-Scope =
    // Retrieval pro Kurs → Cosine in der App über die per course+version
    // geladenen Zeilen; dieser btree bedient den Scope-Filter + das Ersetzen
    // beim Re-Index.
    index("lesson_chunks_course_version_idx").on(t.courseSlug, t.version),
  ],
).enableRLS();

/**
 * Index-Status pro Kurs (ADR 0003) — der „needs-reindex"-Marker.
 *
 * Eine Zeile pro Kurs (PK = courseSlug), hält die aktuell indexierte
 * `version` + Status. Best-effort-Indexing beim Upload schreibt hier:
 *   - `pending`        Upload lief, Indexierung läuft / steht aus
 *   - `indexed`        Chunks + Embeddings liegen für `version` vor
 *   - `needs_reindex`  Embedding-Call schlug fehl (oder kein Key) → ein
 *                      Re-Index-Trigger/Backfill holt es nach
 *
 * Drizzle-owned statt einer Payload-Collection-Spalte: hält die RAG-Infra in
 * einem Schema und vermeidet eine Cross-Schema-Kopplung in Phase 1.
 */
export const courseIndexState = pgTable(
  "course_index_state",
  {
    courseSlug: text("course_slug").primaryKey(),
    version: text("version").notNull(),
    status: text("status").notNull(),
    chunkCount: integer("chunk_count").notNull().default(0),
    error: text("error"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
).enableRLS();

/**
 * Pflichtkurse & Compliance-Nachweis (ADR 0005) — append-only Audit-Trail.
 *
 * Eine Zeile pro User × Pflicht × Zyklus. `sourceType`/`sourceId` sagen,
 * WARUM die Zeile existiert:
 *   - `course_mandatory`  Kurs-Toggle `courses.mandatory` (sourceId = courseSlug)
 *   - `requirement`       Payload-Collection `training-requirements`
 *                         (sourceId = deren Doc-ID)
 *
 * Nie überschrieben, nie gelöscht: `completedAt` wird EINMAL beim Abschluss
 * gesetzt (Phase 2, lib/progress.ts) und danach nie wieder verändert. Jede
 * Rezertifizierung ist eine NEUE Zeile mit `cycle + 1`, nicht ein Update der
 * bestehenden — die Historie ("2024 gemacht, 2026 wiederholt") fällt so
 * automatisch ab. Diese Tabelle IST der Audit-Trail.
 *
 * Kein gespeichertes `status`: wird beim Lesen abgeleitet (`completedAt`
 * gesetzt → erledigt; sonst `dueDate < now()` → überfällig; sonst offen).
 * Reconcile/Completion-Trigger folgen erst in Phase 2 — hier nur Schema.
 *
 * `courseTitleSnapshot`/`courseVersionSnapshot` werden beim Abschluss
 * eingefroren (Content-Snapshot, ADR 0005 §2), damit der Nachweis eine
 * spätere Umbenennung/Inhaltsänderung/Löschung des Kurses übersteht. Bis
 * dahin NULL.
 *
 * `userId`/`courseSlug` sind nominelle Referenzen (kein DB-FK), konsistent
 * mit lesson_progress/enrollments/annotations.
 *
 * RLS: Owner sieht eigene Zeilen; Curator/Admin sehen alle Zeilen
 * (`isStaffRole`). KEINE Insert/Update/Delete-Policies: Assignments werden
 * ausschließlich vom Reconciler/Completion-Trigger (Phase 2) über die
 * privilegierte Server-`db`-Connection geschrieben (Postgres-Owner,
 * RLS-Bypass — analog `authoring_tokens`/`lesson_chunks`), nie direkt vom
 * Client. Das macht "append-only" auch auf Policy-Ebene wahr.
 *
 * Unique-Constraint `(user_id, source_type, source_id, cycle)` verhindert
 * Doppel-Zuweisung pro Zyklus (der Phase-2-Reconciler kann damit idempotent
 * per Upsert/ON-CONFLICT arbeiten).
 */
export const trainingAssignments = pgTable(
  "training_assignments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    userId: uuid("user_id").notNull(),
    courseSlug: text("course_slug").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    courseTitleSnapshot: text("course_title_snapshot"),
    courseVersionSnapshot: text("course_version_snapshot"),
    /**
     * Land/BU der Person, eingefroren beim Abschluss (analog
     * `courseVersionSnapshot`, ADR 0007 §3) — unveränderlicher Fakt.
     * `null` bei offenen Assignments oder wenn die Person keine
     * Zugehörigkeit gesetzt hat.
     */
    landSnapshot: text("land_snapshot"),
    buSnapshot: text("bu_snapshot"),
    cycle: integer("cycle").notNull().default(1),
    evidence: jsonb("evidence"),
  },
  (t) => [
    index("training_assignments_user_idx").on(t.userId),
    index("training_assignments_course_slug_idx").on(t.courseSlug),
    uniqueIndex("training_assignments_unique_cycle_idx").on(
      t.userId,
      t.sourceType,
      t.sourceId,
      t.cycle,
    ),
    pgPolicy("training_assignments_select_own", {
      for: "select",
      using: ownsRow,
    }),
    pgPolicy("training_assignments_select_staff", {
      for: "select",
      using: isStaffRole,
    }),
  ],
).enableRLS();

/**
 * Audit-Protokoll des fristbasierten Retention-Purge (ADR 0006, Phase 7c —
 * Teil „Retention"). Eine Zeile pro Lauf des Retention-Cron
 * (`scripts/retention-purge.ts`). Bewusst **PII-frei**: nur Aggregat
 * (Cutoff, Frist, gelöschte Anzahl, Dry-Run-Flag) — belegt die DSGVO-
 * Rechenschaftspflicht (Art. 5 Abs. 2), *dass* fristgerecht gelöscht wird,
 * ohne selbst personenbezogene Daten anzuhäufen. Überlebt Pod-Log-Rotation.
 * Append-only im Betrieb; die Tabelle selbst enthält keine Nutzerdaten und
 * unterliegt daher keiner eigenen Löschfrist.
 */
export const retentionPurgeRuns = pgTable(
  "retention_purge_runs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
    /** Stichtag: Zeilen mit `completed_at <= cutoff_date` waren löschreif. */
    cutoffDate: timestamp("cutoff_date", { withTimezone: true }).notNull(),
    /** Verwendete Aufbewahrungsfrist in Jahren (aus `FINKNOW_RETENTION_YEARS`). */
    retentionYears: integer("retention_years").notNull(),
    /** True: Lauf war ein Dry-Run (nichts gelöscht, nur gezählt). */
    dryRun: boolean("dry_run").notNull(),
    /** Anzahl tatsächlich (bzw. bei Dry-Run: hypothetisch) gelöschter Zeilen. */
    deletedCount: integer("deleted_count").notNull(),
  },
  (t) => [
    index("retention_purge_runs_ran_at_idx").on(t.ranAt),
    pgPolicy("retention_purge_runs_select_staff", {
      for: "select",
      using: isStaffRole,
    }),
  ],
).enableRLS();

/**
 * Rechte-Achse (ADR 0007, Phase P1) — Fundament für additive Rollen + feste
 * Capabilities. Drei Tabellen:
 *
 *   - `roles`             frei benennbare Rollen (§2), P1 nur die zwei
 *                         System-Rollen `curator`/`admin` (`is_system`).
 *   - `role_capabilities` editierbare Rollen×Capability-Matrix (§2).
 *   - `role_assignments`  additive Zuweisung Rolle→User inkl. vorbereiteter
 *                         (in P1 ungenutzter) Scope-Spalten (§3).
 *
 * `SYSTEM_ROLE_CAPABILITIES` (`lib/auth/capabilities.ts`) ist die Single
 * Source of Truth, aus der `scripts/seed-system-roles.ts` `roles` +
 * `role_capabilities` befüllt. Zur Laufzeit werden diese Tabellen in P1
 * NOCH NICHT gelesen — die Permission-Checks laufen weiterhin über den
 * Compat-Shim `capabilitiesForLegacyRole` aus der bestehenden Single-Role in
 * `profiles.role` (ADR 0007 §10 — App-seitige Durchsetzung vorerst,
 * DB-Tabellen sind das Fundament für eine spätere admin-editierbare Matrix).
 *
 * Keine Foreign Keys (konsistent mit dem Rest dieser Datei): `user_id` ist
 * überall eine nominelle Referenz, und Payload/Drizzle teilen sich kein
 * Schema. Nur Select-Policies (Staff-Bypass, analog `retention_purge_runs`)
 * — Schreiben läuft ausschließlich über die privilegierte Server-
 * `db`-Connection (Seed/Admin-UI, spätere Phase), nie direkt vom Client.
 */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Stabiler Slug, z. B. `curator` — worüber `capabilitiesForRoleKeys` matcht. */
    key: text("key").notNull().unique(),
    label: text("label").notNull(),
    description: text("description"),
    /** True für die zwei System-Rollen (`curator`/`admin`) — nicht löschbar/umbenennbar in der UI. */
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [
    pgPolicy("roles_select_staff", { for: "select", using: isStaffRole }),
  ],
).enableRLS();

export const roleCapabilities = pgTable(
  "role_capabilities",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    roleId: uuid("role_id").notNull(),
    /**
     * `text`, nicht das `Capability`-Union aus `lib/auth/capabilities.ts` —
     * eine DB-Spalte kann keine TS-Union erzwingen; die Code-Ebene bleibt
     * die durchsetzende Instanz (siehe Datei-Kopfkommentar dort).
     */
    capability: text("capability").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("role_capabilities_unique_idx").on(t.roleId, t.capability),
    pgPolicy("role_capabilities_select_staff", {
      for: "select",
      using: isStaffRole,
    }),
  ],
).enableRLS();

/**
 * Additive Zuweisung Rolle→User: eine Person kann mehrere Zeilen halten,
 * effektive Capabilities/Scope sind die Vereinigung (ADR 0007 §2/§3).
 * `scopeLand`/`scopeBu` sind die vorbereiteten Scope-Dimensionen —
 * `null` bedeutet „keine Einschränkung = alle" (§3). In P1 ungenutzt (nur
 * Rechte-Achse gebaut); Scope-Auswertung (UND über Dimensionen, ODER über
 * Zuweisungen) folgt in P2.
 */
export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull(),
    roleId: uuid("role_id").notNull(),
    scopeLand: text("scope_land").array(),
    scopeBu: text("scope_bu").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("role_assignments_user_idx").on(t.userId),
    index("role_assignments_role_idx").on(t.roleId),
    pgPolicy("role_assignments_select_staff", {
      for: "select",
      using: isStaffRole,
    }),
  ],
).enableRLS();

/**
 * Append-only Audit-Log (ADR 0007 §11). Haelt fest, DASS und von WEM etwas
 * geschah — NICht den Dateninhalt. PII-arm analog `retention_purge_runs`:
 * nur Akteur-ID + Rollen-Momentaufnahme, Aktion, Ziel (Typ+ID), optionaler
 * Land/BU-Kontext, Quelle, Zeitstempel. KEIN Payload/Rohdaten-Feld — bewusst
 * keine jsonb-Spalte, damit hier nichts Sensibles landen kann.
 *
 * Append-only auf Policy-Ebene: NUR eine select-Policy (isStaffRole), KEINE
 * insert/update/delete-Policy — geschrieben wird ausschliesslich ueber die
 * privilegierte Server-`db`-Connection (RLS-Bypass), nie vom Client. Die feine
 * Leseberechtigung (`audit:view`, ADR 0007 §2) erzwingt der App-Code.
 *
 * Retention (ADR 0006): audit_log ist als Klasse A (nachweisnah) vorgesehen —
 * ueberlebt den User-Austritt (der Audit-Trail ist der Zweck). Die endgueltige
 * Datenklasse + Zeit-Purge-Verdrahtung ist DSB-offen (siehe
 * lib/privacy/data-classes.ts).
 */
/**
 * Generierter Index über die Frage-Blöcke des Bundles (ADR 0009), versions-
 * gekeyt; kein personenbezogener Datensatz (analog lesson_chunks — NICHT in
 * data-classes.ts). Wird beim Upload ganzer-Kurs-ersetzt.
 *
 * Fragen sind (ADR 0009) first-class Bundle-Blöcke unter `questions/<slug>.mdx`
 * (autor-vergebener, stabiler `question_slug` — analog Lesson-Slugs, NICHT die
 * generierte `id`-Spalte). `options` speichert je Option Label (MDX-Fragment,
 * gehärtet wie inline-Options) + `correct`-Flag als jsonb, weil die Options
 * KEINE eigene relationale Identität brauchen (sie leben nur zusammen mit der
 * Frage, keine eigenständige Referenz von außen).
 *
 * `.enableRLS()` OHNE Policies = wie `lesson_chunks`: für Browser-Rollen
 * unsichtbar, nur die serverseitige `db`-Connection (Owner, RLS-Bypass) liest/
 * schreibt.
 */
export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    courseSlug: text("course_slug").notNull(),
    version: text("version").notNull(),
    questionSlug: text("question_slug").notNull(), // Autor-Slug (stabiler Ref-Key)
    prompt: text("prompt").notNull(),
    type: text("type").notNull(), // "single" | "multi"
    options: jsonb("options").notNull(), // [{ label: string(MDX), correct: boolean }]
    explanation: text("explanation"),
    tags: text("tags").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("questions_course_version_slug_idx").on(
      t.courseSlug,
      t.version,
      t.questionSlug,
    ),
    index("questions_course_version_idx").on(t.courseSlug, t.version),
    // Wie lesson_chunks: enableRLS OHNE Policies — nur Server-Connection liest/schreibt.
  ],
).enableRLS();

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Akteur (userId); null bei System/Cron/CLI ohne eingeloggten User. */
    actorUserId: uuid("actor_user_id"),
    /** Legacy-Rollen-Momentaufnahme zum Zeitpunkt der Aktion (z. B. "curator"). */
    actorRole: text("actor_role"),
    /** Kanonische Aktion, Konvention `<domain>.<verb>` (z. B. "reindex.run"). */
    action: text("action").notNull(),
    /** Zieltyp (z. B. "course", "user", "role_assignment"), optional. */
    targetType: text("target_type"),
    /** Ziel-ID/Slug, optional. */
    targetId: text("target_id"),
    /** Optionaler Land-Kontext. */
    land: text("land"),
    /** Optionaler BU-Kontext. */
    bu: text("bu"),
    /** Herkunft der Aktion: "session" | "authoring-token" | "cli" | "system". */
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_created_at_idx").on(t.createdAt),
    index("audit_log_actor_idx").on(t.actorUserId),
    pgPolicy("audit_log_select_staff", { for: "select", using: isStaffRole }),
  ],
).enableRLS();
