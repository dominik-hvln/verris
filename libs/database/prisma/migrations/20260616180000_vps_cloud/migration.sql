-- VPS / Cloud resale via Hetzner Cloud API.

CREATE TYPE "VpsStatus" AS ENUM (
  'PROVISIONING', 'RUNNING', 'STOPPED', 'REBOOTING', 'ERROR', 'DELETING', 'DELETED'
);

CREATE TABLE "VpsPlan" (
  "id"                TEXT NOT NULL,
  "slug"              TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "description"       TEXT,
  "hetznerServerType" TEXT NOT NULL,
  "hetznerImage"      TEXT NOT NULL DEFAULT 'ubuntu-24.04',
  "location"          TEXT NOT NULL DEFAULT 'nbg1',
  "vcpu"              INTEGER NOT NULL,
  "ramGb"             INTEGER NOT NULL,
  "diskGb"            INTEGER NOT NULL,
  "trafficTb"         INTEGER NOT NULL DEFAULT 20,
  "priceMonthly"      DECIMAL(10,2) NOT NULL,
  "currency"          TEXT NOT NULL DEFAULT 'PLN',
  "isPublic"          BOOLEAN NOT NULL DEFAULT true,
  "isActive"          BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"         INTEGER NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VpsPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VpsPlan_slug_key" ON "VpsPlan"("slug");
CREATE INDEX "VpsPlan_isPublic_isActive_idx" ON "VpsPlan"("isPublic", "isActive");

CREATE TABLE "VpsInstance" (
  "id"               TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "planId"           TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "status"           "VpsStatus" NOT NULL DEFAULT 'PROVISIONING',
  "hetznerServerId"  TEXT,
  "location"         TEXT,
  "ipv4"             TEXT,
  "ipv6"             TEXT,
  "rootPasswordEnc"  TEXT,
  "priceMonthly"     DECIMAL(10,2) NOT NULL,
  "currency"         TEXT NOT NULL DEFAULT 'PLN',
  "currentPeriodEnd" TIMESTAMP(3),
  "lastError"        TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  "deletedAt"        TIMESTAMP(3),
  CONSTRAINT "VpsInstance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VpsInstance_hetznerServerId_key" ON "VpsInstance"("hetznerServerId");
CREATE INDEX "VpsInstance_userId_createdAt_idx" ON "VpsInstance"("userId", "createdAt");
CREATE INDEX "VpsInstance_status_idx" ON "VpsInstance"("status");

ALTER TABLE "VpsInstance"
  ADD CONSTRAINT "VpsInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "VpsInstance_planId_fkey" FOREIGN KEY ("planId") REFERENCES "VpsPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
