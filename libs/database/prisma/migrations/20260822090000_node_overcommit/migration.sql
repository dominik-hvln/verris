-- Z-12 — nadsubskrypcja pojemności węzła.
--
-- Do tej pory placement traktował sumę limitów planów (`allocated*`) jak
-- zajętość maszyny. Przy bazie 8 GB RAM na węzeł ze 128 GB wchodziło 16 kont,
-- a próg rentowności przy cenie 45 zł to 58 kont (PB-01).
--
-- Wartość domyślna 1 jest celowa: migracja NIE zmienia zachowania placementu.
-- Nadsubskrypcję włącza admin świadomie, per węzeł, w panelu pojemności.
-- Gdyby default był wyższy, ta migracja po cichu przestawiłaby zasady
-- umieszczania kont na całej flocie — a to jest zmiana, która musi być decyzją,
-- nie skutkiem ubocznym wdrożenia.

ALTER TABLE "Server" ADD COLUMN "overcommitCpu"  DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "Server" ADD COLUMN "overcommitRam"  DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "Server" ADD COLUMN "overcommitDisk" DOUBLE PRECISION NOT NULL DEFAULT 1;
