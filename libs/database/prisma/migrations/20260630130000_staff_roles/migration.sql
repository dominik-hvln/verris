-- RBAC-1 — role/działy staffa z granularnymi uprawnieniami panelu admina/staff.

CREATE TABLE IF NOT EXISTS "StaffRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffRole_name_key" ON "StaffRole"("name");

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffRoleId" TEXT;
CREATE INDEX IF NOT EXISTS "User_staffRoleId_idx" ON "User"("staffRoleId");
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_staffRoleId_fkey"
    FOREIGN KEY ("staffRoleId") REFERENCES "StaffRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Zasiane działy (hybryda: szablony, które admin może edytować; nieusuwalne).
INSERT INTO "StaffRole" ("id","name","description","permissions","isSystem","updatedAt") VALUES
  ((md5(random()::text || clock_timestamp()::text))::uuid,'Wsparcie L1', 'Obsługa zgłoszeń i podgląd klientów',
   ARRAY['DASHBOARD_VIEW','CUSTOMERS_VIEW','TICKETS_VIEW','TICKETS_MANAGE'], true, CURRENT_TIMESTAMP),
  ((md5(random()::text || clock_timestamp()::text))::uuid,'Księgowość', 'Faktury, rozliczenia, portfel',
   ARRAY['DASHBOARD_VIEW','CUSTOMERS_VIEW','BILLING_VIEW','BILLING_MANAGE'], true, CURRENT_TIMESTAMP),
  ((md5(random()::text || clock_timestamp()::text))::uuid,'Operacje (NOC)', 'Węzły, provisioning, migracje',
   ARRAY['DASHBOARD_VIEW','NODES_VIEW','NODES_MANAGE','PROVISIONING_MANAGE','MIGRATIONS_MANAGE'], true, CURRENT_TIMESTAMP),
  ((md5(random()::text || clock_timestamp()::text))::uuid,'Sprzedaż', 'Klienci, usługi, promocje',
   ARRAY['DASHBOARD_VIEW','CUSTOMERS_VIEW','SUBSCRIPTIONS_MANAGE','PROMO_MANAGE'], true, CURRENT_TIMESTAMP),
  ((md5(random()::text || clock_timestamp()::text))::uuid,'Abuse / Bezpieczeństwo', 'Nadużycia, audyt, compliance',
   ARRAY['DASHBOARD_VIEW','CUSTOMERS_VIEW','ABUSE_MANAGE','AUDIT_VIEW','COMPLIANCE_MANAGE'], true, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
