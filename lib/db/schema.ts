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
 * RLS-Policies sind first-class hier deklariert (statt in setup-auth.sql),
 * damit `drizzle-kit push` sie als Owner sieht und nicht versehentlich
 * droppt. Die auth.uid()-Funktion wird vom GoTrue-Setup bereitgestellt
 * (siehe scripts/setup-auth.sql) und hier per raw SQL referenziert.
 */

const ownsRow = sql`auth.uid() = user_id`;

/**
 * Profil pro Supabase-Auth-User. Wir verlassen uns nicht auf auth.users-FK,
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
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
