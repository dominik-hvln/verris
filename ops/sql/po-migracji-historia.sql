-- Zaszłości w danych — RAPORT, nigdy bramka.
--
-- Te zapytania mówią o danych sprzed migracji: rzeczach, których migracja nie
-- naprawia, bo nie miała czego naprawić. Wycofanie wdrożenia z ich powodu
-- byłoby karą za przeszłość, nie ochroną przed błędem — dlatego ani jednego
-- `RAISE EXCEPTION` w tym pliku. Pilnuje tego strażnik w testach.
--
-- Wynik trafia do logu wdrożenia. Jeżeli liczby rosną, to jest sygnał, że coś
-- w bieżącym kodzie nie działa — ale rozstrzyga się to czytaniem, nie
-- automatycznym rollbackiem.

-- ─────────────────────────────────────────────────────────────────────────────
-- Z-01 — obciążenia sprzedażowe bez dokumentu księgowego
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Po 40 dniach pierwszy dzień następnego miesiąca na pewno minął, więc każde
-- takie obciążenie powinno mieć już fakturę — zwykłą albo zbiorczą. Wyjątkiem
-- są obciążenia sprzed wdrożenia Z-01: dla nich faktury nie było i nie będzie,
-- bo mechanizm wtedy nie istniał.
DO $$
DECLARE
  stare INT;
  kwota NUMERIC;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(ABS("amount")), 0) INTO stare, kwota
    FROM "WalletTransaction"
   WHERE "invoiceId" IS NULL
     AND "amount" < 0
     AND "type"::text LIKE 'CHARGE_%'
     AND "createdAt" < NOW() - INTERVAL '40 days';

  IF stare > 0 THEN
    RAISE NOTICE
      'Z-01 ZASZŁOŚĆ: % obciążeń sprzedażowych starszych niż 40 dni nie ma faktury (razem %). Sprawdź, czy to dane sprzed wdrożenia Z-01.',
      stare, kwota;
  ELSE
    RAISE NOTICE 'Z-01 OK — brak starych obciążeń bez dokumentu';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Z-01 — faktury opłacone, którym brakuje pliku PDF
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Scheduler finalizacji je podejmie, więc chwilowa niezerowa liczba jest
-- normalna zaraz po wdrożeniu. Liczba, która nie maleje przez godzinę, nie jest.
DO $$
DECLARE
  bez_pdf INT;
BEGIN
  SELECT COUNT(*) INTO bez_pdf
    FROM "Invoice" WHERE "status" = 'PAID' AND "storageKey" IS NULL;
  RAISE NOTICE 'Z-01: % faktur opłaconych czeka na wygenerowanie PDF-u', bez_pdf;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- H-20 — kiedy ostatnio potwierdzono, że kopia da się odtworzyć
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  ostatnia RECORD;
BEGIN
  SELECT * INTO ostatnia
    FROM "RestoreDrill" WHERE "result" = 'OK' ORDER BY "finishedAt" DESC LIMIT 1;

  IF ostatnia IS NULL THEN
    RAISE NOTICE
      'H-20 UWAGA: nigdy nie wykonano udanej próby odtworzenia z kopii. Warstwa DR jest niepotwierdzona.';
  ELSE
    RAISE NOTICE 'H-20: ostatnia udana próba % (% s, %)',
      ostatnia."finishedAt", ostatnia."durationSec", ostatnia."owner";
  END IF;
END $$;
