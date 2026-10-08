/**
 * PB-43 — runbooki obsługi: najczęstsze sprawy klientów jako lista kroków przy zgłoszeniu.
 * Jedno źródło dla API (walidacja klucza zapisanego na zgłoszeniu) i panelu obsługi (lista kontrolna).
 * Klucze `hosting-dns-tls-check` i `billing-payment-check` zostają — są już zapisane na zgłoszeniach.
 * Kroki mówią, CO sprawdzić w panelu obsługi; nazwy węzłów widzi tylko obsługa, nie klient.
 */
export interface Runbook {
  klucz: string;
  nazwa: string;
  /** Kiedy po niego sięgnąć — jedno zdanie dla obsługi. */
  kiedy: string;
  kroki: readonly string[];
}

export const RUNBOOKI: readonly Runbook[] = [
  {
    klucz: 'strona-nie-dziala',
    nazwa: 'Strona nie działa (5xx / timeout)',
    kiedy: 'Błąd 500/502/503/504, biała strona albo strona ładuje się bez końca.',
    kroki: [
      'Uruchom „Diagnostykę” usługi: zawieszenie, konto na serwerze, stan węzła',
      'Jedna domena czy cały węzeł? Sprawdź zdarzenia usług i inne zgłoszenia z tego węzła',
      'Limity zasobów konta (CPU, RAM, procesy) — czy strona nie dobija do limitu',
      'Ostatnie wpisy w logu błędów strony i ostatnie zmiany (wtyczki, .htaccess, wersja PHP)',
      'Strona odpowiada poprawnie z zewnątrz — potwierdź przed odpowiedzią',
      'Klient wie, co było przyczyną i czy musi coś zrobić',
    ],
  },
  {
    klucz: 'poczta',
    nazwa: 'Poczta nie przychodzi / nie wychodzi',
    kiedy: 'Wiadomości nie docierają, odbijają się albo trafiają do spamu.',
    kroki: [
      'Uruchom „Diagnostykę” usługi: rekordy MX, SPF, DKIM, DMARC i listy blokujące',
      'Skrzynka istnieje, ma miejsce i nie przekroczyła limitu wysyłki',
      'Treść odbicia (bounce) od klienta albo z logu — kod i powód odrzucenia',
      'Ustawienia programu pocztowego klienta (serwer, port, szyfrowanie, logowanie)',
      'Wiadomość testowa w obie strony doszła',
      'Klient wie, co zmieniliśmy i co ewentualnie ma ustawić u siebie',
    ],
  },
  {
    klucz: 'ssl',
    nazwa: 'Certyfikat SSL / ostrzeżenie przeglądarki',
    kiedy: 'Przeglądarka ostrzega o połączeniu, certyfikat wygasł albo nie obejmuje domeny.',
    kroki: [
      'Uruchom „Diagnostykę” usługi: ważność certyfikatu i rekordy DNS domeny',
      'Domena (i www) wskazuje na nasz serwer — inaczej certyfikat się nie wystawi',
      'Certyfikat obejmuje wszystkie nazwy, z których korzysta klient (www, aliasy, subdomeny)',
      'Mieszana treść (http:// w stronie) — gdy kłódka znika tylko na części podstron',
      'Po wystawieniu: strona otwiera się przez https bez ostrzeżenia',
      'Klient wie, kiedy certyfikat się odnowi (samodzielnie, bez jego udziału)',
    ],
  },
  {
    klucz: 'migracja-zatrzymana',
    nazwa: 'Migracja zatrzymana',
    kiedy: 'Przeniesienie strony stoi albo zostało przekazane zespołowi do dokończenia.',
    kroki: [
      'Otwórz migrację w kokpicie migracji: krok, na którym stanęła, i powód',
      'Dostęp do starego hostingu nadal działa (hasło, adres, uprawnienia)',
      'Miejsce i limity na koncie docelowym wystarczą na pliki, bazy i pocztę',
      'Dokończ brakujący krok albo uruchom go ponownie; sprawdź stronę pod tymczasowym adresem',
      'Przełączenie domeny (DNS) uzgodnione z klientem — termin i kto to robi',
      'Klient wie, co zostało przeniesione i co jeszcze przed nim',
    ],
  },
  {
    klucz: 'hosting-dns-tls-check',
    nazwa: 'DNS i domena',
    kiedy: 'Domena nie wskazuje na stronę, zmiana rekordów nie działa, propagacja.',
    kroki: [
      'Uruchom „Diagnostykę” usługi: DNS i certyfikat',
      'Serwery nazw domeny u rejestratora i rekordy A/CNAME/MX',
      'Zmiany rekordów zapisane i rozpropagowane (czas TTL)',
      'Klient wie, co dalej i ile może potrwać propagacja',
    ],
  },
  {
    klucz: 'billing-payment-check',
    nazwa: 'Płatność / faktura',
    kiedy: 'Pytanie o fakturę, nieudaną płatność, saldo portfela albo zwrot.',
    kroki: [
      'Status ostatniej faktury i płatności',
      'Portfel i metoda płatności',
      'Jasny termin dla klienta',
    ],
  },
];

export const RUNBOOK_KLUCZE: readonly string[] = RUNBOOKI.map((r) => r.klucz);

export function runbook(klucz: string | null | undefined): Runbook | null {
  return RUNBOOKI.find((r) => r.klucz === klucz) ?? null;
}

/** Kategoria rozpoznana z treści zgłoszenia (PB-18) → zalecany runbook. */
const RUNBOOK_KATEGORII: Record<string, string> = {
  AWARIA: 'strona-nie-dziala',
  POCZTA: 'poczta',
  SSL: 'ssl',
  MIGRACJA: 'migracja-zatrzymana',
  DNS: 'hosting-dns-tls-check',
  PLATNOSC: 'billing-payment-check',
};

/** Zalecany runbook: z kategorii treści, a gdy ta nic nie mówi — z działu (jak dotąd). */
export function zalecanyRunbook(kategoria: string | null | undefined, dzial: string | null | undefined): Runbook {
  const klucz =
    (kategoria ? RUNBOOK_KATEGORII[kategoria] : undefined) ??
    (dzial === 'BILLING' ? 'billing-payment-check' : 'hosting-dns-tls-check');
  return runbook(klucz)!;
}
