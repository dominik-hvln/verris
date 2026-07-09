import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres';

// Dodaje pola redakcyjne/SEO do kolekcji Posts: author, keyword, cluster, type.
// Kolumny muszą istnieć także w tabeli wersji (_posts_v) z prefiksem `version_`.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "payload"."enum_posts_type" AS ENUM('pillar', 'spoke');
    CREATE TYPE "payload"."enum__posts_v_version_type" AS ENUM('pillar', 'spoke');

    ALTER TABLE "payload"."posts" ADD COLUMN "author" varchar;
    ALTER TABLE "payload"."posts" ADD COLUMN "keyword" varchar;
    ALTER TABLE "payload"."posts" ADD COLUMN "cluster" varchar;
    ALTER TABLE "payload"."posts" ADD COLUMN "type" "payload"."enum_posts_type";

    ALTER TABLE "payload"."_posts_v" ADD COLUMN "version_author" varchar;
    ALTER TABLE "payload"."_posts_v" ADD COLUMN "version_keyword" varchar;
    ALTER TABLE "payload"."_posts_v" ADD COLUMN "version_cluster" varchar;
    ALTER TABLE "payload"."_posts_v" ADD COLUMN "version_type" "payload"."enum__posts_v_version_type";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload"."_posts_v" DROP COLUMN IF EXISTS "version_type";
    ALTER TABLE "payload"."_posts_v" DROP COLUMN IF EXISTS "version_cluster";
    ALTER TABLE "payload"."_posts_v" DROP COLUMN IF EXISTS "version_keyword";
    ALTER TABLE "payload"."_posts_v" DROP COLUMN IF EXISTS "version_author";

    ALTER TABLE "payload"."posts" DROP COLUMN IF EXISTS "type";
    ALTER TABLE "payload"."posts" DROP COLUMN IF EXISTS "cluster";
    ALTER TABLE "payload"."posts" DROP COLUMN IF EXISTS "keyword";
    ALTER TABLE "payload"."posts" DROP COLUMN IF EXISTS "author";

    DROP TYPE IF EXISTS "payload"."enum__posts_v_version_type";
    DROP TYPE IF EXISTS "payload"."enum_posts_type";
  `);
}
