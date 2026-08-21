import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres';

// Pole `faq` (json) we wpisach bloga — zasila schema FAQPage (rich results + cytowania w AI).
// Kolumna musi istnieć także w tabeli wersji (_posts_v) z prefiksem `version_`.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload"."posts" ADD COLUMN "faq" jsonb;
    ALTER TABLE "payload"."_posts_v" ADD COLUMN "version_faq" jsonb;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload"."_posts_v" DROP COLUMN IF EXISTS "version_faq";
    ALTER TABLE "payload"."posts" DROP COLUMN IF EXISTS "faq";
  `);
}
