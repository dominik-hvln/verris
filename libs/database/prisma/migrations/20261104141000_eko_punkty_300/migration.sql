-- X1 (4.11.2026, decyzja 16) — wymiana punktów EKO: 300 pkt = 1 drzewo (wcześniej domyślnie 1000).
-- Zmieniamy tylko wiersz z dawną wartością domyślną z seeda (20260519120000); wartość ustawioną ręcznie w adminie zostawiamy.
UPDATE "platform_settings" SET "value" = '300', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'eco.pointsPerTree' AND "value" = '1000';
