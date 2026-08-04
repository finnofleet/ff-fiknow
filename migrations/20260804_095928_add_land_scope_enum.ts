import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_training_requirements_target_land_scope_land" AS ENUM('DE', 'CH', 'LUX');
  ALTER TABLE "payload"."training_requirements_target_land_scope" ALTER COLUMN "land" SET DATA TYPE "payload"."enum_training_requirements_target_land_scope_land" USING "land"::"payload"."enum_training_requirements_target_land_scope_land";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."training_requirements_target_land_scope" ALTER COLUMN "land" SET DATA TYPE varchar;
  DROP TYPE "payload"."enum_training_requirements_target_land_scope_land";`)
}
