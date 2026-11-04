import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres';

// 03.11.2026 — decyzja 1 Dominika: rekompensata SLA przyznawana automatycznie, bez wniosku (P2-07 z testów agentami).
// Linia płatności w stopce z CMS mówiła „na wniosek” — podmieniamy w zapisanej wartości i w wartości domyślnej.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload"."footer" ALTER COLUMN "pay_line" SET DEFAULT 'Płatności: karta · BLIK · Przelewy24 · Paynow · SLA 99,5% z rekompensatami przyznawanymi automatycznie wg regulaminu';
    UPDATE "payload"."footer" SET "pay_line" = replace("pay_line", 'rekompensatami na wniosek', 'rekompensatami przyznawanymi automatycznie') WHERE "pay_line" LIKE '%na wniosek%';
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`SELECT 1`);
}
