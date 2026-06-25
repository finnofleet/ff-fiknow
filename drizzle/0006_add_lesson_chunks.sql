CREATE TABLE "course_index_state" (
	"course_slug" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"status" text NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_index_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lesson_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_slug" text NOT NULL,
	"section_slug" text NOT NULL,
	"lesson_slug" text NOT NULL,
	"version" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"heading" text,
	"content" text NOT NULL,
	"embedding" real[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "lesson_chunks_course_version_idx" ON "lesson_chunks" USING btree ("course_slug","version");