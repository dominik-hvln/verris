-- Paczka 121 — abonament Verris Kreator Pro jako produkt w torze subskrypcji (decyzja właściciela 8.11.2026).
-- Nowa wartość enuma ProductKind. Osobna migracja przed wstawieniem planu: PostgreSQL nie pozwala użyć
-- wartości enuma dodanej w tej samej transakcji (tak samo rozdzielono EMAIL_MARKETING: 20260701 → 20261005).
ALTER TYPE "ProductKind" ADD VALUE IF NOT EXISTS 'KREATOR_PRO';
