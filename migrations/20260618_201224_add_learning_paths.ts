import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_learning_paths_courses_role" AS ENUM('required', 'recommended', 'optional');
  CREATE TYPE "payload"."enum_learning_paths_fuehrungsgrad" AS ENUM('linear', 'lose');
  CREATE TABLE "payload"."learning_paths_courses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"course_slug" varchar NOT NULL,
  	"role" "payload"."enum_learning_paths_courses_role" DEFAULT 'required' NOT NULL
  );
  
  CREATE TABLE "payload"."learning_paths" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"subtitle" varchar,
  	"description" varchar,
  	"cover_image_id" integer,
  	"fuehrungsgrad" "payload"."enum_learning_paths_fuehrungsgrad" DEFAULT 'linear' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "learning_paths_id" integer;
  ALTER TABLE "payload"."learning_paths_courses" ADD CONSTRAINT "learning_paths_courses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."learning_paths"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."learning_paths" ADD CONSTRAINT "learning_paths_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "learning_paths_courses_order_idx" ON "payload"."learning_paths_courses" USING btree ("_order");
  CREATE INDEX "learning_paths_courses_parent_id_idx" ON "payload"."learning_paths_courses" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "learning_paths_slug_idx" ON "payload"."learning_paths" USING btree ("slug");
  CREATE INDEX "learning_paths_cover_image_idx" ON "payload"."learning_paths" USING btree ("cover_image_id");
  CREATE INDEX "learning_paths_updated_at_idx" ON "payload"."learning_paths" USING btree ("updated_at");
  CREATE INDEX "learning_paths_created_at_idx" ON "payload"."learning_paths" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_learning_paths_fk" FOREIGN KEY ("learning_paths_id") REFERENCES "payload"."learning_paths"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_learning_paths_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("learning_paths_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."learning_paths_courses" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."learning_paths" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."learning_paths_courses" CASCADE;
  DROP TABLE "payload"."learning_paths" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_learning_paths_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_learning_paths_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "learning_paths_id";
  DROP TYPE "payload"."enum_learning_paths_courses_role";
  DROP TYPE "payload"."enum_learning_paths_fuehrungsgrad";`)
}
