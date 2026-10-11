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
  // F2.2 (D2, 10.10) — odwracalne akcje na koncie (hasła, SSL, PHP, kopia, skan) z powodem.
  'ACCOUNT_ACTIONS',
  // F3.1 (10.10) — kolejka poczty konta (nagłówki, bez treści): „gdzie jest mój mail” bez SSH.
  'MAIL_QUEUE_VIEW',
  // F3.2 (D5, 10.10) — „zablokowało mi IP”: odblokowanie IP klienta powiązanego z jego zgłoszeniem.
  'IP_UNBLOCK',
  'SUBSCRIPTIONS_MANAGE',
  'MIGRATIONS_MANAGE',
  'CUSTOMERS_IMPERSONATE',
  'NODES_VIEW',
];
const L3: readonly StaffPermission[] = [
  ...L2,
  'CUSTOMERS_MANAGE',
  'ABUSE_MANAGE',
  'CUSTOM_TERMS_MANAGE',
  'PROVISIONING_MANAGE',
  // F2.3 (D2, 10.10) — zawieszenie i odwieszenie bezpośrednio od L3; L2 składa wniosek.
  'SUBSCRIPTIONS_SUSPEND',
  // F2.2 — rekordy DNS klienta (zła zmiana wyłącza stronę i pocztę) od L3.
  'DNS_MANAGE',
  // F3.1 (D4) — blokada wysyłki konta i usunięcie jego wiadomości z kolejki (nieodwracalne) od L3.
  'MAIL_SEND_BLOCK',
  // F2.7 — domeny u rejestratora (blokada, EPP, NS, odnowienie z portfela klienta, ponowienie) od L3.
  // Odnowienie na koszt Verris (D8) wymaga jeszcze BILLING_MANAGE — czyli L4.
  'DOMAINS_MANAGE',
  // F3.7 (D2) — scalenie zgłoszeń (nieodwracalne) od L3; L1/L2 składają wniosek.
  'TICKETS_MERGE',
];
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
  'KB_MANAGE',
  // F2.4 — eksport list do CSV (dane osobowe) od kierownika zmiany.
  'EXPORT_DATA',
  // F3.7 — raporty obsługi (SLA, CSAT, wyniki osób) od kierownika zmiany.
  'TICKETS_REPORTS',
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
      'Wszystko z L1 oraz podgląd konta klienta (DNS, poczta, bazy, logi, kolejka poczty), akcje na koncie (hasła, SSL, PHP, kopia, skan, kwarantanna), odblokowanie IP klienta ze zgłoszenia, zmiany usług, migracje, wejście na konto klienta i podgląd węzłów. Nie blokuje klientów i nie rusza finansów.',
    permissions: L2,
  },
  {
    name: 'L3 Starszy specjalista',
    description:
      'Wszystko z L2 oraz zarządzanie klientami (edycja, blokady), zawieszanie usług, edycja DNS klienta, blokada wysyłki poczty, domeny u rejestratora (blokada, kod EPP, NS, odnowienie z portfela klienta, ponowienie rejestracji), scalanie zgłoszeń, nadużycia, indywidualne warunki i kolejka provisioningu. Kredyty, korekty, portfel i odnowienie domeny na koszt Verris zostają dla L4.',
    permissions: L3,
  },
  {
    name: 'L4 Kierownik zmiany',
    description:
      'Wszystko z L3 oraz faktury, korekty, portfel i kredyty, zarządzanie węzłami, podgląd planów, dziennik bezpieczeństwa, RODO, baza wiedzy, oznaczanie kont wewnętrznych, eksport list do CSV, raporty obsługi i akceptacja wniosków zespołu. Bez ustawień platformy i zarządzania pracownikami.',
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
    description: 'Kampanie i treści: pulpit z metrykami, kody promocyjne, program partnerski i baza wiedzy. Nie widzi danych klientów ani zgłoszeń.',
    permissions: ['DASHBOARD_VIEW', 'PROMO_MANAGE', 'KB_MANAGE'],
  },
  {
    name: 'Nadużycia i bezpieczeństwo',
    description:
      'Zespół abuse: zgłoszenia nadużyć, blokady kont i wysyłki poczty, zawieszanie usług, podgląd konta klienta i akcje na nim (reset hasła, skan), węzły i dziennik bezpieczeństwa. Nie rusza rozliczeń.',
    permissions: [
      'CUSTOMERS_VIEW',
      'CUSTOMERS_MANAGE',
      'SUBSCRIPTIONS_SUSPEND',
      'ACCOUNT_DIAGNOSTICS_VIEW',
      // F2.2 — przejęta skrzynka wysyła spam: reset hasła i skan bez wchodzenia na konto.
      'ACCOUNT_ACTIONS',
      // F3.1 — spam z konta: podgląd kolejki, blokada wysyłki i usunięcie wiadomości z kolejki.
      'MAIL_QUEUE_VIEW',
      'MAIL_SEND_BLOCK',
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
      'Utrzymanie floty: węzły, kolejka poczty i blokada wysyłki kont, blokady IP i biała lista, usługi i logi węzła (restart działającej usługi wspólnej przez wniosek), provisioning, migracje i usługi, podgląd konta klienta przy awariach. Nie widzi rozliczeń i nie odpowiada klientom w zgłoszeniach.',
    permissions: [
      'DASHBOARD_VIEW',
      'NODES_VIEW',
      'NODES_MANAGE',
      'PROVISIONING_MANAGE',
      'MIGRATIONS_MANAGE',
      'SUBSCRIPTIONS_MANAGE',
      'ACCOUNT_DIAGNOSTICS_VIEW',
      // F3.1 (D4) — kolejka MTA węzła (podgląd, wypchnięcie) oraz blokada wysyłki konta przy incydencie.
      'MAIL_QUEUE_NODE',
      'MAIL_QUEUE_VIEW',
      'MAIL_SEND_BLOCK',
      // F3.2 (D5) — blokady IP węzła: dowolne IP i biała lista (ignoreip) tylko NOC.
      'IP_BLOCKS_NODE',
      'IP_UNBLOCK',
      // F3.4 — usługi i logi węzła (restart działającej usługi wspólnej: wniosek do administratora).
      'NODE_SERVICES',
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
