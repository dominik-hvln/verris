/**
 * Specyfikacja pakietu hostingu — jedno źródło dla /specyfikacja i zakładek specyfikacji na /hosting
 * (makieta 1.11.2026). Każdy wiersz ma pokrycie w macierzy audytu (audyt/dane/macierz.csv). Trzeci element
 * wiersza (`poWeryfikacji`) — pokazywany tylko przy SPEC_PO_WERYFIKACJI (lib/oferta.ts).
 */
import { nettoStawki, stawka, type StawkiAutoskalowania } from './ceny';
import { PHP_OPIS, SPEC_PO_WERYFIKACJI } from './oferta';

export type WierszSpecyfikacji = [parametr: string, wartosc: string, poWeryfikacji?: boolean];

export type SekcjaSpecyfikacji = { tytul: string; id: string; wiersze: WierszSpecyfikacji[] };

/**
 * Sekcje specyfikacji pakietu; stawki autoskalowania z modułu cen (API). `nettoWidok` — stawki netto
 * (zakładki na /hosting z przełącznikiem brutto/netto); /specyfikacja pokazuje brutto.
 */
export function sekcjeSpecyfikacji(stawki: StawkiAutoskalowania, nettoWidok = false): SekcjaSpecyfikacji[] {
  const st = nettoWidok
    ? { cpu: nettoStawki(stawki.cpu), ram: nettoStawki(stawki.ram), dysk: nettoStawki(stawki.dysk) }
    : stawki;
  return [
  {
    tytul: 'Zasoby',
    id: 'zasoby',
    wiersze: [
      ['Limit dysku w pakiecie', '50 GB NVMe'],
      ['Limit pamięci RAM w pakiecie', '8 GB'],
      ['Limit procesora w pakiecie', '2 vCPU'],
      ['Autoskalowanie', 'w szczycie do 24 vCPU, 64 GB RAM i 1000 GB dysku, potem powrót do pakietu'],
      [`Stawki autoskalowania (${nettoWidok ? 'netto' : 'brutto'})`, `${stawka(st.cpu)} zł za 1% CPU/h · ${stawka(st.ram)} zł za 1 GB RAM/h · ${stawka(st.dysk)} zł za 1 GB dysku/h, naliczane w blokach 15 minut`],
      ['Limit kosztu autoskalowania', 'opcjonalny: limit kosztu na 30 dni (suma dopłat z ostatnich 30 dni), ustawiasz przy zamówieniu albo w panelu; bez limitu płacisz za faktyczne użycie'],
      ['Transfer', 'bez limitu'],
      ['Strony, domeny, skrzynki, bazy, konta FTP', 'bez limitu liczbowego — ograniczają je tylko zasoby konta'],
    ],
  },
  {
    tytul: 'Oprogramowanie serwera',
    id: 'oprogramowanie',
    wiersze: [
      ['Panel', 'panel Verris po polsku'],
      ['Serwer WWW', 'LiteSpeed Enterprise', true],
      ['Izolacja kont', 'własne limity CPU, RAM i procesów oraz osobny system plików dla każdego konta', true],
      ['PHP', PHP_OPIS],
      [
        'Limity PHP (php.ini)',
        'zmieniasz w panelu dla każdej domeny: memory_limit od 32 do 2048 MB, max_execution_time od 10 do 600 s, upload_max_filesize i post_max_size do 1024 MB, max_input_vars do 20 000; pamięć ogranicza też limit RAM konta',
      ],
      ['PHP w podkatalogu', 'inna wersja dla wybranego katalogu strony', true],
      ['Rozszerzenia PHP i php.ini', 'przełączniki w panelu', true],
      ['MariaDB', 'bazy MySQL/MariaDB, phpMyAdmin z automatycznym logowaniem, zdalny dostęp'],
      ['PostgreSQL', 'PostgreSQL 16, do 5 baz na konto', true],
      ['Redis i Memcached', 'osobna instancja dla konta, dostęp tylko przez gniazdo UNIX', true],
      ['Node.js i Python', 'aplikacje uruchamiane z panelu', true],
      ['WordPress', 'instalacja jednym kliknięciem, kopia testowa (staging)'],
      ['Cron', 'zadania harmonogramu w panelu, zapis jak w crontabie (pięć pól), także co minutę', true],
      ['FTP', 'konta FTP'],
      ['FTPS', 'wymuszone szyfrowanie połączeń FTP', true],
      ['SSH i Git', 'SSH w izolowanym środowisku z kluczami SSH, wdrożenia z repozytorium Git z budowaniem przez Composer albo npm', true],
      ['Logi', 'logi dostępu i błędów WWW oraz PHP dla każdej domeny w panelu, z pobraniem do pliku'],
      ['API', 'tokeny API z uprawnieniami i webhooki: usługi, DNS, wdrożenia z Git, skrzynki pocztowe; dokumentacja w Centrum pomocy (pomoc.verris.pl)'],
      ['Optymalizacja obrazów', 'bezstratna kompresja JPG i PNG z panelu', true],
    ],
  },
  {
    tytul: 'Bezpieczeństwo',
    id: 'bezpieczenstwo',
    wiersze: [
      ['Zapora aplikacji (WAF)', 'ModSecurity z regułami OWASP CRS', true],
      ['Skaner złośliwego oprogramowania', 'ImunifyAV — skan w tle i na żądanie', true],
      ['Ochrona DDoS', 'filtrowanie L3/L4 w sieci centrum danych i limity połączeń na serwerze WWW', true],
      ['Bezpieczeństwo konta', 'logowanie dwuskładnikowe, klucze dostępu (passkeys), subkonta z uprawnieniami, tokeny API'],
    ],
  },
  {
    tytul: 'Domeny, SSL i poczta',
    id: 'domeny-poczta',
    wiersze: [
      ['SSL', "Let's Encrypt, także wildcard, odnawiany automatycznie; możliwość wgrania własnego certyfikatu"],
      ['DNS', 'własne serwery nazw Verris albo zewnętrzny DNS'],
      ['DNSSEC', 'podpisywanie strefy', true],
      ['Webmail', 'z automatycznym logowaniem z panelu'],
      ['Skrzynki', 'domyślnie 1 GB, do 100 GB na skrzynkę'],
      ['Wysyłka', 'do 1000 wiadomości na dobę z konta'],
      ['Funkcje poczty', 'przekierowania, autoresponder, catch-all, filtr SpamAssassin, sprawdzanie list RBL'],
      ['SPF, DKIM, DMARC', 'rekordy uwierzytelniania poczty', true],
      ['Kalendarz i kontakty', 'CalDAV i CardDAV dla każdej skrzynki', true],
    ],
  },
  {
    tytul: 'Kopie i gwarancje',
    id: 'kopie-gwarancje',
    wiersze: [
      ['Kopia na serwerze', 'codziennie, 7 ostatnich kopii'],
      ['Samodzielne przywracanie', 'pliki, bazy danych i poczta — z panelu, bez zgłoszenia'],
      ['Kopia poza serwerem', 'szyfrowana, z każdego z ostatnich 30 dni', true],
      ['Kopia bezpieczeństwa przed przywróceniem', 'domyślnie włączona', true],
      ['Dane', 'w Unii Europejskiej (EOG)'],
      ['SLA', 'dostępność 99,5% w miesiącu kalendarzowym'],
      ['Rekompensata', 'automatycznie, bez wniosku, w kredytach: 5% opłaty poniżej 99,5%, 25% poniżej 99%, 50% poniżej 95%, cała opłata poniżej 90%'],
      ['Monitoring', 'wykresy CPU, RAM i I/O, powiadomienia, publiczna strona statusu'],
      ['Migracja', 'przeniesienie strony, baz i poczty w cenie'],
    ],
  },
];
}

/** Sekcje z odfiltrowanymi wierszami czekającymi na weryfikację na węźle. */
export function sekcjeWidoczne(st: StawkiAutoskalowania, nettoWidok = false): SekcjaSpecyfikacji[] {
  return sekcjeSpecyfikacji(st, nettoWidok).map((s) => ({ ...s, wiersze: s.wiersze.filter(([, , po]) => SPEC_PO_WERYFIKACJI || !po) }));
}
