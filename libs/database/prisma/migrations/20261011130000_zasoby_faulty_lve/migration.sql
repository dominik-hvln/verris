-- F2.6 (10.10) — faulty limitów konta z węzła (cloudlinux-statistics, agent verris-lve co ~10 min): ostatni raport
-- węzła (okna 24 h i 7 dni, tylko konta z faultami) i czas raportu. Idempotentna; stary agent pól nie wysyła.

ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "lveFaults" JSONB;
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "lveFaultsAt" TIMESTAMP(3);
