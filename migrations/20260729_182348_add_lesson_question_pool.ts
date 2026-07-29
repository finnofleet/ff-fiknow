import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."lessons_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "payload"."_lessons_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "payload"."lessons" ADD COLUMN "questions_per_attempt" numeric;
  ALTER TABLE "payload"."_lessons_v" ADD COLUMN "version_questions_per_attempt" numeric;
  ALTER TABLE "payload"."lessons_texts" ADD CONSTRAINT "lessons_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_lessons_v_texts" ADD CONSTRAINT "_lessons_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_lessons_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "lessons_texts_order_parent" ON "payload"."lessons_texts" USING btree ("order","parent_id");
  CREATE INDEX "_lessons_v_texts_order_parent" ON "payload"."_lessons_v_texts" USING btree ("order","parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."lessons_texts" CASCADE;
  DROP TABLE "payload"."_lessons_v_texts" CASCADE;
  ALTER TABLE "payload"."lessons" DROP COLUMN "questions_per_attempt";
  ALTER TABLE "payload"."_lessons_v" DROP COLUMN "version_questions_per_attempt";`)
}
