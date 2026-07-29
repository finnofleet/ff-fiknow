CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_slug" text NOT NULL,
	"version" text NOT NULL,
	"question_slug" text NOT NULL,
	"prompt" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb NOT NULL,
	"explanation" text,
	"tags" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "questions_course_version_slug_idx" ON "questions" USING btree ("course_slug","version","question_slug");--> statement-breakpoint
CREATE INDEX "questions_course_version_idx" ON "questions" USING btree ("course_slug","version");