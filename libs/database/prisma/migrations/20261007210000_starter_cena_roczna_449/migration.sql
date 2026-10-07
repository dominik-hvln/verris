-- Decyzja właściciela 07.10.2026 (wieczór): ukryty plan „Starter” (operator widzi go przy „Załóż usługę”)
-- rocznie 449 zł jak plan główny (20261007120000). Tylko gdy cena to wciąż 399.00 — ręczna zmiana w adminie zostaje.
-- Istniejące usługi trzymają cenę z zakupu do odnowienia (priceAmount na subskrypcji).
UPDATE "Plan"
SET "priceYearly" = 449.00, "updatedAt" = NOW()
WHERE "slug" = 'starter' AND "priceYearly" = 399.00;
