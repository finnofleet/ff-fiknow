CREATE TABLE "annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_slug" text NOT NULL,
	"section_slug" text NOT NULL,
	"lesson_slug" text NOT NULL,
	"bundle_version" text,
	"type" text NOT NULL,
	"anchor_quote" text,
	"anchor_prefix" text,
	"anchor_suffix" text,
	"anchor_start" integer,
	"anchor_end" integer,
	"color" text,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "annotations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "annotations_user_lesson_idx" ON "annotations" USING btree ("user_id","course_slug","section_slug","lesson_slug");--> statement-breakpoint
CREATE POLICY "annotations_select_own" ON "annotations" AS PERMISSIVE FOR SELECT TO public USING (auth.uid() = user_id);--> statement-breakpoint
CREATE POLICY "annotations_insert_own" ON "annotations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (auth.uid() = user_id);--> statement-breakpoint
CREATE POLICY "annotations_update_own" ON "annotations" AS PERMISSIVE FOR UPDATE TO public USING (auth.uid() = user_id);--> statement-breakpoint
CREATE POLICY "annotations_delete_own" ON "annotations" AS PERMISSIVE FOR DELETE TO public USING (auth.uid() = user_id);