-- Decyzja 07.10: nowe konta z WAF w trybie blokowania (obiecujemy „blokuje typowe ataki”).
-- Tryb ON = brak bloku w .htaccess, czyli konfiguracja serwera (CustomBuild modsecurity + OWASP CRS, SecRuleEngine On).
ALTER TABLE "Account" ALTER COLUMN "wafMode" SET DEFAULT 'ON';

-- Konta z DETECTION, którym nigdy nie zastosowano trybu (wafAppliedAt IS NULL), nie mają bloku w .htaccess —
-- na węźle już blokują. Zapis w bazie dorównuje temu, co działa; konta z ręcznie wybraną detekcją zostają.
UPDATE "Account" SET "wafMode" = 'ON' WHERE "wafMode" = 'DETECTION' AND "wafAppliedAt" IS NULL;
