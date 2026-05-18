CREATE TYPE "CustomerPermission" AS ENUM (
  'BILLING_READ',
  'BILLING_MANAGE',
  'SERVICES_READ',
  'SERVICES_MANAGE',
  'DOMAINS_READ',
  'DOMAINS_MANAGE',
  'DNS_MANAGE',
  'EMAIL_MANAGE',
  'FILES_MANAGE',
  'TICKETS_READ',
  'TICKETS_MANAGE',
  'SETTINGS_MANAGE'
);

CREATE TYPE "CustomerSubaccountInviteStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'REVOKED',
  'EXPIRED'
);

ALTER TABLE "User" ADD COLUMN "customerOwnerId" TEXT;
ALTER TABLE "User" ADD COLUMN "customerPermissions" "CustomerPermission"[] DEFAULT ARRAY[]::"CustomerPermission"[];
ALTER TABLE "User" ADD COLUMN "subaccountDisabledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "subaccountLabel" TEXT;

ALTER TABLE "User" ADD CONSTRAINT "User_customerOwnerId_fkey" FOREIGN KEY ("customerOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomerSubaccountInvite" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "permissions" "CustomerPermission"[],
  "label" TEXT,
  "status" "CustomerSubaccountInviteStatus" NOT NULL DEFAULT 'PENDING',
  "acceptedUserId" TEXT,
  "invitedByUserId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerSubaccountInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerSubaccountInvite_tokenHash_key" ON "CustomerSubaccountInvite"("tokenHash");
CREATE INDEX "CustomerSubaccountInvite_ownerUserId_status_idx" ON "CustomerSubaccountInvite"("ownerUserId", "status");
CREATE INDEX "CustomerSubaccountInvite_email_idx" ON "CustomerSubaccountInvite"("email");
CREATE INDEX "User_customerOwnerId_idx" ON "User"("customerOwnerId");

ALTER TABLE "CustomerSubaccountInvite" ADD CONSTRAINT "CustomerSubaccountInvite_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerSubaccountInvite" ADD CONSTRAINT "CustomerSubaccountInvite_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerSubaccountInvite" ADD CONSTRAINT "CustomerSubaccountInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
