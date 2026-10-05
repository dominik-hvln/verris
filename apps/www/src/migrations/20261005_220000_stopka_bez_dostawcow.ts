import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres';

// 05.10.2026 (decyzja właściciela): strona nie pokazuje nazw dostawców zaplecza (operator kart, serwery).
// Stopka z CMS miała „Stripe” w linii płatności — podmieniamy na Paynow (marka, którą klient widzi przy płaceniu).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload"."footer" ALTER COLUMN "pay_line" SET DEFAULT 'Płatności: karta · BLIK · Przelewy24 · Paynow · SLA 99,5% z rekompensatami na wniosek wg regulaminu';
    UPDATE "payload"."footer" SET "pay_line" = replace("pay_line", ' · Stripe', ' · Paynow') WHERE "pay_line" LIKE '%Stripe%';
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`SELECT 1`);
}
