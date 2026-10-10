import type { AkcjaObiektu } from "./rejestr";

/**
 * Rejestr działań na usłudze (plan E, patch 9) — sekcja „Działania” na karcie usługi i Cmd+K.
 * `perm` jak w API (apps/api/src/subscriptions/*.admin.controller.ts): klasa admin/subscriptions to ADMIN
 * + SUBSCRIPTIONS_MANAGE dla STAFF, metody bez własnego @Roles — tylko ADMIN.
 */
export interface UslugaDlaAkcji {
  id: string;
  status?: string;
  /** Zakładanie konta padło (PROVISIONING + stage failed); undefined — nie wiadomo (Cmd+K). */
  zakladanieNieudane?: boolean;
  maKonto?: boolean;
  /** Konto jest, ale już usunięte (DELETED) — nie ma czego usuwać. */
  kontoUsuniete?: boolean;
  klientId?: string | null;
  wezelId?: string | null;
}

export type SekcjaUslugi = "przeglad" | "konto" | "operacje" | "migracje" | "kopie" | "zdarzenia";
export const SEKCJE_USLUGI: { klucz: SekcjaUslugi; nazwa: string }[] = [
  { klucz: "przeglad", nazwa: "Przegląd" },
  { klucz: "konto", nazwa: "Konto" },
  { klucz: "operacje", nazwa: "Operacje" },
  { klucz: "migracje", nazwa: "Migracje" },
  { klucz: "kopie", nazwa: "Kopie" },
  { klucz: "zdarzenia", nazwa: "Zdarzenia" },
];

const karta = (u: UslugaDlaAkcji, sekcja: SekcjaUslugi, kotwica: string) => `/subscriptions/${u.id}${sekcja === "przeglad" ? "" : `?sekcja=${sekcja}`}#${kotwica}`;
const konto = (u: UslugaDlaAkcji) => u.maKonto !== false;
const zakonczona = (u: UslugaDlaAkcji) => u.status === "CANCELED" || u.status === "EXPIRED";

export const AKCJE_USLUGI: AkcjaObiektu<UslugaDlaAkcji>[] = [
  {
    id: "zakladanie",
    grupa: "Naprawa",
    nazwa: "Ponów albo odrzuć zakładanie",
    opis: "Zakładanie konta się nie udało — ponów albo usuń zadanie z kolejki.",
    // admin/provisioning-queue — @StaffPerm('PROVISIONING_MANAGE').
    perm: "PROVISIONING_MANAGE",
    kiedy: (u) => u.zakladanieNieudane ?? (u.status === undefined || u.status === "PROVISIONING"),
    href: (u) => karta(u, "przeglad", "zakladanie"),
    slowa: "provisioning retry ponów odrzuć kolejka zakładania",
    pomocId: "zakladanie",
  },
  {
    id: "migracje",
    grupa: "Naprawa",
    nazwa: "Zlecenia migracji",
    opis: "Ponowienie kroku i rozwiązanie uwagi przy migracji tej usługi.",
    // admin/migrations i staff/migrations/:id/* — MIGRATIONS_MANAGE.
    perm: "MIGRATIONS_MANAGE",
    kiedy: () => true,
    href: (u) => karta(u, "migracje", "zlecenia-migracji"),
    slowa: "migracja ponów krok uwaga pilne wznów",
    pomocId: "zlecenia-migracji",
  },
  {
    id: "zawieszenie",
    grupa: "Usługa",
    nazwa: (u) => (u.status === "SUSPENDED" ? "Odwieś usługę" : "Zawieś usługę"),
    opis: "Wyłącza stronę, pocztę i FTP klienta z powodem; odwieszenie przywraca dostęp.",
    // F2.3 (D2) — POST admin/subscriptions/:id/(un)suspend: SUBSCRIPTIONS_SUSPEND (L3); L2 składa wniosek z karty.
    perm: "SUBSCRIPTIONS_SUSPEND",
    wniosek: ["SUBSCRIPTIONS_MANAGE"],
    kiedy: (u) => !zakonczona(u),
    href: (u) => karta(u, "operacje", "zawieszenie"),
    slowa: "zawieś odwieś suspend blokada",
  },
  {
    id: "zakonczenie",
    grupa: "Usługa",
    nazwa: "Zakończ i usuń konto",
    opis: "Od razu, bez czekania na koniec okresu i bez 14 dni retencji.",
    perm: "ADMIN",
    // Jak sekcja #zakonczenie na karcie: usługa trwa albo zostało konto do usunięcia.
    kiedy: (u) => !zakonczona(u) || (konto(u) && !u.kontoUsuniete),
    href: (u) => karta(u, "operacje", "zakonczenie"),
    slowa: "zakończ usuń anuluj cancel",
  },
  {
    id: "zmiana-planu",
    grupa: "Usługa",
    nazwa: "Zmiana planu",
    opis: "Inny pakiet z podglądem dopłaty albo zwrotu.",
    perm: "SUBSCRIPTIONS_MANAGE",
    kiedy: (u) => (u.status === undefined || u.status === "ACTIVE") && konto(u),
    href: (u) => karta(u, "operacje", "zmiana-planu"),
    slowa: "plan pakiet upgrade downgrade",
  },
  {
    id: "konto-klienta",
    grupa: "Konto",
    nazwa: "Konto klienta",
    opis: "Domeny, DNS, poczta, bazy, PHP i logi bez logowania na serwer.",
    perm: "ACCOUNT_DIAGNOSTICS_VIEW",
    kiedy: konto,
    href: (u) => karta(u, "konto", "konto-klienta"),
    slowa: "dns poczta bazy php logi dziennik poczty cron ssl",
  },
  {
    id: "akcje-konta",
    grupa: "Konto",
    nazwa: "Akcje na koncie",
    opis: "Reset haseł, SSL, PHP, kopia i skan bez wchodzenia na konto klienta.",
    // F2.2 — admin/subscriptions/:id/konto/akcje/* — ACCOUNT_ACTIONS (L2).
    perm: "ACCOUNT_ACTIONS",
    kiedy: (u) => konto(u) && !u.kontoUsuniete,
    href: (u) => karta(u, "konto", "akcje-konta"),
    slowa: "hasło reset skrzynka poczta ftp baza ssl certyfikat php kopia backup skan malware wirus",
    pomocId: "akcje-konta",
  },
  {
    id: "edycja-dns",
    grupa: "Konto",
    nazwa: "Edycja DNS",
    opis: "Dodanie, zmiana i usunięcie rekordów strefy klienta.",
    // F2.2 — admin/subscriptions/:id/konto/akcje/dns* — DNS_MANAGE (L3).
    perm: "DNS_MANAGE",
    kiedy: (u) => konto(u) && !u.kontoUsuniete,
    href: (u) => karta(u, "konto", "akcje-konta"),
    slowa: "dns rekord strefa a aaaa mx txt cname spf dkim",
    pomocId: "edycja-dns",
  },
  {
    id: "blokada-wysylki",
    grupa: "Konto",
    nazwa: "Zablokuj wysyłkę poczty",
    opis: "Zatrzymuje wysyłkę z konta na serwerze; zwolnienie przywraca poprzedni stan.",
    // F3.1 — admin/subscriptions/:id/konto/wysylka/(zablokuj|zwolnij) — MAIL_SEND_BLOCK (L3, NOC, abuse).
    perm: "MAIL_SEND_BLOCK",
    kiedy: (u) => konto(u) && !u.kontoUsuniete,
    href: (u) => karta(u, "konto", "poczta-konta"),
    slowa: "spam blokada wysyłki poczta smtp mail rbl zwolnij kordon",
    pomocId: "blokada-wysylki",
  },
  {
    id: "limit-wysylki",
    grupa: "Konto",
    nazwa: "Limit wysyłki konta",
    opis: "Dobowy limit wiadomości konta: sprawdzenie na serwerze, zmiana z powodem, powrót do domyślnego.",
    // F3.1 — admin/subscriptions/:id/konto/wysylka/limit — odczyt MAIL_QUEUE_VIEW (L2), zmiana MAIL_SEND_BLOCK (L3).
    perm: "MAIL_QUEUE_VIEW",
    kiedy: (u) => konto(u) && !u.kontoUsuniete,
    href: (u) => karta(u, "konto", "limit-wysylki"),
    slowa: "limit wysyłki poczta mail dobowy kampania newsletter ile maili",
    pomocId: "limit-wysylki",
  },
  {
    id: "kolejka-poczty",
    grupa: "Konto",
    nazwa: "Kolejka poczty konta",
    opis: "Wiadomości konta czekające na wysyłkę — nagłówki, bez treści.",
    // F3.1 — admin/subscriptions/:id/konto/kolejka-poczty — MAIL_QUEUE_VIEW (L2); usunięcie — MAIL_SEND_BLOCK.
    perm: "MAIL_QUEUE_VIEW",
    kiedy: (u) => konto(u) && !u.kontoUsuniete,
    href: (u) => karta(u, "konto", "poczta-konta"),
    slowa: "kolejka poczty mail queue exim zamrożone nie doszedł usuń spam",
    pomocId: "kolejka-poczty",
  },
  {
    id: "zasoby-508",
    grupa: "Konto",
    nazwa: "Zasoby i diagnoza 508",
    opis: "Odbicia od limitów (EP, NPROC, pamięć, CPU, I/O) w dobie i 7 dni, inody, 5xx i wolne SQL.",
    // F2.6 — admin/subscriptions/:id/konto/zasoby — ACCOUNT_DIAGNOSTICS_VIEW (L2).
    perm: "ACCOUNT_DIAGNOSTICS_VIEW",
    kiedy: (u) => konto(u) && !u.kontoUsuniete,
    href: (u) => karta(u, "konto", "zasoby-konta"),
    slowa: "508 limit zasoby faulty lve ep nproc pamięć cpu io inody 5xx wolne sql wolna strona",
    pomocId: "zasoby-508",
  },
  {
    id: "blokady-ip",
    grupa: "Konto",
    nazwa: "Zablokowało mi IP",
    opis: "Sprawdzenie i odblokowanie adresu klienta zablokowanego na serwerze po nieudanych logowaniach.",
    // F3.2 (D5) — admin/subscriptions/:id/konto/blokady-ip — IP_UNBLOCK (L2) albo IP_BLOCKS_NODE (NOC).
    perm: ["IP_UNBLOCK", "IP_BLOCKS_NODE"],
    kiedy: (u) => konto(u) && !u.kontoUsuniete,
    href: (u) => karta(u, "konto", "bezpieczenstwo-konta"),
    slowa: "ip blokada odblokuj zablokowało fail2ban ban unban nie mogę odebrać poczty ftp",
    pomocId: "blokady-ip",
  },
  {
    id: "kwarantanna",
    grupa: "Konto",
    nazwa: "Złośliwe pliki i kwarantanna",
    opis: "Wynik skanera konta, przeniesienie plików do kwarantanny i przywrócenie.",
    // F3.2 (G-12) — odczyt konto/malware (ACCOUNT_DIAGNOSTICS_VIEW), kwarantanna konto/akcje/kwarantanna (ACCOUNT_ACTIONS).
    perm: "ACCOUNT_DIAGNOSTICS_VIEW",
    kiedy: (u) => konto(u) && !u.kontoUsuniete,
    href: (u) => karta(u, "konto", "bezpieczenstwo-konta"),
    slowa: "malware wirus kwarantanna złośliwy kod backdoor skaner przywróć",
    pomocId: "kwarantanna",
  },
  {
    id: "trafienia-waf",
    grupa: "Konto",
    nazwa: "Trafienia WAF",
    opis: "Żądania do stron konta zablokowane albo wykryte przez zaporę aplikacji.",
    // F3.2 — admin/subscriptions/:id/konto/waf — ACCOUNT_DIAGNOSTICS_VIEW; tryb WAF zmienia tylko ADMIN.
    perm: "ACCOUNT_DIAGNOSTICS_VIEW",
    kiedy: (u) => konto(u) && !u.kontoUsuniete,
    href: (u) => karta(u, "konto", "bezpieczenstwo-konta"),
    slowa: "waf modsecurity zapora 403 forbidden reguła zablokowane",
    pomocId: "trafienia-waf",
  },
  {
    id: "diagnostyka",
    grupa: "Konto",
    nazwa: "Diagnostyka",
    opis: "Stan konta na węźle, domeny i certyfikaty.",
    perm: ["SUBSCRIPTIONS_MANAGE", "ACCOUNT_DIAGNOSTICS_VIEW", "TICKETS_MANAGE"],
    kiedy: () => true,
    href: (u) => karta(u, "konto", "diagnostyka"),
    slowa: "diagnostyka sprawdź",
  },
  {
    id: "migracja-wewnetrzna",
    grupa: "Migracje",
    nazwa: "Migracja na inny węzeł",
    opis: "Przeniesienie konta między węzłami Verris.",
    perm: "SUBSCRIPTIONS_MANAGE",
    kiedy: konto,
    href: (u) => karta(u, "migracje", "migracja-wewnetrzna"),
    slowa: "migracja wewnętrzna przenieś węzeł",
  },
  {
    id: "migracja-za-klienta",
    grupa: "Migracje",
    nazwa: "Migracja za klienta",
    opis: "Przeniesienie strony ze starego hostingu po zgodzie klienta.",
    perm: "MIGRATIONS_MANAGE",
    kiedy: konto,
    href: (u) => `/migrations/za-klienta?subscriptionId=${encodeURIComponent(u.id)}`,
    slowa: "migracja przeniesienie stary hosting zgoda",
  },
  {
    id: "odtworzenie",
    grupa: "Kopie",
    nazwa: "Odtwórz z kopii",
    opis: "Pliki, bazy albo poczta z kopii konta.",
    perm: "SUBSCRIPTIONS_MANAGE",
    kiedy: konto,
    href: (u) => karta(u, "kopie", "odtworzenie"),
    slowa: "restore kopia backup przywróć",
  },
  {
    id: "odtworzenie-na-wezle",
    grupa: "Kopie",
    nazwa: "Odtwórz na innym węźle",
    opis: "Gdy węzeł usługi nie działa — konto z kopii offsite na innym węźle.",
    perm: "ADMIN",
    kiedy: konto,
    href: (u) => karta(u, "kopie", "odtworzenie-na-wezle"),
    slowa: "awaria węzła restore offsite",
  },
  {
    id: "klient",
    grupa: "Powiązania",
    nazwa: "Karta klienta",
    opis: "Właściciel usługi: portfel, faktury, zgłoszenia.",
    perm: "CUSTOMERS_VIEW",
    kiedy: (u) => !!u.klientId,
    href: (u) => `/customers/${u.klientId}`,
    slowa: "klient właściciel",
    bezpieczna: true,
  },
  {
    id: "wezel",
    grupa: "Powiązania",
    nazwa: "Karta węzła",
    opis: "Węzeł, na którym jest konto.",
    perm: "NODES_VIEW",
    kiedy: (u) => !!u.wezelId,
    href: (u) => `/nodes/${u.wezelId}`,
    slowa: "węzeł serwer",
    bezpieczna: true,
  },
];
