-- F2.8 (OJ-01, 10.10) — rejestr przebiegów zadań w tle (@Cron w API): start, koniec, czas, błąd.
-- Retencja 30 dni (zadanie ZadaniaWTleService.retencja). Bez kluczy obcych: manualBy to tylko ślad,
-- kto uruchomił ręcznie (pełny wpis w AuditLog).

CREATE TABLE IF NOT EXISTS "ScheduledJobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "manualBy" TEXT,
    CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScheduledJobRun_job_startedAt_idx" ON "ScheduledJobRun"("job", "startedAt");
CREATE INDEX IF NOT EXISTS "ScheduledJobRun_job_ok_startedAt_idx" ON "ScheduledJobRun"("job", "ok", "startedAt");
CREATE INDEX IF NOT EXISTS "ScheduledJobRun_startedAt_idx" ON "ScheduledJobRun"("startedAt");
