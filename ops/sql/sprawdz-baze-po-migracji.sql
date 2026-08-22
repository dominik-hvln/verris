-- Weryfikacja stanu bazy PO `prisma migrate deploy`.
--
-- Do tej pory job `migrations` w CI sprawdzał wyłącznie, czy migracje dają się
-- zastosować i czy schemat nie ma dryfu. Nie sprawdzał, czy DANE, które
-- migracje wstawiają, faktycznie tam są i mają właściwe wartości.
--
-- Różnica jest istotna: Z-13 (plan produkcyjny) i Z-12 (kolumny nadsubskrypcji)
-- to migracje DANYCH i SCHEMATU, których poprawność testy jednostkowe mogą
-- potwierdzić tylko przez czytanie SQL-a jako tekstu. Ten plik czyta bazę.
--
-- Każde zapytanie kończy się `RAISE EXCEPTION`, gdy warunek nie jest spełniony,
-- więc psql z ON_ERROR_STOP=1 wywala job z niezerowym kodem.

\set ON_ERROR_STOP on

-- ─────────────────────────────────────────────────────────────────────────────
-- Z-13 — pakiet sprzedawany na stronie istnieje i ma właściwe parametry
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  p RECORD;
BEGIN
  SELECT * INTO p FROM "Plan" WHERE "slug" = 'verris-hosting';

  IF p IS NULL THEN
    RAISE EXCEPTION 'Z-13: planu verris-hosting NIE MA w bazie po migracjach';
  END IF;

  IF p."priceMonthly" <> 45.00 THEN
    RAISE EXCEPTION 'Z-13: cena miesięczna to %, oczekiwano 45.00 (BRUTTO)', p."priceMonthly";
  END IF;

  IF p."priceYearly" <> 399.00 THEN
    RAISE EXCEPTION 'Z-13: cena roczna to %, oczekiwano 399.00 (BRUTTO)', p."priceYearly";
  END IF;

  IF p."cpuLimit" <> 200 OR p."ramLimitMb" <> 8192 OR p."diskLimitMb" <> 51200 THEN
    RAISE EXCEPTION 'Z-13: limity bazowe to %/%/%, oczekiwano 200/8192/51200',
      p."cpuLimit", p."ramLimitMb", p."diskLimitMb";
  END IF;

  IF p."includedTransferGb" IS NOT NULL THEN
    RAISE EXCEPTION 'Z-13: transfer ma być bez limitu (NULL), jest %', p."includedTransferGb";
  END IF;

  IF NOT p."isPublic" OR NOT p."isActive" THEN
    RAISE EXCEPTION 'Z-13: plan musi być publiczny i aktywny (isPublic=%, isActive=%)',
      p."isPublic", p."isActive";
  END IF;

  -- Sufity autoskalowania muszą odpowiadać obietnicy ze strony:
  -- 2 vCPU → 24 (12×), 8 GB → 64 (8×), 50 GB → 1000 GB (20×).
  IF p."autoscalingMaxOverscaleCpu" <> 12
     OR p."autoscalingMaxOverscaleRam" <> 8
     OR p."autoscalingMaxOverscaleDisk" <> 20 THEN
    RAISE EXCEPTION 'Z-13/Z-16: krotności autoskalowania to %/%/%, oczekiwano 12/8/20',
      p."autoscalingMaxOverscaleCpu", p."autoscalingMaxOverscaleRam", p."autoscalingMaxOverscaleDisk";
  END IF;

  RAISE NOTICE 'Z-13 OK — verris-hosting: 45.00/399.00 brutto, 200/8192/51200, skalowanie 12x/8x/20x';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Z-13 — dokładnie JEDEN pakiet hostingowy w katalogu publicznym
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  ile INT;
  slugi TEXT;
BEGIN
  SELECT COUNT(*), string_agg("slug", ', ' ORDER BY "slug")
    INTO ile, slugi
    FROM "Plan"
   WHERE "isPublic" = true AND "isActive" = true AND "productKind" = 'HOSTING';

  IF ile <> 1 THEN
    RAISE EXCEPTION
      'Z-13: publicznych pakietów hostingowych jest % (%), a oferta mówi „jeden pakiet, jedna cena"',
      ile, slugi;
  END IF;

  RAISE NOTICE 'Z-13 OK — dokładnie jeden publiczny pakiet hostingowy';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Z-13 — plany prototypowe wycofane ze sprzedaży, ale NIE zdezaktywowane
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  wszystkie INT;
  publiczne INT;
  nieaktywne INT;
BEGIN
  -- Bez tego licznika asercje niżej mogłyby przejść trywialnie na bazie, na
  -- której planów prototypowych po prostu nie ma — a to wygląda w logu CI
  -- identycznie jak prawdziwe „wszystko w porządku".
  SELECT COUNT(*) INTO wszystkie
    FROM "Plan" WHERE "slug" IN ('starter','pro','business');
  IF wszystkie = 0 THEN
    RAISE EXCEPTION
      'Z-13: nie znaleziono ŻADNEGO planu prototypowego — sprawdzenie byłoby puste. Czy seed się wykonał?';
  END IF;

  SELECT COUNT(*) INTO publiczne
    FROM "Plan" WHERE "slug" IN ('starter','pro','business') AND "isPublic" = true;
  IF publiczne > 0 THEN
    RAISE EXCEPTION 'Z-13: % planów prototypowych nadal jest publicznych', publiczne;
  END IF;

  -- Dezaktywacja planu wywróciłaby odnowienie subskrypcji założonej na nim.
  SELECT COUNT(*) INTO nieaktywne
    FROM "Plan" WHERE "slug" IN ('starter','pro','business') AND "isActive" = false;
  IF nieaktywne > 0 THEN
    RAISE EXCEPTION
      'Z-13: % planów prototypowych zdezaktywowano — to zabija odnowienia subskrypcji na nich założonych',
      nieaktywne;
  END IF;

  RAISE NOTICE 'Z-13 OK — % planów prototypowych: niepubliczne, ale nadal aktywne', wszystkie;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Z-12 — kolumny nadsubskrypcji istnieją i mają NEUTRALNĄ wartość domyślną
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  kolumna TEXT;
  domyslna TEXT;
BEGIN
  FOREACH kolumna IN ARRAY ARRAY['overcommitCpu','overcommitRam','overcommitDisk'] LOOP
    SELECT column_default INTO domyslna
      FROM information_schema.columns
     WHERE table_name = 'Server' AND column_name = kolumna;

    IF domyslna IS NULL THEN
      RAISE EXCEPTION 'Z-12: kolumna Server.% nie istnieje albo nie ma wartości domyślnej', kolumna;
    END IF;

    -- Domyślna 1 jest celowa: migracja NIE MOŻE po cichu zmienić zasad
    -- umieszczania kont na całej flocie. Nadsubskrypcję włącza admin świadomie.
    IF domyslna NOT LIKE '1%' THEN
      RAISE EXCEPTION
        'Z-12: Server.% ma domyślną %, a musi mieć 1 — inaczej wdrożenie po cichu zmienia placement',
        kolumna, domyslna;
    END IF;
  END LOOP;

  RAISE NOTICE 'Z-12 OK — trzy kolumny nadsubskrypcji z neutralną wartością domyślną 1';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Z-16 — księga pojemności zgadza się z kontami (na świeżej bazie: zera)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  rozjazdy INT;
BEGIN
  SELECT COUNT(*) INTO rozjazdy
    FROM "Server" s
    LEFT JOIN (
      SELECT "serverId",
             SUM("cpuLimit")    AS cpu,
             SUM("ramLimitMb")  AS ram,
             SUM("diskLimitMb") AS disk
        FROM "Account"
       WHERE "status" <> 'DELETED'
       GROUP BY "serverId"
    ) a ON a."serverId" = s."id"
   WHERE s."allocatedCpu"    <> COALESCE(a.cpu, 0)
      OR s."allocatedMemory" <> COALESCE(a.ram, 0)
      OR s."allocatedDisk"   <> COALESCE(a.disk, 0);

  IF rozjazdy > 0 THEN
    RAISE EXCEPTION
      'Z-16: % węzłów ma księgę niezgodną z sumą limitów kont żywych', rozjazdy;
  END IF;

  RAISE NOTICE 'Z-16 OK — księga pojemności zgadza się z kontami na wszystkich węzłach';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Z-05 — zdarzenie webhooka ma stan, a stan znaczy to, co znaczy
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Trzy rzeczy, z których każda oznaczałaby powrót do stanu sprzed Z-05:
--   1. brak typu wyliczeniowego — wiersz znów nie miałby stanu,
--   2. wiersz PROCESSED bez daty przetworzenia — stan bez pokrycia w faktach,
--   3. wiersz historyczny zostawiony w PENDING — scheduler ponawiałby go
--      w nieskończoność, bo nie ma zapisanej treści, i zasypał adminów alertami.
DO $$
DECLARE
  ma_typ    BOOLEAN;
  bez_daty  INT;
  historia  INT;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StripeWebhookEventStatus')
    INTO ma_typ;
  IF NOT ma_typ THEN
    RAISE EXCEPTION
      'Z-05: brak typu StripeWebhookEventStatus — migracja odporności webhooka nie została zastosowana';
  END IF;

  SELECT COUNT(*) INTO bez_daty
    FROM "StripeWebhookEvent"
   WHERE "status" = 'PROCESSED' AND "processedAt" IS NULL;
  IF bez_daty > 0 THEN
    RAISE EXCEPTION
      'Z-05: % zdarzeń ma status PROCESSED bez daty przetworzenia', bez_daty;
  END IF;

  SELECT COUNT(*) INTO historia
    FROM "StripeWebhookEvent"
   WHERE "status" = 'PENDING' AND "payload" IS NULL;
  IF historia > 0 THEN
    RAISE EXCEPTION
      'Z-05: % zdarzeń wisi w PENDING bez zapisanej treści — nie da się ich ponowić, a scheduler będzie próbował w kółko',
      historia;
  END IF;

  RAISE NOTICE 'Z-05 OK — zdarzenia webhooka mają stan, żadne nie wisi bez treści';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Z-01 — każde obciążenie ma dokument, a każdy dokument się sumuje
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Trzy kontrole. Pierwsza jest strukturalna i NIGDY nie przechodzi pusto —
-- to ona chroni pozostałe dwie przed byciem wiecznie zielonymi na pustej
-- bazie (lekcja z X-14).
DO $$
DECLARE
  ma_kolumne  BOOLEAN;
  niespojne   INT;
  bez_dokumentu INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'WalletTransaction' AND column_name = 'invoiceId'
  ) INTO ma_kolumne;
  IF NOT ma_kolumne THEN
    RAISE EXCEPTION
      'Z-01: brak kolumny WalletTransaction.invoiceId — migracja faktury za portfel nie została zastosowana';
  END IF;

  -- Faktura, której netto + VAT nie daje brutto, jest wadliwym dokumentem
  -- księgowym (art. 106e ustawy o VAT), a nie drobnym rozjazdem wyświetlania.
  SELECT COUNT(*) INTO niespojne
    FROM "Invoice"
   WHERE "netAmount" IS NOT NULL
     AND "vatAmount" IS NOT NULL
     AND "netAmount" + "vatAmount" <> "amount";
  IF niespojne > 0 THEN
    RAISE EXCEPTION
      'Z-01: % faktur ma netto + VAT różne od kwoty brutto', niespojne;
  END IF;

  -- Obciążenie sprzedażowe starsze niż 40 dni bez faktury oznacza, że
  -- przebieg zbiorczy go przeoczył — po 40 dniach pierwszy dzień następnego
  -- miesiąca na pewno już minął.
  SELECT COUNT(*) INTO bez_dokumentu
    FROM "WalletTransaction"
   WHERE "invoiceId" IS NULL
     AND "amount" < 0
     AND "type"::text LIKE 'CHARGE_%'
     AND "createdAt" < NOW() - INTERVAL '40 days';
  IF bez_dokumentu > 0 THEN
    RAISE EXCEPTION
      'Z-01: % obciążeń sprzedażowych starszych niż 40 dni nie ma faktury', bez_dokumentu;
  END IF;

  RAISE NOTICE 'Z-01 OK — struktura na miejscu, faktury się sumują, obciążenia mają dokumenty';
END $$;
