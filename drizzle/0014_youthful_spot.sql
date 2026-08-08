ALTER TABLE "enrollments" ALTER COLUMN "started_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "enrollments" ALTER COLUMN "started_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "enrolled_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Backfill: Bestandszeilen entstanden im alten Modell beim „Start" (started_at
-- = defaultNow bei Insert). Der beste verfügbare Proxy für den Einschreibe-
-- Zeitpunkt ist dieser Wert — sonst bekämen alle Altzeilen fälschlich die
-- Migrations-Laufzeit als enrolled_at.
UPDATE "enrollments" SET "enrolled_at" = "started_at" WHERE "started_at" IS NOT NULL;