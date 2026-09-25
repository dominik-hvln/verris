-- PB-20 — udostępnianie wybranych usług i dostęp z własnego konta (przełącznik kont).
ALTER TABLE "User" ADD COLUMN "subaccountServiceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CustomerSubaccountInvite" ADD COLUMN "serviceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "CustomerMembership" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "memberUserId" TEXT NOT NULL,
    "permissions" "CustomerPermission"[],
    "serviceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "label" TEXT,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerMembership_ownerUserId_memberUserId_key" ON "CustomerMembership"("ownerUserId", "memberUserId");
CREATE INDEX "CustomerMembership_memberUserId_idx" ON "CustomerMembership"("memberUserId");
ALTER TABLE "CustomerMembership" ADD CONSTRAINT "CustomerMembership_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerMembership" ADD CONSTRAINT "CustomerMembership_memberUserId_fkey" FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
