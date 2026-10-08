import type { StaffPermission } from './staff-permissions.catalog.js';

/**
 * PB-47 — role systemowe (decyzje właściciela 08.10). Źródłem prawdy jest ten plik: StaffRolesService
 * wgrywa je przy starcie modułu (INSERT … ON CONFLICT (name) DO UPDATE tylko dla isSystem), więc zmiana
 * definicji tutaj trafia do bazy przy wdrożeniu bez osobnej migracji danych. W panelu nie da się ich
 * edytować ani usunąć — można je sklonować jako rolę własną.
 *
 * Szczeble L1–L4 są kumulatywne: każdy ma wszystko z niższego (test w role-systemowe.spec.ts).
 * Operator może mieć kilka ról naraz — uprawnienia się sumują (uprawnienia-operatora.ts).
 */
export interface RolaSystemowa {
  name: string;
  description: string;
  permissions: readonly StaffPermission[];
}

const L1: readonly StaffPermission[] = ['DASHBOARD_VIEW', 'CUSTOMERS_VIEW', 'TICKETS_VIEW', 'TICKETS_MANAGE', 'BILLING_VIEW'];
const L2: readonly StaffPermission[] = [
  ...L1,
  'ACCOUNT_DIAGNOSTICS_VIEW',
  'SUBSCRIPTIONS_MANAGE',
  'MIGRATIONS_MANAGE',
  'CUSTOMERS_IMPERSONATE',
  'NODES_VIEW',
];
const L3: readonly StaffPermission[] = [...L2, 'CUSTOMERS_MANAGE', 'ABUSE_MANAGE', 'CUSTOM_TERMS_MANAGE', 'PROVISIONING_MANAGE'];
const L4: readonly StaffPermission[] = [
  ...L3,
  // Kredyty, korekty i portfel dopiero od L4 (decyzja 08.10).
  'BILLING_MANAGE',
  'NODES_MANAGE',
  'PLANS_MANAGE',
  'AUDIT_VIEW',
  'COMPLIANCE_MANAGE',
  'CUSTOMERS_INTERNAL_FLAG',
  'REQUESTS_APPROVE',
];

/** Szczeble obsługi w kolejności rosnącej. */
export const SZCZEBLE: readonly RolaSystemowa[] = [
  {
    name: 'L1 Konsultant',
    description:
      'Pierwsza linia obsługi: odpowiada na zgłoszenia, widzi klientów i ich rozliczenia. Nie zmienia usług, nie wchodzi na konto klienta i nie przyznaje kredytów.',
    permissions: L1,
  },
  {
    name: 'L2 Specjalista techniczny',
    description:
      'Wszystko z L1 oraz podgląd konta klienta (DNS, poczta, bazy, logi), zmiany usług, migracje, wejście na konto klienta i podgląd węzłów. Nie blokuje klientów i nie rusza finansów.',
    permissions: L2,
  },
  {
    name: 'L3 Starszy specjalista',
    description:
      'Wszystko z L2 oraz zarządzanie klientami (edycja, blokady), nadużycia, indywidualne warunki i kolejka provisioningu. Kredyty, korekty i portfel zostają dla L4.',
    permissions: L3,
  },
  {
    name: 'L4 Kierownik zmiany',
    description:
      'Wszystko z L3 oraz faktury, korekty, portfel i kredyty, zarządzanie węzłami i planami, dziennik bezpieczeństwa, RODO, oznaczanie kont wewnętrznych i akceptacja wniosków zespołu. Bez ustawień platformy i zarządzania pracownikami.',
    permissions: L4,
  },
];

/** Role funkcyjne (działy) — łączone ze szczeblem albo przydzielane samodzielnie. */
export const ROLE_FUNKCYJNE: readonly RolaSystemowa[] = [
  {
    name: 'Finanse i księgowość',
    description:
      'Księgowość i rozliczenia: faktury, korekty, portfel i kredyty klientów oraz zgłoszenia w sprawach płatności. Nie zmienia usług ani infrastruktury.',
    permissions: ['DASHBOARD_VIEW', 'CUSTOMERS_VIEW', 'BILLING_VIEW', 'BILLING_MANAGE', 'TICKETS_VIEW', 'TICKETS_MANAGE'],
  },
  {
    name: 'Sprzedaż i partnerzy',
    description:
      'Opiekunowie handlowi: indywidualne warunki, kody promocyjne i program partnerski, rozmowy z klientami w zgłoszeniach. Nie przyznaje kredytów i nie wystawia korekt.',
    permissions: ['DASHBOARD_VIEW', 'CUSTOMERS_VIEW', 'BILLING_VIEW', 'CUSTOM_TERMS_MANAGE', 'PROMO_MANAGE', 'TICKETS_VIEW', 'TICKETS_MANAGE'],
  },
  {
    name: 'Marketing',
    description: 'Kampanie i promocje: pulpit z metrykami oraz kody promocyjne i program partnerski. Nie widzi danych klientów ani zgłoszeń.',
    permissions: ['DASHBOARD_VIEW', 'PROMO_MANAGE'],
  },
  {
    name: 'Nadużycia i bezpieczeństwo',
    description:
      'Zespół abuse: zgłoszenia nadużyć, blokady kont, podgląd konta klienta, węzłów i dziennika bezpieczeństwa. Nie rusza rozliczeń.',
    permissions: [
      'CUSTOMERS_VIEW',
      'CUSTOMERS_MANAGE',
      'ACCOUNT_DIAGNOSTICS_VIEW',
      'ABUSE_MANAGE',
      'AUDIT_VIEW',
      'NODES_VIEW',
      'TICKETS_VIEW',
      'TICKETS_MANAGE',
    ],
  },
  {
    name: 'Inżynier infrastruktury (NOC/DevOps)',
    description:
      'Utrzymanie floty: węzły, provisioning, migracje i usługi, podgląd konta klienta przy awariach. Nie widzi rozliczeń i nie odpowiada klientom w zgłoszeniach.',
    permissions: [
      'DASHBOARD_VIEW',
      'NODES_VIEW',
      'NODES_MANAGE',
      'PROVISIONING_MANAGE',
      'MIGRATIONS_MANAGE',
      'SUBSCRIPTIONS_MANAGE',
      'ACCOUNT_DIAGNOSTICS_VIEW',
      'TICKETS_VIEW',
    ],
  },
  {
    name: 'Inspektor ochrony danych (IOD)',
    description:
      'Sprawy RODO: wnioski o dane i usunięcie, dziennik bezpieczeństwa, korespondencja z klientem w zgłoszeniach. Nie zmienia usług ani rozliczeń.',
    permissions: ['CUSTOMERS_VIEW', 'COMPLIANCE_MANAGE', 'AUDIT_VIEW', 'TICKETS_VIEW', 'TICKETS_MANAGE'],
  },
  {
    name: 'Audytor (tylko podgląd)',
    description:
      'Przegląd bez prawa zmian: pulpit, klienci, zgłoszenia, rozliczenia, węzły i dziennik bezpieczeństwa. Nie wykonuje żadnej operacji.',
    permissions: ['DASHBOARD_VIEW', 'CUSTOMERS_VIEW', 'TICKETS_VIEW', 'BILLING_VIEW', 'NODES_VIEW', 'AUDIT_VIEW'],
  },
];

export const ROLE_SYSTEMOWE: readonly RolaSystemowa[] = [...SZCZEBLE, ...ROLE_FUNKCYJNE];
