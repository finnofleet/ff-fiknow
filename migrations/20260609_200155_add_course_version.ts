import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."courses" ADD COLUMN "version" varchar;
  ALTER TABLE "payload"."_courses_v" ADD COLUMN "version_version" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."courses" DROP COLUMN "version";
  ALTER TABLE "payload"."_courses_v" DROP COLUMN "version_version";`)
}
