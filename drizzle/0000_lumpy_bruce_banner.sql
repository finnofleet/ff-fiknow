-- Baseline-Migration: idempotent gemacht für DBs die schon Tabellen
-- haben (db:push-Ära vor diesem Commit). Neue Future-Migrationen werden
-- von drizzle-kit normal generiert (ALTER TABLE etc., einzeln versioniert
-- über __drizzle_migrations).

CREATE TABLE IF NOT EXISTS "enrollments" (
	"user_id" uuid NOT NULL,
	"course_slug" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "enrollments_user_id_course_slug_pk" PRIMARY KEY("user_id","course_slug")
);
--> statement-breakpoint
ALTER TABLE "enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "lesson_progress" (
	"user_id" uuid NOT NULL,
	"course_slug" text NOT NULL,
	"section_slug" text NOT NULL,
	"lesson_slug" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_progress_user_id_course_slug_section_slug_lesson_slug_pk" PRIMARY KEY("user_id","course_slug","section_slug","lesson_slug")
);
--> statement-breakpoint
ALTER TABLE "lesson_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"role" text DEFAULT 'learner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_slug" text NOT NULL,
	"section_slug" text NOT NULL,
	"lesson_slug" text NOT NULL,
	"answers" jsonb NOT NULL,
	"score" real NOT NULL,
	"passed" boolean NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Policies: idempotent via DROP+CREATE. Postgres-Versionen vor 16 kennen
-- kein `CREATE POLICY IF NOT EXISTS`.

DROP POLICY IF EXISTS "enrollments_select_own" ON "enrollments";
CREATE POLICY "enrollments_select_own" ON "enrollments" AS PERMISSIVE FOR SELECT TO public USING (auth.uid() = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "enrollments_insert_own" ON "enrollments";
CREATE POLICY "enrollments_insert_own" ON "enrollments" AS PERMISSIVE FOR INSERT TO public WITH CHECK (auth.uid() = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "enrollments_update_own" ON "enrollments";
CREATE POLICY "enrollments_update_own" ON "enrollments" AS PERMISSIVE FOR UPDATE TO public USING (auth.uid() = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "enrollments_delete_own" ON "enrollments";
CREATE POLICY "enrollments_delete_own" ON "enrollments" AS PERMISSIVE FOR DELETE TO public USING (auth.uid() = user_id);--> statement-breakpoint

DROP POLICY IF EXISTS "progress_select_own" ON "lesson_progress";
CREATE POLICY "progress_select_own" ON "lesson_progress" AS PERMISSIVE FOR SELECT TO public USING (auth.uid() = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "progress_insert_own" ON "lesson_progress";
CREATE POLICY "progress_insert_own" ON "lesson_progress" AS PERMISSIVE FOR INSERT TO public WITH CHECK (auth.uid() = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "progress_update_own" ON "lesson_progress";
CREATE POLICY "progress_update_own" ON "lesson_progress" AS PERMISSIVE FOR UPDATE TO public USING (auth.uid() = user_id);--> statement-breakpoint

DROP POLICY IF EXISTS "profiles_select_own" ON "profiles";
CREATE POLICY "profiles_select_own" ON "profiles" AS PERMISSIVE FOR SELECT TO public USING (auth.uid() = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "profiles_update_own" ON "profiles";
CREATE POLICY "profiles_update_own" ON "profiles" AS PERMISSIVE FOR UPDATE TO public USING (auth.uid() = user_id);--> statement-breakpoint

DROP POLICY IF EXISTS "attempts_select_own" ON "quiz_attempts";
CREATE POLICY "attempts_select_own" ON "quiz_attempts" AS PERMISSIVE FOR SELECT TO public USING (auth.uid() = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "attempts_insert_own" ON "quiz_attempts";
CREATE POLICY "attempts_insert_own" ON "quiz_attempts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
