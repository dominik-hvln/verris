-- Stan KATALOGU po migracjach — sprawdzany WYŁĄCZNIE W CI.
--
-- To są twierdzenia o dzisiejszej decyzji handlowej: jeden publiczny pakiet
-- hostingowy, prototypy wycofane ze sprzedaży, ale nadal aktywne. Migracja
-- `plan_produkcyjny` właśnie to robi i tu sprawdzamy, że zrobiła.
--
-- DLACZEGO NIE NA PRODUKCJI: dodanie drugiego pakietu do oferty jest legalną
-- zmianą biznesową. Bramka wdrożeniowa, która by ją zablokowała, skończyłaby
-- się wyłączeniem całego sprawdzania — a wtedy przestałyby działać także te
-- kontrole, które coś znaczą. W CI zestaw danych jest kontrolowany (seed),
-- więc te twierdzenia są tam prawdziwe z definicji i mają sens jako bramka.

\set ON_ERROR_STOP on

-- ─────────────────────────────────────────────────────────────────────────────
-- Z-13 — pakiet ze strony ma DOKŁADNIE te parametry, które obiecuje oferta
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Ten blok siedział wcześniej wśród niezmienników i biegłby na produkcji.
-- Nie może: cenę planu wolno zmienić z panelu admina (plans.service.ts —
-- updatePlan), a asercja na 45,00 wywalałaby po takiej zmianie każde kolejne
-- wdrożenie z rollbackiem. Tutaj jest na miejscu — w CI cennik zmienia się
-- razem z PLAN_PRODUKCYJNY i treścią strony, w jednym commicie, i właśnie
-- o zgodę tych trzech miejsc chodzi.
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
