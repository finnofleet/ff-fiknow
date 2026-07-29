import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."lessons" ADD COLUMN "final_exam" boolean DEFAULT false;
  ALTER TABLE "payload"."_lessons_v" ADD COLUMN "version_final_exam" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."lessons" DROP COLUMN "final_exam";
  ALTER TABLE "payload"."_lessons_v" DROP COLUMN "version_final_exam";`)
}
