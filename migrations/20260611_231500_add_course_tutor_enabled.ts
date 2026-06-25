import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."courses" ADD COLUMN "tutor_enabled" boolean;
  ALTER TABLE "payload"."_courses_v" ADD COLUMN "version_tutor_enabled" boolean;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."courses" DROP COLUMN "tutor_enabled";
  ALTER TABLE "payload"."_courses_v" DROP COLUMN "version_tutor_enabled";`)
}
