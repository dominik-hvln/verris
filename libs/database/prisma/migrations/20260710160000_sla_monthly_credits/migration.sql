-- Kredyty SLA: przejście z rozliczenia per incydent na rozliczenie miesięczne (§15 regulaminu).
--
-- Regulamin liczy rekompensatę z DOSTĘPNOŚCI W MIESIĄCU KALENDARZOWYM wg progów
-- 5/25/50/100%, a nie proporcjonalnie do pojedynczego incydentu. Dotychczasowy cap
-- działał per incydent, więc trzy awarie w miesiącu mogły dać do 300% opłaty.
--
-- Wzorzec expand → contract: kolumny dodajemy jako NULLABLE, `incidentId` rozluźniamy,
-- stare rekordy zostają nietknięte.

-- 1) Rozluźnij powiązanie z incydentem (rekompensata miesięczna nie ma jednego incydentu).
ALTER TABLE "SlaCredit" ALTER COLUMN "incidentId" DROP NOT NULL;

-- 2) Nowe pola rozliczenia miesięcznego.
ALTER TABLE "SlaCredit" ADD COLUMN IF NOT EXISTS "periodStart"    TIMESTAMP(3);
ALTER TABLE "SlaCredit" ADD COLUMN IF NOT EXISTS "availabilityBp" INTEGER;
ALTER TABLE "SlaCredit" ADD COLUMN IF NOT EXISTS "tierPercent"    INTEGER;

-- 3) Jedna rekompensata na usługę na miesiąc.
--    Postgres traktuje NULL jako różne, więc stare rekordy (periodStart IS NULL)
--    nie kolidują ze sobą — unikat obowiązuje wyłącznie dla rozliczeń miesięcznych.
--    Ten sam indeks blokuje podwójną wypłatę, gdy kredyt przyznano ręcznie na wniosek.
CREATE UNIQUE INDEX IF NOT EXISTS "SlaCredit_subscriptionId_periodStart_key"
  ON "SlaCredit" ("subscriptionId", "periodStart");

-- 4) Ustawienie platformy: limit okien konserwacyjnych odliczanych od przestoju.
--    §15 ust. 5 — prace zapowiedziane ≥48 h wcześniej, łącznie nie więcej niż 8 h/mies.
INSERT INTO "platform_settings" ("key", "value", "updatedAt")
VALUES ('sla.maintenanceCapMinutes', '480', NOW())
ON CONFLICT ("key") DO NOTHING;
