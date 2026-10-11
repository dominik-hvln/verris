/**
 * F3.4 — usługi i logi węzła (zadanie NODE_SERVICES, ops/scripts/node-services.sh). Jedno źródło białej listy dla API,
 * panelu operatora i skryptu węzła (zgodność ze skryptem i agentem pilnuje apps/api/src/test/uslugi-wezla-skrypt.spec.ts).
 *
 * Jednostki systemd w kolejności prób — skrypt bierze pierwszą istniejącą (LoadState=loaded). Nazwy jednostek
 * DirectAdmina/CustomBuild, LiteSpeeda i Exima: NIEZWERYFIKOWANE z dokumentacją producenta (dokumentacja niedostępna
 * z sesji 11.10) — sprawdzić na t1 (`systemctl list-units --type=service`). Te same nazwy stosuje już
 * node-hosting-profile.sh (mariadb/mysqld, exim, dovecot, pure-ftpd/proftpd).
 *
 * `przerwa` — restart przerywa pracę WSZYSTKICH kont węzła (strony, poczta, bazy, DNS, FTP). Działającą usługę
 * restartuje tylko ADMIN (STAFF: wniosek NODE_SERVICE_RESTART); usługę, która stoi, NOC uruchamia sam — start
 * stojącej usługi nie przerywa niczego, a skrypt sprawdza stan na węźle w chwili wykonania.
 * `restart: false` — tylko podgląd (agent zadań nie zrestartuje sam siebie; SSH nie ruszamy z panelu).
 */
export interface UslugaWezla {
  klucz: string;
  etykieta: string;
  jednostki: readonly string[];
  przerwa: boolean;
  restart: boolean;
}

export const USLUGI_WEZLA: readonly UslugaWezla[] = [
  { klucz: 'www', etykieta: 'Serwer WWW', jednostki: ['lsws.service', 'litespeed.service', 'httpd.service'], przerwa: true, restart: true },
  { klucz: 'exim', etykieta: 'Poczta SMTP (Exim)', jednostki: ['exim.service'], przerwa: true, restart: true },
  { klucz: 'dovecot', etykieta: 'Skrzynki IMAP/POP3 (Dovecot)', jednostki: ['dovecot.service'], przerwa: true, restart: true },
  { klucz: 'mariadb', etykieta: 'Bazy danych (MariaDB)', jednostki: ['mariadb.service', 'mysqld.service', 'mysql.service'], przerwa: true, restart: true },
  { klucz: 'named', etykieta: 'DNS (named)', jednostki: ['named.service'], przerwa: true, restart: true },
  { klucz: 'ftp', etykieta: 'FTP', jednostki: ['pure-ftpd.service', 'pureftpd.service', 'proftpd.service'], przerwa: true, restart: true },
  { klucz: 'directadmin', etykieta: 'Panel serwera', jednostki: ['directadmin.service'], przerwa: false, restart: true },
  { klucz: 'fail2ban', etykieta: 'Blokady IP (fail2ban)', jednostki: ['fail2ban.service'], przerwa: false, restart: true },
  { klucz: 'sshd', etykieta: 'SSH', jednostki: ['sshd.service'], przerwa: false, restart: false },
  { klucz: 'agent', etykieta: 'Agent zadań Verris', jednostki: ['verris-tasks.timer'], przerwa: false, restart: false },
  { klucz: 'agent-lve', etykieta: 'Agent limitów i telemetrii Verris', jednostki: ['verris-lve.timer'], przerwa: false, restart: false },
];

export const KLUCZE_USLUG_WEZLA = USLUGI_WEZLA.map((u) => u.klucz);

export function uslugaWezla(klucz: string | null | undefined): UslugaWezla | null {
  return USLUGI_WEZLA.find((u) => u.klucz === klucz) ?? null;
}

/**
 * Logi z białej listy: plik o stałej ścieżce albo dziennik systemd jednostki usługi (`journal` = klucz usługi).
 * `poczta` — w logu są adresy e-mail: dla STAFF maskowane już na węźle (i drugi raz w API), filtr działa po masce.
 * Ścieżki DirectAdmina/Exima/LiteSpeeda: NIEZWERYFIKOWANE z dokumentacją — sprawdzić na t1. /var/log/exim/mainlog
 * i /var/log/directadmin/*.log czytają już node-mail-log.sh i reguły fail2ban (security-hardening-baseline.sh).
 */
export interface LogWezla {
  klucz: string;
  etykieta: string;
  plik?: string;
  journal?: string;
  poczta: boolean;
}

export const LOGI_WEZLA: readonly LogWezla[] = [
  { klucz: 'system', etykieta: 'System', plik: '/var/log/messages', poczta: false },
  { klucz: 'exim-main', etykieta: 'Poczta — dziennik Exima', plik: '/var/log/exim/mainlog', poczta: true },
  { klucz: 'exim-reject', etykieta: 'Poczta — odrzucone', plik: '/var/log/exim/rejectlog', poczta: true },
  { klucz: 'exim-panic', etykieta: 'Poczta — błędy krytyczne Exima', plik: '/var/log/exim/paniclog', poczta: true },
  { klucz: 'maillog', etykieta: 'Poczta — skrzynki (Dovecot)', plik: '/var/log/maillog', poczta: true },
  { klucz: 'www', etykieta: 'Serwer WWW — błędy', plik: '/usr/local/lsws/logs/error.log', poczta: false },
  { klucz: 'directadmin', etykieta: 'Panel serwera — błędy', plik: '/var/log/directadmin/error.log', poczta: false },
  { klucz: 'directadmin-zadania', etykieta: 'Panel serwera — kolejka zadań', plik: '/var/log/directadmin/errortaskq.log', poczta: false },
  { klucz: 'mariadb', etykieta: 'Bazy danych (dziennik usługi)', journal: 'mariadb', poczta: false },
  { klucz: 'named', etykieta: 'DNS (dziennik usługi)', journal: 'named', poczta: false },
  { klucz: 'ftp', etykieta: 'FTP (dziennik usługi)', journal: 'ftp', poczta: false },
  { klucz: 'fail2ban', etykieta: 'Blokady IP (fail2ban)', plik: '/var/log/fail2ban.log', poczta: false },
  { klucz: 'agent', etykieta: 'Agent zadań Verris', plik: '/var/log/verris-tasks.log', poczta: false },
  { klucz: 'agent-lve', etykieta: 'Agent limitów Verris', plik: '/var/log/verris-lve.log', poczta: false },
];

export const KLUCZE_LOGOW_WEZLA = LOGI_WEZLA.map((l) => l.klucz);

export function logWezla(klucz: string | null | undefined): LogWezla | null {
  return LOGI_WEZLA.find((l) => l.klucz === klucz) ?? null;
}

/** Ogon logu: ile linii można zamówić (skrypt czyta ostatnie ~4 MB pliku). */
export const LOG_WEZLA_LINIE_MIN = 20;
export const LOG_WEZLA_LINIE_MAX = 500;
export const LOG_WEZLA_FILTR_MAX = 100;

/**
 * Oczywiste sekrety w każdym logu („password=…”, „token=…”) — maskowane zawsze, także dla ADMIN-a.
 * Te same reguły co SEKRET i ADRES w node-services.sh (zgodność: uslugi-wezla-skrypt.spec.ts).
 */
export function maskujSekrety(linia: string): string {
  return linia.replace(/\b(pass(?:word|wd)?|token|secret|auth)=\S+/gi, '$1=•••');
}

/**
 * Adresy e-mail w logu poczty („jan.kowalski@firma.pl” → „•••@firma.pl”) — dla STAFF. API stosuje maskę drugi raz
 * przy odczycie, więc wynik zamówiony przez ADMIN-a bez maski nie trafia do NOC.
 */
export function maskujAdresy(linia: string): string {
  return linia.replace(
    /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)/g,
    '•••@$1',
  );
}
