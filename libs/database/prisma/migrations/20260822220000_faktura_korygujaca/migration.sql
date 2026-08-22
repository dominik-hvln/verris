-- M-06 — faktura korygująca.
--
-- Do dziś w kodzie nie było ani jednego wystąpienia korekty, a builder KSeF-a
-- wpisywał `<RodzajFaktury>VAT</RodzajFaktury>` na sztywno. Pierwszy zwrot,
-- pierwsza rezygnacja w trakcie okresu i pierwsza literówka w NIP-ie wypychały
-- operatora poza system.

CREATE TYPE "InvoiceKind"    AS ENUM ('VAT', 'KOREKTA');
CREATE TYPE "CorrectionKind" AS ENUM ('WARTOSCIOWA', 'FORMALNA');

-- ── Osobna seria numeracji dla korekt ───────────────────────────────────────
-- Numer ma mówić, jakim dokumentem jest, zanim ktokolwiek go otworzy:
-- VFV/RRRR/MM/nnnn dla faktur, VFK/RRRR/MM/nnnn dla korekt.
--
-- Kolejność jest tu istotna: najpierw kolumna z wartością domyślną (wszystkie
-- istniejące liczniki to seria VFV), potem zdjęcie starego ograniczenia,
-- potem nowe. Odwrotna kolejność zostawiłaby na moment tabelę bez ograniczenia
-- unikalności, a to jest licznik numerów faktur.
ALTER TABLE "InvoiceCounter" ADD COLUMN "series" TEXT NOT NULL DEFAULT 'VFV';
ALTER TABLE "InvoiceCounter" DROP CONSTRAINT IF EXISTS "InvoiceCounter_year_month_key";
DROP INDEX IF EXISTS "InvoiceCounter_year_month_key";
CREATE UNIQUE INDEX "InvoiceCounter_series_year_month_key"
  ON "InvoiceCounter"("series", "year", "month");

-- ── Pola korekty ────────────────────────────────────────────────────────────
ALTER TABLE "Invoice"
  ADD COLUMN "kind"               "InvoiceKind" NOT NULL DEFAULT 'VAT',
  ADD COLUMN "correctedId"        TEXT,
  ADD COLUMN "correctionKind"     "CorrectionKind",
  ADD COLUMN "correctionReason"   TEXT,
  ADD COLUMN "correctedLineItems" JSONB,
  ADD COLUMN "correctedAmount"    DECIMAL(12,2),
  ADD COLUMN "correctedNet"       DECIMAL(12,2),
  ADD COLUMN "correctedVat"       DECIMAL(12,2),
  ADD COLUMN "correctedBuyer"     JSONB;

-- ON DELETE RESTRICT, nie CASCADE ani SET NULL. Faktura, do której istnieje
-- korekta, nie może zniknąć — a korekta bez wskazania faktury pierwotnej nie
-- jest dokumentem, tylko śmieciem w rejestrze VAT.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_correctedId_fkey"
  FOREIGN KEY ("correctedId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Invoice_correctedId_idx" ON "Invoice"("correctedId");
CREATE INDEX "Invoice_kind_createdAt_idx" ON "Invoice"("kind", "createdAt");

-- ── Spójność dokumentu, wymuszona przez bazę ────────────────────────────────
-- Reguły biznesowe pilnuje kod, ale te dwie są na tyle podstawowe, że mają
-- stać również w bazie: kod można obejść nowym serwisem, ograniczenia nie.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_korekta_ma_pierwotna"
  CHECK (
    ("kind" = 'VAT'     AND "correctedId" IS NULL     AND "correctionKind" IS NULL)
    OR
    ("kind" = 'KOREKTA' AND "correctedId" IS NOT NULL AND "correctionKind" IS NOT NULL
                        AND "correctionReason" IS NOT NULL)
  );

-- Korekta nie może korygować samej siebie. Bez tego wystarczyłby jeden błąd
-- w serwisie, żeby powstał dokument odsyłający do siebie — i żeby wyliczenie
-- „kwota po korekcie" weszło w nieskończoną pętlę.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_korekta_nie_do_siebie"
  CHECK ("correctedId" IS NULL OR "correctedId" <> "id");
