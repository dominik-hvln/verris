-- F3.4 (11.10) — watchdog usług węzła: stan usług z białej listy z agenta verris-lve (co minutę, blok node.services)
-- i czas raportu. Idempotentna; stary agent pola nie wysyła (wtedy panel pokazuje „brak raportu”).

ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "uslugiStan" JSONB;
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "uslugiStanAt" TIMESTAMP(3);
