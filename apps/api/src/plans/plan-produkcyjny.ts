/**
 * Z-13 — definicja pakietu, który Verris naprawdę sprzedaje.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PO CO TEN PLIK ISTNIEJE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Do 2026-08-22 strona sprzedawała pakiet za 45 zł z bazą 50 GB / 8 GB / 2 vCPU,
 * a w bazie danych nie było planu o takich limitach ani o takiej cenie. Były
 * trzy plany z czasów prototypu — starter / pro / business po 19,99 / 49,99 /
 * 99,99 zł — z zupełnie innymi zasobami.
 *
 * Skutek nie kończył się na cenniku. Z `Plan` czyta:
 *   · wycena zamówienia i odnowienia (subscriptions.service.ts)
 *   · placement konta na węźle (node-selector.service.ts — limity bazowe)
 *   · synchronizacja pakietów DirectAdmina (prod-sync-server-da-packages.sh)
 *   · sufity autoskalowania (autoscaling-engine.service.ts)
 *
 * Czyli: bez tego rekordu nie dało się kupić tego, co reklamuje strona — a to,
 * co dało się kupić, miało inne limity niż obietnica.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TO JEST ŹRÓDŁO PRAWDY, NIE KOPIA
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Ten obiekt jest porównywany testem z DWOMA innymi miejscami:
 *   1. z treścią strony (`apps/www/src`) — czy sprzedajemy to, co opisujemy,
 *   2. z migracją SQL — czy w bazie wyląduje dokładnie to, co tu stoi.
 *
 * Rozjazd któregokolwiek z nich zapala test na czerwono. To jest ta sama
 * technika, co uzgodnienie DTO z guardem bashowym w Z-03: dwie warstwy, jedna
 * prawda, test na zgodę między nimi.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CENY SĄ BRUTTO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `Plan.priceMonthly` trafia wprost do kwoty obciążenia, a `invoices.service.ts`
 * traktuje sumę jako brutto i rozbija ją na netto + VAT 23% („assuming 23%
 * inclusive on totalGross", :293). Wpisanie tu netto zawyżyłoby każdą fakturę
 * o 23%.
 */

/** Stałe UUID — plan ma mieć to samo `id` na każdym środowisku. */
export const ID_PLANU_PRODUKCYJNEGO = '7f3a1c62-9b84-4d51-a0e7-2c5d8e14b903';

export interface DefinicjaPlanu {
  id: string;
  slug: string;
  name: string;
  description: string;
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
  ioLimitKbps: number;
  iopsLimit: number;
  entryProcesses: number;
  nprocLimit: number;
  includedTransferGb: number | null;
  priceMonthly: string;
  priceYearly: string;
  currency: string;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  trialDays: number;
  productKind: 'HOSTING';
  supportSlaHours: number;
  sshAccess: boolean;
  autoscalingMaxOverscaleCpu: number;
  autoscalingMaxOverscaleRam: number;
  autoscalingMaxOverscaleDisk: number;
}

export const PLAN_PRODUKCYJNY: DefinicjaPlanu = {
  id: ID_PLANU_PRODUKCYJNEGO,
  slug: 'verris-hosting',
  name: 'Hosting Verris z autoskalowaniem',
  description:
    'Jeden pakiet hostingu współdzielonego z autoskalowaniem. Baza 50 GB NVMe, ' +
    'do 8 GB RAM i do 2 vCPU; w piku zasoby rosną automatycznie i wracają po piku. ' +
    'Bez limitu stron, skrzynek i transferu w ramach zasobów konta.',

  // ── Limity bazowe (LVE) ────────────────────────────────────────────────────
  // cpuLimit jest w SPEED% — 100 = jeden rdzeń. „2 vCPU" = 200.
  cpuLimit: 200,
  ramLimitMb: 8 * 1024,
  diskLimitMb: 50 * 1024,

  // Nie są reklamowane na stronie, więc nie da się ich z niej wyprowadzić.
  // Wartości z górnej półki dawnego planu „business" — jedynego seedowego
  // planu o zbliżonej klasie. Do rewizji po pomiarze na węźle #1 (PB-02).
  ioLimitKbps: 40960,
  iopsLimit: 4096,
  entryProcesses: 80,
  nprocLimit: 100,

  // „Transfer — bez limitu" (Pricing.tsx). null = bez limitu.
  includedTransferGb: null,

  // ── Cena — BRUTTO, patrz nagłówek pliku ────────────────────────────────────
  priceMonthly: '45.00',
  priceYearly: '399.00',
  currency: 'PLN',

  isPublic: true,
  isActive: true,
  sortOrder: 1,

  // Strona nie obiecuje okresu próbnego. 0 = brak.
  trialDays: 0,
  productKind: 'HOSTING',

  // SLA 99,5% na stronie dotyczy DOSTĘPNOŚCI, nie czasu odpowiedzi wsparcia.
  // Czasu odpowiedzi nikt jeszcze nie zadeklarował — wpisanie tu liczby byłoby
  // wymyśleniem zobowiązania. Ustala PB-03 (dokumenty prawne).
  supportSlaHours: 0,

  // Dostęp SSH nie jest reklamowany w cenniku. Domyślnie wyłączony (CageFS).
  sshAccess: false,

  // ── Sufity autoskalowania ──────────────────────────────────────────────────
  // Wyprowadzone wprost z obietnicy na stronie: „skalowanie do 1000 GB,
  // 64 GB RAM, 24 vCPU". Krotność liczona względem bazy:
  //   CPU   2 vCPU → 24 vCPU  = 12×
  //   RAM   8 GB   → 64 GB    =  8×
  //   dysk  50 GB  → 1000 GB  = 20×
  //
  // UWAGA — patrz Z-16: silnik autoskalowania przycina te krotności do 10×
  // (`autoscaling-engine.service.ts:287`), więc sufit CPU i dysku NIE JEST
  // dziś osiągalny. Wartości zostają zgodne z ofertą, bo to one są prawdą
  // handlową; rozbieżność jest pilnowana testem i zamknięta w Z-16.
  autoscalingMaxOverscaleCpu: 12,
  autoscalingMaxOverscaleRam: 8,
  autoscalingMaxOverscaleDisk: 20,
};

/** Plany z czasów prototypu — wycofywane ze sprzedaży przez migrację Z-13. */
export const SLUGI_PLANOW_PROTOTYPOWYCH = ['starter', 'pro', 'business'] as const;

/**
 * Sufity wynikające z oferty, w jednostkach docelowych. Używane przez test
 * uzgadniający treść strony z definicją planu.
 */
export const SUFITY_Z_OFERTY = {
  cpuVCpu: 24,
  ramGb: 64,
  diskGb: 1000,
} as const;

/** Baza wynikająca z oferty, w jednostkach docelowych. */
export const BAZA_Z_OFERTY = {
  cpuVCpu: 2,
  ramGb: 8,
  diskGb: 50,
} as const;
