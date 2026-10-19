-- Decyzja właściciela 19.10.2026: pakiet opisujemy jako limity (50 GB NVMe, 8 GB RAM, 2 vCPU), które z autoskalowaniem
-- rosną do 1000 GB, 64 GB RAM i 24 vCPU. RAM i CPU to limity LVE, nie rezerwacja (strażnik Z-14, oferta-zgodnosc.spec.ts).
-- Tylko gdy opis nie był zmieniony ręcznie w panelu admina (równy temu z migracji 20260822120000_plan_produkcyjny).
UPDATE "Plan"
SET "description" = 'Jeden pakiet hostingu współdzielonego z autoskalowaniem. Limity w pakiecie: 50 GB NVMe, 8 GB RAM i 2 vCPU; z autoskalowaniem rosną do 1000 GB, 64 GB RAM i 24 vCPU i wracają po piku. Bez limitu stron, skrzynek i transferu w ramach zasobów konta.', "updatedAt" = NOW()
WHERE "id" = '7f3a1c62-9b84-4d51-a0e7-2c5d8e14b903' AND "description" = 'Jeden pakiet hostingu współdzielonego z autoskalowaniem. Baza 50 GB NVMe, do 8 GB RAM i do 2 vCPU; w piku zasoby rosną automatycznie i wracają po piku. Bez limitu stron, skrzynek i transferu w ramach zasobów konta.';
