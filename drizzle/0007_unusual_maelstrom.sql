CREATE TABLE "training_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"course_slug" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"course_title_snapshot" text,
	"course_version_snapshot" text,
	"cycle" integer DEFAULT 1 NOT NULL,
	"evidence" jsonb
);
--> statement-breakpoint
ALTER TABLE "training_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "training_assignments_user_idx" ON "training_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "training_assignments_course_slug_idx" ON "training_assignments" USING btree ("course_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "training_assignments_unique_cycle_idx" ON "training_assignments" USING btree ("user_id","source_type","source_id","cycle");--> statement-breakpoint
CREATE POLICY "training_assignments_select_own" ON "training_assignments" AS PERMISSIVE FOR SELECT TO public USING (auth.uid() = user_id);--> statement-breakpoint
CREATE POLICY "training_assignments_select_staff" ON "training_assignments" AS PERMISSIVE FOR SELECT TO public USING (auth.role() in ('curator', 'admin'));