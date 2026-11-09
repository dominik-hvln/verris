/**
 * Paczka 121 — abonament Verris Kreator Pro jako zwykła usługa w torze subskrypcji (jak e-mail marketing).
 *
 * Decyzja właściciela 8.11.2026: 9,90 zł brutto/mies. (8,05 zł netto) albo 99 zł brutto/rok (80,49 zł netto),
 * odnowienie z portfela albo kartą, faktura jak przy innych usługach, data końca, anulowanie odnowienia.
 *
 * Jak PLANY_NEWSLETTER (plany-newsletter.ts) to jest źródło prawdy dla migracji danych
 * 20261108140100_plan_kreator_pro — test plan-kreator-pro.spec.ts porównuje te wartości z migracją SQL
 * i z cennikiem w @verris/kreator (CENA_KREATORA_PRO, wyświetlany przed wdrożeniem planu).
 * Poza tym plikiem i migracją kod czyta cenę z bazy (Plan), nie z tych stałych.
 *
 * CENY SĄ BRUTTO — konwencja Planu (plan-produkcyjny.ts): `priceMonthly` trafia wprost do obciążenia,
 * a faktura rozbija kwotę na netto + VAT 23% (`rozbicieVat`, faktura-za-portfel.ts).
 *
 * Produkt aplikacyjny: bez konta na węźle i pakietu DirectAdmina (PLANY_Z_PAKIETEM_DA go nie obejmuje,
 * wybór węzła mu odmawia). Pola zasobów hostingu — ZASOBY_APLIKACYJNE, jak przy newsletterze.
 */

export interface DefinicjaPlanuKreatoraPro {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  sortOrder: number;
}

/** Opis z migracji 20261108140100_plan_kreator_pro (paczka 121) – warunek migracji danych, która go aktualizuje. */
export const OPIS_KREATOR_PRO_121 =
  'Rozszerzona wersja Verris Kreatora: 3 propozycje projektu z każdej generacji, sekcje sklepu i bloga, ' +
  'interakcje i animacje, pełne SEO i wyższe limity. Wymaga płatnego hostingu Verris.';

/**
 * Paczka 124 – wersje językowe działają (renderer, tłumaczenie AI), więc opis planu je wymienia. W bazie zmienia go
 * migracja 20261109124100_opis_kreator_pro_jezyki (tylko gdy opis nie był zmieniony ręcznie w panelu admina).
 */
export const PLAN_KREATOR_PRO: DefinicjaPlanuKreatoraPro = {
  id: 'e0b2ca4c-8c80-4fd5-a740-40d5693ecf14',
  slug: 'kreator-pro',
  name: 'Verris Kreator Pro',
  description:
    'Rozszerzona wersja Verris Kreatora: 3 propozycje projektu z każdej generacji, sekcje sklepu i bloga, ' +
    'interakcje i animacje, pełne SEO, wersje językowe (angielski, niemiecki, ukraiński) i wyższe limity. ' +
    'Wymaga płatnego hostingu Verris.',
  priceMonthly: '9.90',
  priceYearly: '99.00',
  sortOrder: 30,
};
