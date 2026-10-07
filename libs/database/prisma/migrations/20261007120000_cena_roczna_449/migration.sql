-- Decyzja właściciela 07.10.2026: hosting rocznie 449 zł brutto (było 399 zł); miesięcznie bez zmian 45 zł.
-- Tylko gdy cena nie była już zmieniona ręcznie w panelu admina (inna niż dotychczasowa 399.00).
UPDATE "Plan"
SET "priceYearly" = 449.00, "updatedAt" = NOW()
WHERE "id" = '7f3a1c62-9b84-4d51-a0e7-2c5d8e14b903' AND "priceYearly" = 399.00;
