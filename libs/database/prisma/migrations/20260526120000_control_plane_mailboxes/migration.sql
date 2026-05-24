-- MAIL-4 — skrzynki zespołu @verris.pl (Postfix + Dovecot + SOGo)

CREATE TYPE "ControlPlaneMailboxKind" AS ENUM ('SYSTEM', 'STAFF', 'ALIAS_ONLY');
CREATE TYPE "ControlPlaneMailboxStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_MIGRATION');
CREATE TYPE "ControlPlaneSystemAddressRole" AS ENUM ('NOREPLY', 'SUPPORT', 'SECURITY', 'RODO', 'BILLING', 'DMARC_RUA', 'PANEL');

CREATE TABLE "ControlPlaneMailbox" (
    "id" TEXT NOT NULL,
    "localPart" TEXT NOT NULL,
    "domain" TEXT NOT NULL DEFAULT 'verris.pl',
    "email" TEXT NOT NULL,
    "kind" "ControlPlaneMailboxKind" NOT NULL,
    "status" "ControlPlaneMailboxStatus" NOT NULL DEFAULT 'ACTIVE',
    "displayName" TEXT,
    "userId" TEXT,
    "quotaMb" INTEGER NOT NULL DEFAULT 1024,
    "usedBytes" BIGINT NOT NULL DEFAULT 0,
    "imapEnabled" BOOLEAN NOT NULL DEFAULT true,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "ControlPlaneMailbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ControlPlaneMailAlias" (
    "id" TEXT NOT NULL,
    "aliasEmail" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlPlaneMailAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ControlPlaneMailForward" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "forwardTo" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmationToken" TEXT,
    "keepCopy" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlPlaneMailForward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ControlPlaneSystemAddress" (
    "role" "ControlPlaneSystemAddressRole" NOT NULL,
    "email" TEXT NOT NULL,
    "mailboxId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlPlaneSystemAddress_pkey" PRIMARY KEY ("role")
);

CREATE UNIQUE INDEX "ControlPlaneMailbox_email_key" ON "ControlPlaneMailbox"("email");
CREATE UNIQUE INDEX "ControlPlaneMailbox_userId_key" ON "ControlPlaneMailbox"("userId");
CREATE UNIQUE INDEX "ControlPlaneMailbox_localPart_domain_key" ON "ControlPlaneMailbox"("localPart", "domain");
CREATE INDEX "ControlPlaneMailbox_status_kind_idx" ON "ControlPlaneMailbox"("status", "kind");

CREATE UNIQUE INDEX "ControlPlaneMailAlias_aliasEmail_key" ON "ControlPlaneMailAlias"("aliasEmail");
CREATE UNIQUE INDEX "ControlPlaneMailForward_confirmationToken_key" ON "ControlPlaneMailForward"("confirmationToken");
CREATE INDEX "ControlPlaneMailForward_mailboxId_idx" ON "ControlPlaneMailForward"("mailboxId");

CREATE UNIQUE INDEX "ControlPlaneSystemAddress_email_key" ON "ControlPlaneSystemAddress"("email");

ALTER TABLE "ControlPlaneMailbox" ADD CONSTRAINT "ControlPlaneMailbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ControlPlaneMailAlias" ADD CONSTRAINT "ControlPlaneMailAlias_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "ControlPlaneMailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ControlPlaneMailForward" ADD CONSTRAINT "ControlPlaneMailForward_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "ControlPlaneMailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ControlPlaneSystemAddress" ("role", "email", "mailboxId", "updatedAt") VALUES
  ('NOREPLY', 'noreply@verris.pl', NULL, CURRENT_TIMESTAMP),
  ('SUPPORT', 'support@verris.pl', NULL, CURRENT_TIMESTAMP),
  ('SECURITY', 'security@verris.pl', NULL, CURRENT_TIMESTAMP),
  ('RODO', 'rodo@verris.pl', NULL, CURRENT_TIMESTAMP),
  ('BILLING', 'billing@verris.pl', NULL, CURRENT_TIMESTAMP),
  ('DMARC_RUA', 'dmarc@verris.pl', NULL, CURRENT_TIMESTAMP),
  ('PANEL', 'panel@verris.pl', NULL, CURRENT_TIMESTAMP);
