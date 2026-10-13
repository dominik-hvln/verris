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
 * Plik z `{domena}` — log jednej domeny (access/error log strony); domenę podaje operator, API sprawdza, że jest na tym
 * węźle, a skrypt — że to poprawna nazwa domeny (bez „/” i „..”).
 * `poczta` — log poczty (adresy e-mail w każdej linii). Od 14.10 (decyzja Dominika) STAFF ma maskowane adresy e-mail
 * i IP we WSZYSTKICH logach — na węźle i drugi raz w API; filtr działa po masce.
 * Ścieżki wg dokumentacji DirectAdmina „Directories and locations” (sekcja Log files):
 *   https://docs.directadmin.com/directadmin/general-usage/directories-and-locations.html
 *   /var/log/directadmin/{error,errortaskq,login,security,system}.log, /var/log/httpd/domains/<domena>.log i .error.log,
 *   /var/log/pureftpd.log, /var/log/exim/{mainlog,rejectlog,paniclog}, /var/log/maillog, /var/log/messages, /var/log/cron.
 * LiteSpeed Enterprise na DirectAdminie pisze logi domen tam, gdzie wskazuje konfiguracja Apache z DA — sprawdzić na t1.
 * /var/log/secure (sshd, sudo) — standard rodziny RHEL (AlmaLinux/CloudLinux), nie DirectAdmin.
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
  { klucz: 'ssh', etykieta: 'SSH — logowania (secure)', plik: '/var/log/secure', poczta: false },
  { klucz: 'cron', etykieta: 'Zadania cron', plik: '/var/log/cron', poczta: false },
  { klucz: 'exim-main', etykieta: 'Poczta — dziennik Exima', plik: '/var/log/exim/mainlog', poczta: true },
  { klucz: 'exim-reject', etykieta: 'Poczta — odrzucone', plik: '/var/log/exim/rejectlog', poczta: true },
  { klucz: 'exim-panic', etykieta: 'Poczta — błędy krytyczne Exima', plik: '/var/log/exim/paniclog', poczta: true },
  { klucz: 'maillog', etykieta: 'Poczta — skrzynki (Dovecot)', plik: '/var/log/maillog', poczta: true },
  { klucz: 'www', etykieta: 'Serwer WWW — błędy', plik: '/usr/local/lsws/logs/error.log', poczta: false },
  { klucz: 'www-domena', etykieta: 'Strona — ruch (access log domeny)', plik: '/var/log/httpd/domains/{domena}.log', poczta: false },
  { klucz: 'www-domena-bledy', etykieta: 'Strona — błędy (error log domeny)', plik: '/var/log/httpd/domains/{domena}.error.log', poczta: false },
  { klucz: 'directadmin', etykieta: 'Panel serwera — błędy', plik: '/var/log/directadmin/error.log', poczta: false },
  { klucz: 'directadmin-zadania', etykieta: 'Panel serwera — kolejka zadań', plik: '/var/log/directadmin/errortaskq.log', poczta: false },
  { klucz: 'directadmin-system', etykieta: 'Panel serwera — operacje (konta, domeny, certyfikaty)', plik: '/var/log/directadmin/system.log', poczta: false },
  { klucz: 'directadmin-bezpieczenstwo', etykieta: 'Panel serwera — incydenty bezpieczeństwa', plik: '/var/log/directadmin/security.log', poczta: false },
  { klucz: 'directadmin-logowania', etykieta: 'Panel serwera — nieudane logowania', plik: '/var/log/directadmin/login.log', poczta: false },
  { klucz: 'mariadb', etykieta: 'Bazy danych (dziennik usługi)', journal: 'mariadb', poczta: false },
  { klucz: 'named', etykieta: 'DNS (dziennik usługi)', journal: 'named', poczta: false },
  { klucz: 'ftp', etykieta: 'FTP (dziennik usługi)', journal: 'ftp', poczta: false },
  { klucz: 'ftp-pureftpd', etykieta: 'FTP — logowania i transfery (PureFTPd)', plik: '/var/log/pureftpd.log', poczta: false },
  { klucz: 'fail2ban', etykieta: 'Blokady IP (fail2ban)', plik: '/var/log/fail2ban.log', poczta: false },
  { klucz: 'agent', etykieta: 'Agent zadań Verris', plik: '/var/log/verris-tasks.log', poczta: false },
  { klucz: 'agent-lve', etykieta: 'Agent limitów Verris', plik: '/var/log/verris-lve.log', poczta: false },
];

export const KLUCZE_LOGOW_WEZLA = LOGI_WEZLA.map((l) => l.klucz);

export function logWezla(klucz: string | null | undefined): LogWezla | null {
  return LOGI_WEZLA.find((l) => l.klucz === klucz) ?? null;
}

/** Log jednej domeny (ścieżka z `{domena}`) — operator musi podać domenę. */
export function logWymagaDomeny(l: Pick<LogWezla, 'plik'> | null | undefined): boolean {
  return !!l?.plik?.includes('{domena}');
}

/** Nazwa domeny w filtrze logu — te same reguły co DOMENA w node-services.sh. */
export const LOG_WEZLA_DOMENA = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
/** Użytkownik w filtrze logu (konto panelu, użytkownik systemowy, login FTP/SSH) — jak UZYTKOWNIK w node-services.sh. */
export const LOG_WEZLA_UZYTKOWNIK = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;

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

/**
 * Adresy IP (dla STAFF, decyzja 14.10): IPv4 „203.0.113.7” → „203.0.113.•••”, IPv6 „2a01:4f8:c0c:12::1” → „2a01:4f8:•••”
 * („::1” → „::•••”).
 * IPv6 rozpoznajemy tylko z „::” albo literą a–f, żeby godziny („08:00:01”) zostały nietknięte.
 * Te same reguły co IPV4 i IPV6 w node-services.sh (zgodność: uslugi-wezla-skrypt.spec.ts).
 */
export function maskujIp(linia: string): string {
  return linia
    .replace(/(?<![\w.])((?:25[0-5]|2[0-4]\d|1?\d?\d)\.(?:25[0-5]|2[0-4]\d|1?\d?\d)\.(?:25[0-5]|2[0-4]\d|1?\d?\d))\.(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\w.])/g, '$1.•••')
    .replace(/(?<![\w:.])[0-9A-Fa-f:]{3,39}(?![\w:])/g, (m) => {
      if ((m.match(/:/g) ?? []).length < 2) return m;
      if (!m.includes('::') && !/[A-Fa-f]/.test(m)) return m;
      const grupy = m.split(':');
      if (grupy.some((g) => g.length > 4)) return m;
      return `${grupy.slice(0, 2).join(':')}:•••`;
    });
}

/** Pełna maska dla STAFF: adresy e-mail i IP. */
export function maskujDlaZespolu(linia: string): string {
  return maskujIp(maskujAdresy(linia));
}

/**
 * F3.4 — watchdog: usługi, których stan agent verris-lve raportuje co minutę (bez agentów Verris — nie raportują same
 * o sobie). Zgodność z WATCHDOG_USLUGI w ops/scripts/verris-lve.sh pilnuje test uslugi-wezla-watchdog.spec.ts.
 */
export const USLUGI_WATCHDOGA = USLUGI_WEZLA.filter((u) => !u.klucz.startsWith('agent'));

/** Raport po tylu minutach bez odświeżenia uznajemy za nieaktualny (agent co minutę). */
export const WATCHDOG_RAPORT_SWIEZY_MIN = 10;

/**
 * Usługa „nie działa” wg watchdoga: failed albo inactive przy włączonym autostarcie (UnitFileState enabled). Wyłączona
 * celowo (disabled, np. DNS poza węzłem) nie alarmuje.
 */
export function uslugaNieDziala(w: { s?: string | null; e?: string | null }): boolean {
  return w.s === 'failed' || (w.s === 'inactive' && w.e === 'enabled');
}
