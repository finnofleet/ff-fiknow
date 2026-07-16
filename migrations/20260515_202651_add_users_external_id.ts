import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."users" ADD COLUMN "external_id" varchar;
  CREATE UNIQUE INDEX "users_external_id_idx" ON "payload"."users" USING btree ("external_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."users_external_id_idx";
  ALTER TABLE "payload"."users" DROP COLUMN "external_id";`)
}
