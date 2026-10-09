-- Decyzja 09.10 — cena netto (np, nabywca spoza UE) tylko po ręcznej weryfikacji przez obsługę.
-- Firma z UE: bez zmian, jej status sprawdza VIES przy każdej płatności (billing/vies.service.ts).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vatWeryfikacjaAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vatWeryfikacjaPrzez" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vatWeryfikacjaPodstawa" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vatWeryfikacjaKraj" TEXT;

-- Konta z krajem spoza UE dotąd dostawały cenę netto bez żadnej weryfikacji. Od wdrożenia są
-- niezweryfikowane (od następnego doładowania 23%) — każde dostaje wpis w dzienniku, żeby zmiana
-- nie była cicha i obsługa wiedziała, kogo zweryfikować. Warunek „poza UE” = normalizujKraj() z
-- apps/api/src/billing/vat.ts: kod ISO z 2 liter, nie PL i nie z listy STAWKI_UE (EL = Grecja).
INSERT INTO "AuditLog" ("id", "action", "details", "userId", "createdAt")
SELECT gen_random_uuid()::text,
       'VAT_NABYWCA_WERYFIKACJA_WYMAGANA',
       jsonb_build_object(
         'kraj', upper(btrim(u."country")),
         'powod', 'Migracja 20261009180000: cena netto poza UE wymaga weryfikacji przez obsługę — do tego czasu 23% VAT.'
       ),
       u."id",
       CURRENT_TIMESTAMP
FROM "User" u
WHERE upper(btrim(u."country")) ~ '^[A-Z]{2}$'
  AND upper(btrim(u."country")) NOT IN (
    'PL', 'EL',
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU',
    'MT','NL','PT','RO','SK','SI','ES','SE'
  )
  AND u."anonymizedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "AuditLog" a WHERE a."userId" = u."id" AND a."action" = 'VAT_NABYWCA_WERYFIKACJA_WYMAGANA'
  );
