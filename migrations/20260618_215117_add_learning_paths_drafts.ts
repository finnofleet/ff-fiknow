import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_learning_paths_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__learning_paths_v_version_courses_role" AS ENUM('required', 'recommended', 'optional');
  CREATE TYPE "payload"."enum__learning_paths_v_version_fuehrungsgrad" AS ENUM('linear', 'lose');
  CREATE TYPE "payload"."enum__learning_paths_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "payload"."_learning_paths_v_version_courses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"course_slug" varchar,
  	"role" "payload"."enum__learning_paths_v_version_courses_role" DEFAULT 'required',
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_learning_paths_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_subtitle" varchar,
  	"version_description" varchar,
  	"version_cover_image_id" integer,
  	"version_fuehrungsgrad" "payload"."enum__learning_paths_v_version_fuehrungsgrad" DEFAULT 'linear',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__learning_paths_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  ALTER TABLE "payload"."learning_paths_courses" ALTER COLUMN "course_slug" DROP NOT NULL;
  ALTER TABLE "payload"."learning_paths_courses" ALTER COLUMN "role" DROP NOT NULL;
  ALTER TABLE "payload"."learning_paths" ALTER COLUMN "title" DROP NOT NULL;
  ALTER TABLE "payload"."learning_paths" ALTER COLUMN "slug" DROP NOT NULL;
  ALTER TABLE "payload"."learning_paths" ALTER COLUMN "fuehrungsgrad" DROP NOT NULL;
  ALTER TABLE "payload"."learning_paths" ADD COLUMN "_status" "payload"."enum_learning_paths_status" DEFAULT 'draft';
  ALTER TABLE "payload"."_learning_paths_v_version_courses" ADD CONSTRAINT "_learning_paths_v_version_courses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_learning_paths_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_learning_paths_v" ADD CONSTRAINT "_learning_paths_v_parent_id_learning_paths_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."learning_paths"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_learning_paths_v" ADD CONSTRAINT "_learning_paths_v_version_cover_image_id_media_id_fk" FOREIGN KEY ("version_cover_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "_learning_paths_v_version_courses_order_idx" ON "payload"."_learning_paths_v_version_courses" USING btree ("_order");
  CREATE INDEX "_learning_paths_v_version_courses_parent_id_idx" ON "payload"."_learning_paths_v_version_courses" USING btree ("_parent_id");
  CREATE INDEX "_learning_paths_v_parent_idx" ON "payload"."_learning_paths_v" USING btree ("parent_id");
  CREATE INDEX "_learning_paths_v_version_version_slug_idx" ON "payload"."_learning_paths_v" USING btree ("version_slug");
  CREATE INDEX "_learning_paths_v_version_version_cover_image_idx" ON "payload"."_learning_paths_v" USING btree ("version_cover_image_id");
  CREATE INDEX "_learning_paths_v_version_version_updated_at_idx" ON "payload"."_learning_paths_v" USING btree ("version_updated_at");
  CREATE INDEX "_learning_paths_v_version_version_created_at_idx" ON "payload"."_learning_paths_v" USING btree ("version_created_at");
  CREATE INDEX "_learning_paths_v_version_version__status_idx" ON "payload"."_learning_paths_v" USING btree ("version__status");
  CREATE INDEX "_learning_paths_v_created_at_idx" ON "payload"."_learning_paths_v" USING btree ("created_at");
  CREATE INDEX "_learning_paths_v_updated_at_idx" ON "payload"."_learning_paths_v" USING btree ("updated_at");
  CREATE INDEX "_learning_paths_v_latest_idx" ON "payload"."_learning_paths_v" USING btree ("latest");
  CREATE INDEX "_learning_paths_v_autosave_idx" ON "payload"."_learning_paths_v" USING btree ("autosave");
  CREATE INDEX "learning_paths__status_idx" ON "payload"."learning_paths" USING btree ("_status");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."_learning_paths_v_version_courses" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_learning_paths_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."_learning_paths_v_version_courses" CASCADE;
  DROP TABLE "payload"."_learning_paths_v" CASCADE;
  DROP INDEX "payload"."learning_paths__status_idx";
  ALTER TABLE "payload"."learning_paths_courses" ALTER COLUMN "course_slug" SET NOT NULL;
  ALTER TABLE "payload"."learning_paths_courses" ALTER COLUMN "role" SET NOT NULL;
  ALTER TABLE "payload"."learning_paths" ALTER COLUMN "title" SET NOT NULL;
  ALTER TABLE "payload"."learning_paths" ALTER COLUMN "slug" SET NOT NULL;
  ALTER TABLE "payload"."learning_paths" ALTER COLUMN "fuehrungsgrad" SET NOT NULL;
  ALTER TABLE "payload"."learning_paths" DROP COLUMN "_status";
  DROP TYPE "payload"."enum_learning_paths_status";
  DROP TYPE "payload"."enum__learning_paths_v_version_courses_role";
  DROP TYPE "payload"."enum__learning_paths_v_version_fuehrungsgrad";
  DROP TYPE "payload"."enum__learning_paths_v_version_status";`)
}
