-- M-16 — tryb wystawienia faktury wobec KSeF i termin ustawowy.
--
-- Do dziś każda niedostępność KSeF wyglądała tak samo: faktura zostawała
-- w `PENDING` i była ponawiana co 10 minut. `KsefStatus.OFFLINE` istniał
-- w enumie od początku i nie był ustawiany ani razu.
--
-- Problem nie jest kosmetyczny. Przepisy przewidują cztery różne tryby
-- wystawienia poza KSeF, z trzema różnymi terminami liczonymi od trzech
-- różnych zdarzeń: następny dzień roboczy od WYSTAWIENIA (offline24),
-- następny dzień roboczy od ZAKOŃCZENIA przerwy (niedostępność), siedem dni
-- roboczych od zakończenia (awaria), brak obowiązku (awaria całkowita).
-- Faktura czekająca, bo KSeF padł, i faktura czekająca, bo cykl nie zdążył,
-- miały w bazie ten sam stan — więc nie dało się stwierdzić, czy termin minął.

ALTER TABLE "Invoice"
  -- Tryb wystawienia. NULL = ONLINE (zwykła wysyłka, bez terminu awaryjnego).
  -- Źródłem prawdy o wartościach jest `apps/api/src/ksef/ksef-tryby.ts`;
  -- baza pilnuje tylko, żeby nie wpadło tu nic spoza listy.
  ADD COLUMN "ksefTryb"            TEXT,
  -- Kiedy PIERWSZY raz zaobserwowaliśmy, że KSeF nie odpowiada.
  ADD COLUMN "ksefNiedostepnoscOd" TIMESTAMP(3),
  -- Kiedy przerwa się skończyła. Ustawia operator przy klasyfikacji zdarzenia —
  -- rozróżnienie offline24 / niedostępność / awaria wynika z ogłoszenia w BIP MF,
  -- którego nie czytamy. Sami umiemy wykryć wyłącznie „nie odpowiada nam".
  ADD COLUMN "ksefPrzerwaDo"       TIMESTAMP(3),
  -- Termin ustawowy przesłania do KSeF, przeliczany przy każdej zmianie trybu.
  ADD COLUMN "ksefTerminDo"        TIMESTAMP(3);

-- Kod można obejść nowym serwisem, ograniczenia nie — ta sama zasada co przy
-- M-06. Lista celowo zawiera NIESKLASYFIKOWANY: to nie jest kategoria prawna,
-- tylko nasz odczyt do czasu, aż człowiek zaklasyfikuje zdarzenie.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_ksefTryb_dozwolony"
  CHECK ("ksefTryb" IS NULL OR "ksefTryb" IN (
    'ONLINE', 'OFFLINE24', 'NIEDOSTEPNOSC', 'AWARIA', 'AWARIA_CALKOWITA', 'NIESKLASYFIKOWANY'
  ));

-- Przerwa nie może się skończyć, zanim się zaczęła.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_ksefPrzerwa_kolejnosc"
  CHECK ("ksefPrzerwaDo" IS NULL OR "ksefNiedostepnoscOd" IS NULL
         OR "ksefPrzerwaDo" >= "ksefNiedostepnoscOd");

-- Zapytanie „które faktury są po terminie" musi być tanie, bo ma chodzić
-- w pętli alertowej, a nie raz na kwartał w raporcie.
CREATE INDEX "Invoice_ksefTerminDo_idx" ON "Invoice"("ksefStatus", "ksefTerminDo");
