-- Paczka 124 — wersje językowe stron z Kreatora Pro działają (podstrony <język>/…, tłumaczenie AI, hreflang,
-- przełącznik języka), więc opis planu Verris Kreator Pro je wymienia. Migracja danych (bez zmiany schematu).
-- Tylko gdy opis nie był zmieniony ręcznie w panelu admina (równy temu z migracji 20261108140100_plan_kreator_pro).
-- Wartości muszą być identyczne z apps/api/src/plans/plan-kreator-pro.ts — pilnuje test plan-kreator-pro.spec.ts.
UPDATE "Plan"
SET "description" = 'Rozszerzona wersja Verris Kreatora: 3 propozycje projektu z każdej generacji, sekcje sklepu i bloga, interakcje i animacje, pełne SEO, wersje językowe (angielski, niemiecki, ukraiński) i wyższe limity. Wymaga płatnego hostingu Verris.', "updatedAt" = NOW()
WHERE "id" = 'e0b2ca4c-8c80-4fd5-a740-40d5693ecf14' AND "description" = 'Rozszerzona wersja Verris Kreatora: 3 propozycje projektu z każdej generacji, sekcje sklepu i bloga, interakcje i animacje, pełne SEO i wyższe limity. Wymaga płatnego hostingu Verris.';
