-- Leady z verris.pl (LP „Zaplanuj migrację" + „Kontakt").

CREATE TYPE "SiteLeadKind" AS ENUM ('MIGRATION', 'CONTACT');
CREATE TYPE "SiteLeadStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RECEIVED', 'UNSUBSCRIBED');

CREATE TABLE "SiteLead" (
  "id"               TEXT NOT NULL,
  "kind"             "SiteLeadKind" NOT NULL,
  "status"           "SiteLeadStatus" NOT NULL DEFAULT 'PENDING',
  "email"            TEXT NOT NULL,
  "name"             TEXT,
  "message"          TEXT,
  "source"           TEXT,
  "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  "consentText"      TEXT,
  "consentAt"        TIMESTAMP(3),
  "ip"               TEXT,
  "userAgent"        TEXT,
  "confirmToken"     TEXT,
  "confirmedAt"      TIMESTAMP(3),
  "unsubToken"       TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiteLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteLead_confirmToken_key" ON "SiteLead" ("confirmToken");
CREATE UNIQUE INDEX "SiteLead_unsubToken_key" ON "SiteLead" ("unsubToken");
CREATE INDEX "SiteLead_kind_status_idx" ON "SiteLead" ("kind", "status");
CREATE INDEX "SiteLead_email_idx" ON "SiteLead" ("email");
CREATE INDEX "SiteLead_createdAt_idx" ON "SiteLead" ("createdAt");
