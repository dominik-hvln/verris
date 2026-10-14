/**
 * Podgląd katalogów migracji (14.10, uwaga Dominika): gdy w wybranym katalogu strony jest plik konfiguracyjny
 * CMS-a, formularz od razu podstawia dane bazy. Te same pliki i pola co w workerze (`CMS_PL` w
 * ops/scripts/node-migration-worker.sh) — tu tylko odczyt, bez zapisu.
 *
 * Parsowanie to wyrażenia regularne na tekście PHP, nie wykonywanie go: plik pochodzi z obcego serwera.
 */

export type Cms = 'wordpress' | 'joomla' | 'prestashop' | 'prestashop16' | 'magento' | 'drupal';

export interface DaneBazyZPliku {
  host: string;
  port: number | null;
  nazwa: string;
  uzytkownik: string;
  haslo: string;
}

/** Pliki konfiguracyjne względem katalogu strony, w kolejności sprawdzania. */
export const PLIKI_KONFIGURACJI: ReadonlyArray<{ cms: Cms; plik: string; nazwa: string }> = [
  { cms: 'wordpress', plik: 'wp-config.php', nazwa: 'WordPress' },
  { cms: 'prestashop', plik: 'app/config/parameters.php', nazwa: 'PrestaShop' },
  { cms: 'prestashop16', plik: 'config/settings.inc.php', nazwa: 'PrestaShop 1.6' },
  { cms: 'magento', plik: 'app/etc/env.php', nazwa: 'Magento' },
  { cms: 'drupal', plik: 'sites/default/settings.php', nazwa: 'Drupal' },
  { cms: 'joomla', plik: 'configuration.php', nazwa: 'Joomla' },
];

/** Który plik konfiguracyjny warto odczytać, sądząc po zawartości katalogu (pliki i katalogi pierwszego poziomu). */
export function plikDoOdczytu(wpisy: { pliki: string[]; katalogi: string[] }): (typeof PLIKI_KONFIGURACJI)[number] | null {
  const p = new Set(wpisy.pliki);
  const k = new Set(wpisy.katalogi);
  if (p.has('wp-config.php')) return PLIKI_KONFIGURACJI[0]!;
  if (k.has('app') && k.has('modules') && k.has('themes')) return PLIKI_KONFIGURACJI[1]!; // PS 1.7+ (1.6 sprawdzamy po nieudanym odczycie)
  if (k.has('config') && k.has('modules') && k.has('themes') && k.has('classes')) return PLIKI_KONFIGURACJI[2]!;
  if (k.has('app') && k.has('pub') && (k.has('vendor') || p.has('index.php'))) return PLIKI_KONFIGURACJI[3]!;
  if (k.has('sites') && k.has('core')) return PLIKI_KONFIGURACJI[4]!;
  if (p.has('configuration.php') && k.has('administrator')) return PLIKI_KONFIGURACJI[5]!;
  return null;
}

/** Komentarze PHP poza łańcuchami nie mają znaczenia dla tych plików — usuwamy je, żeby nie czytać wyłączonych linii. */
function bezKomentarzy(php: string): string {
  return php
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => (/^\s*(\/\/|#)/.test(l) ? '' : l))
    .join('\n');
}

const LANCUCH = `'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)"`;
const odEscapuj = (s: string) => s.replace(/\\(['"\\])/g, '$1');
function lancuch(m: RegExpMatchArray | null, od = 1): string | null {
  if (!m) return null;
  const w = m[od] ?? m[od + 1];
  return w == null ? null : odEscapuj(w);
}

/** define('NAZWA', 'wartość') — WordPress, PrestaShop 1.6. */
function define(php: string, nazwa: string): string | null {
  return lancuch(php.match(new RegExp(`define\\s*\\(\\s*['"]${nazwa}['"]\\s*,\\s*(?:${LANCUCH})\\s*\\)`)));
}
/** 'klucz' => 'wartość' — PrestaShop 1.7, Magento, Drupal (pierwsze wystąpienie po `od`). */
function tablica(php: string, klucz: string): string | null {
  return lancuch(php.match(new RegExp(`['"]${klucz}['"]\\s*=>\\s*(?:${LANCUCH})`)));
}
/** public $klucz = 'wartość'; — Joomla. */
function wlasciwosc(php: string, klucz: string): string | null {
  return lancuch(php.match(new RegExp(`(?:public|var)\\s+\\$${klucz}\\s*=\\s*(?:${LANCUCH})\\s*;`)));
}

/** host albo host:port (WordPress, PrestaShop 1.6) → osobno. Gniazdo („localhost:/tmp/mysql.sock”) → bez portu. */
function hostIPort(surowy: string, portOsobno?: string | null): { host: string; port: number | null } {
  const port = portOsobno && /^\d{1,5}$/.test(portOsobno) ? Number(portOsobno) : null;
  const m = surowy.match(/^(.*):(\d{1,5})$/);
  if (m && !surowy.startsWith('[')) return { host: m[1]!, port: port ?? Number(m[2]) };
  return { host: surowy.replace(/:\/.*$/, ''), port };
}

export function parsujKonfiguracje(cms: Cms, tresc: string): DaneBazyZPliku | null {
  const php = bezKomentarzy(tresc);
  let host: string | null, nazwa: string | null, uzytkownik: string | null, haslo: string | null, port: string | null = null;
  switch (cms) {
    case 'wordpress':
      [host, nazwa, uzytkownik, haslo] = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'].map((n) => define(php, n));
      break;
    case 'prestashop16':
      [host, nazwa, uzytkownik, haslo] = ['_DB_SERVER_', '_DB_NAME_', '_DB_USER_', '_DB_PASSWD_'].map((n) => define(php, n));
      break;
    case 'prestashop':
      [host, nazwa, uzytkownik, haslo, port] = ['database_host', 'database_name', 'database_user', 'database_password', 'database_port'].map((k) =>
        tablica(php, k),
      );
      break;
    case 'magento': {
      // Tylko sekcja 'db' — w env.php są też inne 'host' (cache, kolejki).
      const db = php.slice(Math.max(0, php.search(/['"]db['"]\s*=>/)));
      [host, nazwa, uzytkownik, haslo] = ['host', 'dbname', 'username', 'password'].map((k) => tablica(db, k));
      break;
    }
    case 'drupal': {
      const db = php.slice(Math.max(0, php.search(/\$databases\s*\[\s*['"]default['"]\s*\]\s*\[\s*['"]default['"]\s*\]\s*=|\$databases\s*=/)));
      [host, nazwa, uzytkownik, haslo, port] = ['host', 'database', 'username', 'password', 'port'].map((k) => tablica(db, k));
      break;
    }
    case 'joomla':
      [host, nazwa, uzytkownik, haslo] = ['host', 'db', 'user', 'password'].map((k) => wlasciwosc(php, k));
      break;
  }
  if (!nazwa || !uzytkownik) return null;
  const hp = hostIPort(host || 'localhost', port);
  return { host: hp.host || 'localhost', port: hp.port, nazwa, uzytkownik, haslo: haslo ?? '' };
}

/**
 * Host bazy z punktu widzenia naszego węzła: „localhost” w pliku znaczy serwer starego dostawcy, czyli host
 * podany do plików. Zdalny dostęp do bazy i tak sprawdza preflight, a worker w razie potrzeby idzie przez SSH.
 */
export function hostBazyDlaFormularza(hostZPliku: string, hostPlikow: string): string {
  return /^(localhost|127\.0\.0\.1|::1|\[::1\])$/i.test(hostZPliku) ? hostPlikow : hostZPliku;
}
