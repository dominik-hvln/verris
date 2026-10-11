-- Audyt Fal 2 (11.10) — tablica migracji: historia sprzed tablicy bez fali alertów „po terminie” zaraz po wdrożeniu.
-- 20261011120000 przeniósł do „Zamknięta” tylko COMPLETED z przełączonym DNS. Pozostałe wiersze sprzed tablicy (w toku,
-- wymaga uwagi, w kolejce, czeka na zgodę, ukończone bez przełączenia DNS) zostały w „Nowa” z terminem domyślnym
-- createdAt + 3 dni — dawno minionym, więc pierwszy przebieg alertu (co godzinę) wysłał krytyczne „po terminie” do
-- wszystkich operatorów migracji. Termin takiego wiersza liczymy od wdrożenia (te same 3 dni co SLA_DNI w kodzie):
-- karta dostaje normalny cykl „termin się zbliża” → „po terminie”, a nie alarm za czas, gdy tablicy nie było.
-- Nieudanych (FAILED) i anulowanych nie ruszamy — nie mają terminu (tablica-migracji.ts terminMigracji).
-- Tylko dane (bez zmian schematu), addytywna i idempotentna: dotyka wyłącznie wierszy, których etapu i terminu nikt
-- nie ustawił, a termin domyślny już minął; po przebiegu ich termin jest w przyszłości, więc drugi przebieg ich nie
-- zmienia. Stary kod (przed podmianą) pola termin nie czyta — kolejność „migrate deploy, potem kod” jest bezpieczna.
UPDATE "MigrationRequest"
SET "termin" = now() + interval '3 days'
WHERE "etapObslugi" = 'NOWA'
  AND "etapOd" IS NULL
  AND "termin" IS NULL
  AND "status" NOT IN ('CANCELED', 'FAILED')
  AND "createdAt" + interval '3 days' <= now();
