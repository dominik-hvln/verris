-- Paczka 123 (8.11.2026) – Verris Kreator: brief strony zapisany przy tworzeniu. Ponowna generacja
-- (POST /kreator/strony/:id/generuj-ponownie – „Spróbuj ponownie” po błędzie i „Wygeneruj od nowa” w edytorze)
-- bierze opis z bazy zamiast z pamięci przeglądarki. Strony sprzed migracji mają NULL (ponowna generacja niemożliwa).

-- AlterTable
ALTER TABLE "KreatorStrona" ADD COLUMN "brief" JSONB;
