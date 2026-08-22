-- NIEZMIENNIKI po `prisma migrate deploy` — sprawdzane RÓWNIEŻ NA PRODUKCJI.
--
-- Ten plik zawiera wyłącznie twierdzenia, których NIE MOŻE unieważnić żadna
-- legalna zmiana biznesowa: istnienie kolumn i typów, zgodność sum na
-- dokumentach, spójność księgi pojemności z kontami, sensowność stanów.
-- Naruszenie któregokolwiek znaczy, że migracja zostawiła bazę w stanie,
-- w którym kod będzie się mylił — dlatego kończą się `RAISE EXCEPTION`,
-- a wdrożenie ma się wtedy wycofać.
--
-- CZEGO TU NIE MA I DLACZEGO
-- ──────────────────────────
-- Twierdzeń o KATALOGU (np. „dokładnie jeden publiczny pakiet hostingowy") —
-- one opisują dzisiejszą decyzję handlową, nie niezmiennik. Dodanie drugiego
-- pakietu jest legalną zmianą, a bramka, która by ją zablokowała, kazałaby
-- komuś wyłączyć całe sprawdzanie. Siedzą w `po-migracji-katalog.sql`
-- i biegną wyłącznie w CI, na kontrolowanym zestawie danych.
--
-- Twierdzeń o HISTORII (np. „nie ma starych obciążeń bez faktury") — te mówią
-- o danych sprzed migracji, których migracja nie naprawia i nie miała naprawiać.
-- Wycofanie wdrożenia z powodu zaszłości byłoby karą za przeszłość, nie
-- ochroną przed błędem. Siedzą w `po-migracji-historia.sql` i tylko raportują.

\set ON_ERROR_STOP on

-- ─────────────────────────────────────────────────────────────────────────────
-- Z-13 — pakiet, którego slug jest ZAPISANY W KODZIE, istnieje w bazie
-- ─────────────────────────────────────────────────────────────────────────────
--
-- To jest twierdzenie o zgodności kodu z danymi, nie o cenniku. Slug
-- 'verris-hosting' stoi na sztywno w apps/api/src/plans/plan-produkcyjny.ts
-- i z tego rekordu czyta wycena zamówienia, placement konta na węźle,
-- synchronizacja pakietów DirectAdmina i sufity autoskalowania. Brak wiersza
-- to dokładnie awaria Z-13: strona sprzedaje coś, czego nie da się kupić.
--
-- KONKRETNYCH WARTOŚCI (45,00 / 399,00 / 200 / 8192 / 51200) TU NIE MA
-- ────────────────────────────────────────────────────────────────────
-- i to jest zmiana wobec pierwszej wersji tego pliku. Cenę planu wolno
-- zmienić z panelu admina (plans.service.ts — updatePlan). Gdyby ta asercja
-- pilnowała 45,00 na produkcji, pierwsza legalna podwyżka wywalałaby KAŻDE
-- kolejne wdrożenie z rollbackiem — a wtedy ktoś słusznie wyłączyłby całe
-- sprawdzanie. Wartości pilnuje `po-migracji-katalog.sql` w CI, gdzie zmiana
-- cennika idzie razem ze zmianą PLAN_PRODUKCYJNY w jednym commicie.
DO $$
DECLARE
  ile INT;
BEGIN
  SELECT COUNT(*) INTO ile FROM "Plan" WHERE "slug" = 'verris-hosting';

  IF ile = 0 THEN
    RAISE EXCEPTION
      'Z-13: planu verris-hosting NIE MA w bazie po migracjach — kod czyta ten slug na sztywno';
  END IF;

  RAISE NOTICE 'Z-13 OK — plan verris-hosting jest w bazie';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Z-13 — cennik jest sensowny, niezależnie od tego, ile wynosi
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Ta sama reguła, którą API wymusza przy zapisie (plans.service.ts,
-- validatePricingConsistency): ceny dodatnie, rok nie tańszy niż 6 miesięcy.
-- API pilnuje jej przy zapisie z panelu, baza nie pilnuje jej wcale, a migracja
-- danych zapisuje z pominięciem API — więc to jest dokładnie ta luka, przez
-- którą migracja może wstawić cennik, na którym kod policzy bzdurę.
DO $$
DECLARE
  bledne INT;
BEGIN
  SELECT COUNT(*) INTO bledne
    FROM "Plan"
   WHERE "priceMonthly" <= 0
      OR "priceYearly" <= 0
      OR "priceYearly" < "priceMonthly" * 6;
  IF bledne > 0 THEN
    RAISE EXCEPTION
      'Z-13: % planów ma cennik niezgodny z regułą API (ceny dodatnie, rok >= 6x miesiąc)', bledne;
  END IF;

  SELECT COUNT(*) INTO bledne
    FROM "Plan"
   WHERE "cpuLimit" <= 0 OR "ramLimitMb" <= 0 OR "diskLimitMb" <= 0
      OR ("includedTransferGb" IS NOT NULL AND "includedTransferGb" <= 0);
  IF bledne > 0 THEN
    RAISE EXCEPTION
      'Z-13: % planów ma niedodatni limit bazowy — placement konta liczyłby z tego bzdury', bledne;
  END IF;

  RAISE NOTICE 'Z-13 OK — cenniki i limity bazowe planów są sensowne';
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

  RAISE NOTICE 'Z-01 OK — struktura na miejscu, faktury się sumują';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- M-06 — korekta jest korektą, a nie fakturą z inną kwotą
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  ma_typ     BOOLEAN;
  osierocone INT;
  bez_serii  INT;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoiceKind') INTO ma_typ;
  IF NOT ma_typ THEN
    RAISE EXCEPTION
      'M-06: brak typu InvoiceKind — migracja faktury korygującej nie została zastosowana';
  END IF;

  -- Ograniczenia CHECK pilnują tego przy zapisie, ale asercja sprawdza stan
  -- FAKTYCZNY — także po ręcznych poprawkach w bazie, których CHECK z czasów
  -- sprzed migracji by nie objął.
  SELECT COUNT(*) INTO osierocone
    FROM "Invoice"
   WHERE ("kind" = 'KOREKTA' AND ("correctedId" IS NULL OR "correctionReason" IS NULL))
      OR ("kind" = 'VAT'     AND "correctedId" IS NOT NULL);
  IF osierocone > 0 THEN
    RAISE EXCEPTION
      'M-06: % dokumentów ma niespójny rodzaj — korekta bez faktury pierwotnej albo faktura z korygowaną', osierocone;
  END IF;

  -- Numer korekty musi być z serii VFK. Korekta w serii faktur znaczy, że numer
  -- przestał mówić, jakim dokumentem jest — a to był cały powód rozdzielenia.
  SELECT COUNT(*) INTO bez_serii
    FROM "Invoice"
   WHERE "kind" = 'KOREKTA' AND "number" NOT LIKE 'VFK/%';
  IF bez_serii > 0 THEN
    RAISE EXCEPTION 'M-06: % korekt ma numer spoza serii VFK', bez_serii;
  END IF;

  -- Rozbicia różnicy (netto + VAT = brutto) NIE sprawdzamy tutaj drugi raz.
  -- Korekta jest wierszem w "Invoice", więc obejmuje ją kontrola Z-01 powyżej,
  -- i to ona zapala się pierwsza. Druga kopia tej samej reguły nigdy by nie
  -- wystartowała, a przy zmianie zasad ktoś poprawiłby jedną z dwóch —
  -- dokładnie ten błąd („bliźniacze miejsca") dał Z-12, Z-16 i błędy zmiany
  -- planu. Jedna reguła, jedno miejsce.
  RAISE NOTICE 'M-06 OK — korekty mają faktury pierwotne i serię VFK (sumy: patrz Z-01)';
END $$;
