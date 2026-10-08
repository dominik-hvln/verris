-- PB-47 — operator (STAFF) może mieć kilka ról; uprawnienia są sumą. User.staffRoleId zostaje (zgodność).

CREATE TABLE IF NOT EXISTS "StaffRoleAssignment" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffRoleAssignment_pkey" PRIMARY KEY ("userId","roleId")
);
CREATE INDEX IF NOT EXISTS "StaffRoleAssignment_roleId_idx" ON "StaffRoleAssignment"("roleId");

DO $$ BEGIN
  ALTER TABLE "StaffRoleAssignment" ADD CONSTRAINT "StaffRoleAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "StaffRoleAssignment" ADD CONSTRAINT "StaffRoleAssignment_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "StaffRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Dotychczasowe pojedyncze przypisania → tabela przypisań.
INSERT INTO "StaffRoleAssignment" ("userId", "roleId")
SELECT "id", "staffRoleId" FROM "User" WHERE "staffRoleId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Działy zasiane w 20260630130000_staff_roles były „systemowe, ale edytowalne”. Od PB-47 role systemowe
-- definiuje kod (apps/api/src/staff-roles/role-systemowe.ts) i nie da się ich edytować — stare działy
-- zostają jako role własne (operatorzy zachowują dostęp, administrator może je zmienić albo usunąć).
UPDATE "StaffRole" SET "isSystem" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "isSystem" = true
  AND "name" IN ('Wsparcie L1', 'Księgowość', 'Operacje (NOC)', 'Sprzedaż', 'Abuse / Bezpieczeństwo');
