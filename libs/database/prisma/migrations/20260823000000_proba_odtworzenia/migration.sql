-- H-20 — ślad po próbie odtworzenia z kopii zapasowej.
--
-- Procedura istniała jako skrypt, ale jej WYKONANIE nie zostawiało śladu.
-- Runbook wymagał drilla przed startem, a w repozytorium nie było niczego, co
-- by potwierdzało, że kiedykolwiek się odbył. Reguła audytu: backupy i DR
-- wymagają poziomu D4 — data, wynik, właściciel. Procedura bez zapisu wykonania
-- nie liczy się wcale.

CREATE TYPE "RestoreDrillResult" AS ENUM ('OK', 'FAILED');

CREATE TABLE "RestoreDrill" (
  "id"          TEXT NOT NULL,
  "startedAt"   TIMESTAMP(3) NOT NULL,
  "finishedAt"  TIMESTAMP(3) NOT NULL,
  "durationSec" INTEGER NOT NULL,
  "result"      "RestoreDrillResult" NOT NULL,
  "objectName"  TEXT NOT NULL,
  "source"      TEXT NOT NULL,
  "rowCounts"   JSONB NOT NULL,
  "owner"       TEXT NOT NULL,
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RestoreDrill_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RestoreDrill_finishedAt_idx" ON "RestoreDrill"("finishedAt");
CREATE INDEX "RestoreDrill_result_finishedAt_idx" ON "RestoreDrill"("result", "finishedAt");

-- Próba, która trwała ujemnie albo zero sekund, jest zapisem, nie pomiarem.
ALTER TABLE "RestoreDrill"
  ADD CONSTRAINT "RestoreDrill_czas_dodatni" CHECK ("durationSec" > 0);

-- Właściciel jest wymagany przez D4. Pusty napis spełniałby NOT NULL
-- i nie spełniałby reguły.
ALTER TABLE "RestoreDrill"
  ADD CONSTRAINT "RestoreDrill_wlasciciel_niepusty" CHECK (length(btrim("owner")) > 0);
