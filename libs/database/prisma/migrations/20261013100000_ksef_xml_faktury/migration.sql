-- KSeF (12.10) — faktura PDF z kodem QR (KOD I) i treścią równą fakturze w KSeF.
-- KOD I zawiera SHA-256 PLIKU faktury, czyli dokładnych bajtów XML wysłanych do KSeF
-- (https://github.com/CIRFMF/ksef-docs/blob/main/kody-qr.md). XML-a nie da się odtworzyć
-- deterministycznie (Naglowek/DataWytworzeniaFa), więc zapisujemy go raz — przy pierwszej
-- potrzebie (wysyłka albo pobranie PDF) — i od tej chwili wysyłamy i wizualizujemy tylko jego.
--   "ksefXml"        — dokładna treść XML FA(3) (UTF-8),
--   "ksefXmlSha256"  — SHA-256 tych bajtów w Base64URL (skrót do linku KOD I),
--   "ksefSrodowisko" — środowisko KSeF (test/demo/prod), do którego faktura poszła; od niego
--                      zależy adres QR. Faktura z KSeF TEST zostaje z linkiem do qr-test także
--                      po przełączeniu panelu na PROD.
-- Addytywna i idempotentna (kolumny dopuszczają NULL, bez wartości domyślnej); stary kod ich
-- nie czyta ani nie pisze, więc kolejność „migrate deploy, potem kod” jest bezpieczna.

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "ksefXml" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "ksefXmlSha256" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "ksefSrodowisko" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_ksefSrodowisko_dozwolone') THEN
    ALTER TABLE "Invoice"
      ADD CONSTRAINT "Invoice_ksefSrodowisko_dozwolone"
      CHECK ("ksefSrodowisko" IS NULL OR "ksefSrodowisko" IN ('test', 'demo', 'prod'));
  END IF;
  -- Skrót bez pliku nie ma czego potwierdzać, plik bez skrótu — nie da się z niego zrobić kodu QR.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_ksefXml_ze_skrotem') THEN
    ALTER TABLE "Invoice"
      ADD CONSTRAINT "Invoice_ksefXml_ze_skrotem"
      CHECK (("ksefXml" IS NULL) = ("ksefXmlSha256" IS NULL));
  END IF;
END $$;
