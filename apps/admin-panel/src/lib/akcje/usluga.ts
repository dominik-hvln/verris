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
    opis: "Blokuje konto klienta z powodem; odwieszenie przywraca dostęp.",
    perm: "ADMIN",
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
