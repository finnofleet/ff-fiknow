import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_courses_compliance_drivers" AS ENUM('eu_ai_act', 'iso_42001', 'iso_27001', 'dsg_dsgvo', 'security_awareness', 'arbeitsrecht', 'branchenspezifisch', 'sonstige');
  CREATE TYPE "payload"."enum__courses_v_version_compliance_drivers" AS ENUM('eu_ai_act', 'iso_42001', 'iso_27001', 'dsg_dsgvo', 'security_awareness', 'arbeitsrecht', 'branchenspezifisch', 'sonstige');
  CREATE TABLE "payload"."courses_compliance_drivers" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_courses_compliance_drivers",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "payload"."_courses_v_version_compliance_drivers" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum__courses_v_version_compliance_drivers",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "payload"."courses" ADD COLUMN "assessment_required" boolean;
  ALTER TABLE "payload"."courses" ADD COLUMN "confirmation_required" boolean;
  ALTER TABLE "payload"."_courses_v" ADD COLUMN "version_assessment_required" boolean;
  ALTER TABLE "payload"."_courses_v" ADD COLUMN "version_confirmation_required" boolean;
  ALTER TABLE "payload"."courses_compliance_drivers" ADD CONSTRAINT "courses_compliance_drivers_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_courses_v_version_compliance_drivers" ADD CONSTRAINT "_courses_v_version_compliance_drivers_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_courses_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "courses_compliance_drivers_order_idx" ON "payload"."courses_compliance_drivers" USING btree ("order");
  CREATE INDEX "courses_compliance_drivers_parent_idx" ON "payload"."courses_compliance_drivers" USING btree ("parent_id");
  CREATE INDEX "_courses_v_version_compliance_drivers_order_idx" ON "payload"."_courses_v_version_compliance_drivers" USING btree ("order");
  CREATE INDEX "_courses_v_version_compliance_drivers_parent_idx" ON "payload"."_courses_v_version_compliance_drivers" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."courses_compliance_drivers" CASCADE;
  DROP TABLE "payload"."_courses_v_version_compliance_drivers" CASCADE;
  ALTER TABLE "payload"."courses" DROP COLUMN "assessment_required";
  ALTER TABLE "payload"."courses" DROP COLUMN "confirmation_required";
  ALTER TABLE "payload"."_courses_v" DROP COLUMN "version_assessment_required";
  ALTER TABLE "payload"."_courses_v" DROP COLUMN "version_confirmation_required";
  DROP TYPE "payload"."enum_courses_compliance_drivers";
  DROP TYPE "payload"."enum__courses_v_version_compliance_drivers";`)
}
