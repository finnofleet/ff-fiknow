import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_training_requirements_target_type" AS ENUM('role', 'user');
  CREATE TYPE "payload"."enum_training_requirements_target_role" AS ENUM('learner', 'curator', 'admin');
  CREATE TYPE "payload"."enum_training_requirements_due_rule_type" AS ENUM('ab_start', 'ab_zuweisung', 'fixes_datum');
  CREATE TABLE "payload"."training_requirements_target_user_ids" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"user_id" varchar
  );
  
  CREATE TABLE "payload"."training_requirements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"course_slug" varchar NOT NULL,
  	"target_type" "payload"."enum_training_requirements_target_type" DEFAULT 'role' NOT NULL,
  	"target_role" "payload"."enum_training_requirements_target_role",
  	"due_rule_type" "payload"."enum_training_requirements_due_rule_type" DEFAULT 'ab_zuweisung' NOT NULL,
  	"due_rule_offset_days" numeric,
  	"due_rule_fixed_date" timestamp(3) with time zone,
  	"recurrence_months" numeric DEFAULT 0,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."courses" ADD COLUMN "mandatory" boolean;
  ALTER TABLE "payload"."_courses_v" ADD COLUMN "version_mandatory" boolean;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "training_requirements_id" integer;
  ALTER TABLE "payload"."training_requirements_target_user_ids" ADD CONSTRAINT "training_requirements_target_user_ids_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."training_requirements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "training_requirements_target_user_ids_order_idx" ON "payload"."training_requirements_target_user_ids" USING btree ("_order");
  CREATE INDEX "training_requirements_target_user_ids_parent_id_idx" ON "payload"."training_requirements_target_user_ids" USING btree ("_parent_id");
  CREATE INDEX "training_requirements_updated_at_idx" ON "payload"."training_requirements" USING btree ("updated_at");
  CREATE INDEX "training_requirements_created_at_idx" ON "payload"."training_requirements" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_training_requirements_fk" FOREIGN KEY ("training_requirements_id") REFERENCES "payload"."training_requirements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_training_requirements_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("training_requirements_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."training_requirements_target_user_ids" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."training_requirements" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."training_requirements_target_user_ids" CASCADE;
  DROP TABLE "payload"."training_requirements" CASCADE;
  -- IF EXISTS: der vorherige DROP TABLE ... CASCADE entfernt diese FK-Constraint
  -- bereits mit; ohne IF EXISTS scheitert der Down-Batch hier ("does not exist").
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_training_requirements_fk";

  DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_training_requirements_id_idx";
  ALTER TABLE "payload"."courses" DROP COLUMN "mandatory";
  ALTER TABLE "payload"."_courses_v" DROP COLUMN "version_mandatory";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "training_requirements_id";
  DROP TYPE "payload"."enum_training_requirements_target_type";
  DROP TYPE "payload"."enum_training_requirements_target_role";
  DROP TYPE "payload"."enum_training_requirements_due_rule_type";`)
}
