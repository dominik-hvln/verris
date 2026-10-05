/**
 * Q-05 — pakiety e-mail marketingu („Newsletter”), które Verris sprzedaje.
 *
 * Decyzja właściciela 2026-10-05: dokończyć zakup usługi; cennik ustalony przez nas.
 * Tak jak PLAN_PRODUKCYJNY (plan-produkcyjny.ts) to jest źródło prawdy — test
 * plany-newsletter.spec.ts porównuje te liczby z migracją SQL i z treścią strony
 * (apps/www/src/lib/oferta.ts).
 *
 * CENY SĄ BRUTTO — jak w planie hostingu (patrz nagłówek plan-produkcyjny.ts).
 *
 * Produkt aplikacyjny: bez konta na węźle i bez pakietu DirectAdmina. Pola zasobów
 * hostingu są w modelu `Plan` obowiązkowe, a niezmienniki po migracji wymagają
 * wartości dodatnich (ops/sql/po-migracji-niezmienniki.sql) — stąd ZASOBY_APLIKACYJNE.
 * Nic ich nie czyta: synchronizacja pakietów DA, limity LVE i audyt węzła biorą tylko
 * plany z PLANY_Z_PAKIETEM_DA (servers/da-package-spec.ts), a wybór węzła odmawia
 * produktom aplikacyjnym (node-selector.service.ts).
 */

export interface DefinicjaPlanuNewsletter {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  emmMaxContacts: number;
  emmMonthlySends: number;
  sortOrder: number;
}

export const PLANY_NEWSLETTER: readonly DefinicjaPlanuNewsletter[] = [
  {
    id: 'c749b96a-cc1e-4854-bbfd-6f8bf1771d99',
    slug: 'newsletter-start',
    name: 'Newsletter Start',
    description:
      'Do 1 000 kontaktów i 5 000 wysyłek miesięcznie. Listy z potwierdzeniem zapisu (double opt-in), ' +
      'kampanie z panelu, wypis jednym kliknięciem.',
    priceMonthly: '19.00',
    priceYearly: '190.00',
    emmMaxContacts: 1000,
    emmMonthlySends: 5000,
    sortOrder: 20,
  },
  {
    id: '38b2ece5-4baf-436d-9260-4a0ffd21a92b',
    slug: 'newsletter-plus',
    name: 'Newsletter Plus',
    description:
      'Do 5 000 kontaktów i 25 000 wysyłek miesięcznie. Listy z potwierdzeniem zapisu (double opt-in), ' +
      'kampanie z panelu, wypis jednym kliknięciem.',
    priceMonthly: '49.00',
    priceYearly: '490.00',
    emmMaxContacts: 5000,
    emmMonthlySends: 25000,
    sortOrder: 21,
  },
];

/**
 * Wartości neutralne pól hostingowych. Dodatnie (niezmienniki), NPROC > EP + 15
 * (walidacja plans.service.ts przy edycji ceny z panelu admina), bez autoskalowania.
 */
export const ZASOBY_APLIKACYJNE = {
  cpuLimit: 1,
  ramLimitMb: 1,
  diskLimitMb: 1,
  ioLimitKbps: 1,
  iopsLimit: 1,
  entryProcesses: 1,
  nprocLimit: 17,
  autoscalingMaxOverscale: 1,
} as const;
