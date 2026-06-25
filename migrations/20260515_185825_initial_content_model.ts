import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_courses_difficulty" AS ENUM('einsteiger', 'mittel', 'fortgeschritten');
  CREATE TYPE "payload"."enum_courses_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__courses_v_version_difficulty" AS ENUM('einsteiger', 'mittel', 'fortgeschritten');
  CREATE TYPE "payload"."enum__courses_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum_sections_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__sections_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum_lessons_type" AS ENUM('reading', 'video', 'quiz');
  CREATE TYPE "payload"."enum_lessons_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__lessons_v_version_type" AS ENUM('reading', 'video', 'quiz');
  CREATE TYPE "payload"."enum__lessons_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "payload"."users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "payload"."users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"caption" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "payload"."courses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"subtitle" varchar,
  	"description" varchar,
  	"category" varchar,
  	"difficulty" "payload"."enum_courses_difficulty",
  	"estimated_minutes" numeric,
  	"cover_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_courses_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."_courses_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_subtitle" varchar,
  	"version_description" varchar,
  	"version_category" varchar,
  	"version_difficulty" "payload"."enum__courses_v_version_difficulty",
  	"version_estimated_minutes" numeric,
  	"version_cover_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__courses_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."sections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"course_id" integer,
  	"order_index" numeric DEFAULT 1,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_sections_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."_sections_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_course_id" integer,
  	"version_order_index" numeric DEFAULT 1,
  	"version_description" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__sections_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."lessons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"section_id" integer,
  	"order_index" numeric DEFAULT 1,
  	"type" "payload"."enum_lessons_type" DEFAULT 'reading',
  	"estimated_minutes" numeric,
  	"summary" varchar,
  	"body" varchar,
  	"video_url" varchar,
  	"transcript" varchar,
  	"passing_score" numeric DEFAULT 0.7,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_lessons_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."_lessons_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_section_id" integer,
  	"version_order_index" numeric DEFAULT 1,
  	"version_type" "payload"."enum__lessons_v_version_type" DEFAULT 'reading',
  	"version_estimated_minutes" numeric,
  	"version_summary" varchar,
  	"version_body" varchar,
  	"version_video_url" varchar,
  	"version_transcript" varchar,
  	"version_passing_score" numeric DEFAULT 0.7,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__lessons_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "payload"."payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload"."payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"courses_id" integer,
  	"sections_id" integer,
  	"lessons_id" integer
  );
  
  CREATE TABLE "payload"."payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload"."payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload"."payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."courses" ADD CONSTRAINT "courses_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_courses_v" ADD CONSTRAINT "_courses_v_parent_id_courses_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_courses_v" ADD CONSTRAINT "_courses_v_version_cover_image_id_media_id_fk" FOREIGN KEY ("version_cover_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."sections" ADD CONSTRAINT "sections_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "payload"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_sections_v" ADD CONSTRAINT "_sections_v_parent_id_sections_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."sections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_sections_v" ADD CONSTRAINT "_sections_v_version_course_id_courses_id_fk" FOREIGN KEY ("version_course_id") REFERENCES "payload"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."lessons" ADD CONSTRAINT "lessons_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "payload"."sections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_lessons_v" ADD CONSTRAINT "_lessons_v_parent_id_lessons_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."lessons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_lessons_v" ADD CONSTRAINT "_lessons_v_version_section_id_sections_id_fk" FOREIGN KEY ("version_section_id") REFERENCES "payload"."sections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_courses_fk" FOREIGN KEY ("courses_id") REFERENCES "payload"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "payload"."sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lessons_fk" FOREIGN KEY ("lessons_id") REFERENCES "payload"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "payload"."users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "payload"."users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "payload"."users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "payload"."users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "payload"."users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "payload"."media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "payload"."media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "payload"."media" USING btree ("filename");
  CREATE UNIQUE INDEX "courses_slug_idx" ON "payload"."courses" USING btree ("slug");
  CREATE INDEX "courses_cover_image_idx" ON "payload"."courses" USING btree ("cover_image_id");
  CREATE INDEX "courses_updated_at_idx" ON "payload"."courses" USING btree ("updated_at");
  CREATE INDEX "courses_created_at_idx" ON "payload"."courses" USING btree ("created_at");
  CREATE INDEX "courses__status_idx" ON "payload"."courses" USING btree ("_status");
  CREATE INDEX "_courses_v_parent_idx" ON "payload"."_courses_v" USING btree ("parent_id");
  CREATE INDEX "_courses_v_version_version_slug_idx" ON "payload"."_courses_v" USING btree ("version_slug");
  CREATE INDEX "_courses_v_version_version_cover_image_idx" ON "payload"."_courses_v" USING btree ("version_cover_image_id");
  CREATE INDEX "_courses_v_version_version_updated_at_idx" ON "payload"."_courses_v" USING btree ("version_updated_at");
  CREATE INDEX "_courses_v_version_version_created_at_idx" ON "payload"."_courses_v" USING btree ("version_created_at");
  CREATE INDEX "_courses_v_version_version__status_idx" ON "payload"."_courses_v" USING btree ("version__status");
  CREATE INDEX "_courses_v_created_at_idx" ON "payload"."_courses_v" USING btree ("created_at");
  CREATE INDEX "_courses_v_updated_at_idx" ON "payload"."_courses_v" USING btree ("updated_at");
  CREATE INDEX "_courses_v_latest_idx" ON "payload"."_courses_v" USING btree ("latest");
  CREATE INDEX "_courses_v_autosave_idx" ON "payload"."_courses_v" USING btree ("autosave");
  CREATE INDEX "sections_course_idx" ON "payload"."sections" USING btree ("course_id");
  CREATE INDEX "sections_updated_at_idx" ON "payload"."sections" USING btree ("updated_at");
  CREATE INDEX "sections_created_at_idx" ON "payload"."sections" USING btree ("created_at");
  CREATE INDEX "sections__status_idx" ON "payload"."sections" USING btree ("_status");
  CREATE INDEX "_sections_v_parent_idx" ON "payload"."_sections_v" USING btree ("parent_id");
  CREATE INDEX "_sections_v_version_version_course_idx" ON "payload"."_sections_v" USING btree ("version_course_id");
  CREATE INDEX "_sections_v_version_version_updated_at_idx" ON "payload"."_sections_v" USING btree ("version_updated_at");
  CREATE INDEX "_sections_v_version_version_created_at_idx" ON "payload"."_sections_v" USING btree ("version_created_at");
  CREATE INDEX "_sections_v_version_version__status_idx" ON "payload"."_sections_v" USING btree ("version__status");
  CREATE INDEX "_sections_v_created_at_idx" ON "payload"."_sections_v" USING btree ("created_at");
  CREATE INDEX "_sections_v_updated_at_idx" ON "payload"."_sections_v" USING btree ("updated_at");
  CREATE INDEX "_sections_v_latest_idx" ON "payload"."_sections_v" USING btree ("latest");
  CREATE INDEX "_sections_v_autosave_idx" ON "payload"."_sections_v" USING btree ("autosave");
  CREATE INDEX "lessons_section_idx" ON "payload"."lessons" USING btree ("section_id");
  CREATE INDEX "lessons_updated_at_idx" ON "payload"."lessons" USING btree ("updated_at");
  CREATE INDEX "lessons_created_at_idx" ON "payload"."lessons" USING btree ("created_at");
  CREATE INDEX "lessons__status_idx" ON "payload"."lessons" USING btree ("_status");
  CREATE INDEX "_lessons_v_parent_idx" ON "payload"."_lessons_v" USING btree ("parent_id");
  CREATE INDEX "_lessons_v_version_version_section_idx" ON "payload"."_lessons_v" USING btree ("version_section_id");
  CREATE INDEX "_lessons_v_version_version_updated_at_idx" ON "payload"."_lessons_v" USING btree ("version_updated_at");
  CREATE INDEX "_lessons_v_version_version_created_at_idx" ON "payload"."_lessons_v" USING btree ("version_created_at");
  CREATE INDEX "_lessons_v_version_version__status_idx" ON "payload"."_lessons_v" USING btree ("version__status");
  CREATE INDEX "_lessons_v_created_at_idx" ON "payload"."_lessons_v" USING btree ("created_at");
  CREATE INDEX "_lessons_v_updated_at_idx" ON "payload"."_lessons_v" USING btree ("updated_at");
  CREATE INDEX "_lessons_v_latest_idx" ON "payload"."_lessons_v" USING btree ("latest");
  CREATE INDEX "_lessons_v_autosave_idx" ON "payload"."_lessons_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload"."payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload"."payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload"."payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload"."payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload"."payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload"."payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload"."payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_courses_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("courses_id");
  CREATE INDEX "payload_locked_documents_rels_sections_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("sections_id");
  CREATE INDEX "payload_locked_documents_rels_lessons_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("lessons_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload"."payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload"."payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload"."payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload"."payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload"."payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload"."payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload"."payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload"."payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload"."payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."users_sessions" CASCADE;
  DROP TABLE "payload"."users" CASCADE;
  DROP TABLE "payload"."media" CASCADE;
  DROP TABLE "payload"."courses" CASCADE;
  DROP TABLE "payload"."_courses_v" CASCADE;
  DROP TABLE "payload"."sections" CASCADE;
  DROP TABLE "payload"."_sections_v" CASCADE;
  DROP TABLE "payload"."lessons" CASCADE;
  DROP TABLE "payload"."_lessons_v" CASCADE;
  DROP TABLE "payload"."payload_kv" CASCADE;
  DROP TABLE "payload"."payload_locked_documents" CASCADE;
  DROP TABLE "payload"."payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload"."payload_preferences" CASCADE;
  DROP TABLE "payload"."payload_preferences_rels" CASCADE;
  DROP TABLE "payload"."payload_migrations" CASCADE;
  DROP TYPE "payload"."enum_courses_difficulty";
  DROP TYPE "payload"."enum_courses_status";
  DROP TYPE "payload"."enum__courses_v_version_difficulty";
  DROP TYPE "payload"."enum__courses_v_version_status";
  DROP TYPE "payload"."enum_sections_status";
  DROP TYPE "payload"."enum__sections_v_version_status";
  DROP TYPE "payload"."enum_lessons_type";
  DROP TYPE "payload"."enum_lessons_status";
  DROP TYPE "payload"."enum__lessons_v_version_type";
  DROP TYPE "payload"."enum__lessons_v_version_status";`)
}
