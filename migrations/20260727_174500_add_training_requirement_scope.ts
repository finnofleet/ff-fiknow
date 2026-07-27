import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."training_requirements_target_land_scope" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"land" varchar NOT NULL
  );
  
  CREATE TABLE "payload"."training_requirements_target_bu_scope" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"bu" varchar NOT NULL
  );
  
  ALTER TABLE "payload"."training_requirements_target_land_scope" ADD CONSTRAINT "training_requirements_target_land_scope_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."training_requirements"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."training_requirements_target_bu_scope" ADD CONSTRAINT "training_requirements_target_bu_scope_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."training_requirements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "training_requirements_target_land_scope_order_idx" ON "payload"."training_requirements_target_land_scope" USING btree ("_order");
  CREATE INDEX "training_requirements_target_land_scope_parent_id_idx" ON "payload"."training_requirements_target_land_scope" USING btree ("_parent_id");
  CREATE INDEX "training_requirements_target_bu_scope_order_idx" ON "payload"."training_requirements_target_bu_scope" USING btree ("_order");
  CREATE INDEX "training_requirements_target_bu_scope_parent_id_idx" ON "payload"."training_requirements_target_bu_scope" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."training_requirements_target_land_scope" CASCADE;
  DROP TABLE "payload"."training_requirements_target_bu_scope" CASCADE;`)
}
