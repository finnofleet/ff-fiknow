CREATE TABLE "retention_purge_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cutoff_date" timestamp with time zone NOT NULL,
	"retention_years" integer NOT NULL,
	"dry_run" boolean NOT NULL,
	"deleted_count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retention_purge_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "retention_purge_runs_ran_at_idx" ON "retention_purge_runs" USING btree ("ran_at");--> statement-breakpoint
CREATE POLICY "retention_purge_runs_select_staff" ON "retention_purge_runs" AS PERMISSIVE FOR SELECT TO public USING (auth.role() in ('curator', 'admin'));