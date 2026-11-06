/**
 * PB-30 — manifest stosu węzła: JEDNO źródło prawdy o wersjach dla całej floty.
 *
 * Trafia na węzeł jako /etc/verris-stack.env: przy bootstrapie (skrypt wstrzykuje go przed
 * instalacją DirectAdmin) i co minutę przez agenta zadań (GET /agent/tasks/stack-env), więc
 * każda zmiana tutaj dociera do wszystkich węzłów tak samo. Profil hostingu i skrypty
 * onboardu czytają wartości z tego pliku zamiast mieć własne, rozjeżdżające się domyślne.
 *
 * Źródła (stan 2026-09-26):
 * - DirectAdmin, „Predefined installation options”: DA_CHANNEL (alpha/current/stable),
 *   DA_COMMIT (konkretny build; pusty = najnowszy z kanału), opcje CustomBuild przez env
 *   (np. php1_release) przed setup.sh — docs.directadmin.com.
 * - DirectAdmin CustomBuild MariaDB: 10.4, 10.5, 10.6, 10.11, 11.4, 11.8, 12.3.
 * - MariaDB.org: 10.6 bez wsparcia od 6.07.2026; 11.4 LTS wspierana do 2029.
 * - CloudLinux MySQL Governor: słowa kluczowe do mariadb1104 (11.4) — nowszych oficjalnie nie
 *   opisano, dlatego flota jedzie na 11.4, a nie 11.8.
 * - LiteSpeed Enterprise: stabilna 6.3.x (6.4 w fazie RC) — instaluje CustomBuild.
 * - CloudLinux PHP Selector: pakiety alt-phpXX (KB CloudLinux „Install alt-php on CloudLinux 10”).
 *
 * Decyzja 14 (3.11.2026) — PHP: węzeł instaluje KAŻDĄ stabilną wersję alt-php, którą widzi w repozytorium
 * CloudLinux, od `phpMin` w górę (8.4, 8.5 i kolejne bez zmiany kodu; profil węzła: php_wersje_z_repo).
 * `phpAlt` to już tylko lista zapasowa (repozytorium nie odpowiada) i domyślna lista dla panelu, zanim węzeł
 * zaraportuje zainstalowane wersje (Server.aktualizacje.altPhp). Domyślna = przedostatnia najnowsza
 * (domyslnaWersjaPhp) — także `php1` (PHP CustomBuild, którego używa konto bez własnego wyboru).
 * Dokumentacja: CloudLinux PHP Selector / selectorctl — https://docs.cloudlinux.com/cloudlinuxos/cloudlinux_os_components/#php-selector,
 * DirectAdmin CustomBuild php1_release — https://docs.directadmin.com/directadmin/custombuild/ (NIEZWERYFIKOWANE
 * z sesji bez internetu: kotwice stron; sprawdzić na TEST-02 razem z listą alt-php w repozytorium CL10).
 *
 * Skrypty węzła NIE mają własnych wartości domyślnych tych wersji — pilnuje test
 * src/test/manifest-stosu-jedno-zrodlo.spec.ts (literał wersji w skrypcie albo rozjazd = czerwony).
 */
export interface ManifestStosu {
  wersja: string;
  daKanal: string;
  daCommit: string;
  php1: string;
  mariadb: string;
  governorMysql: string;
  webserver: string;
  modsecurityRuleset: string;
  litespeedLinia: string;
  /**
   * Wersje alt-php — lista ZAPASOWA (gdy repozytorium CloudLinux nie odpowiada) i domyślna dla panelu, zanim węzeł
   * zaraportuje zainstalowane. Węzeł instaluje wszystko z repozytorium od `phpMin` (decyzja 14).
   */
  phpAlt: string[];
  /** Najstarsza instalowana wersja alt-php (decyzja 14: od 7.4 w górę). Nie edytowana w panelu. */
  phpMin: string;
}

/** Domyślny manifest (pierwsze uruchomienie). Bieżący: StosWezlaService (panel → platform_settings). */
export const STOS_WEZLA: ManifestStosu = {
  /** Podbijaj przy każdej zmianie — węzeł raportuje, którą wersję manifestu ma. */
  wersja: '2026-11-03.1',
  daKanal: 'stable',
  /** Build DirectAdmin sprawdzony na węźle testowym (D3). Pusty = najnowszy z kanału. */
  daCommit: '',
  /** Decyzja 14: przedostatnia najnowsza z `phpAlt` (test pilnuje: php1 === domyslnaWersjaPhp(phpAlt)). */
  php1: '8.4',
  mariadb: '11.4',
  governorMysql: 'mariadb1104',
  webserver: 'litespeed',
  modsecurityRuleset: 'owasp',
  /** Główna linia LiteSpeed Enterprise dopuszczona na flocie (raport zgodności porównuje prefiks). */
  litespeedLinia: '6.3',
  phpAlt: ['8.5', '8.4', '8.3', '8.2', '8.1', '8.0', '7.4'],
  phpMin: '7.4',
};

/** Wersja „X.Y” jako para liczb (8.10 > 8.9). */
const czesci = (v: string) => v.split('.').map((x) => Number(x));

/** Wersje PHP „X.Y” od najnowszej, bez powtórzeń i bez śmieci. */
export function sortujWersjePhp(wersje: Iterable<string>): string[] {
  return [...new Set([...wersje].map((v) => v.trim()).filter((v) => /^\d+\.\d+$/.test(v)))].sort((a, b) => {
    const [a1, a2] = czesci(a);
    const [b1, b2] = czesci(b);
    return b1 - a1 || b2 - a2;
  });
}

/** Czy `v` >= `min` (obie „X.Y”). */
export function wersjaPhpCoNajmniej(v: string, min: string): boolean {
  const [a1, a2] = czesci(v);
  const [b1, b2] = czesci(min);
  return a1 > b1 || (a1 === b1 && a2 >= b2);
}

/** Decyzja 14 — domyślna wersja PHP = przedostatnia najnowsza (jedna wersja → ta jedna, brak → null). */
export function domyslnaWersjaPhp(wersje: Iterable<string>): string | null {
  const w = sortujWersjePhp(wersje);
  return w[1] ?? w[0] ?? null;
}

/**
 * Wersje alt-php zainstalowane na węźle wg raportu agenta (Server.aktualizacje.altPhp, klucze „X.Y”, verris-lve.sh),
 * od `min` w górę, od najnowszej. Pusta lista = węzeł jeszcze nie raportował (wtedy lista z ustawień platformy).
 */
export function wersjePhpZRaportu(aktualizacje: unknown, min: string = STOS_WEZLA.phpMin): string[] {
  const alt = aktualizacje && typeof aktualizacje === 'object' ? (aktualizacje as { altPhp?: unknown }).altPhp : null;
  if (!alt || typeof alt !== 'object' || Array.isArray(alt)) return [];
  return sortujWersjePhp(Object.keys(alt)).filter((v) => wersjaPhpCoNajmniej(v, min));
}

/**
 * PB-33 — wartości, które można wybrać w panelu (oficjalne źródła, stan 2026-09-26):
 * - MariaDB: tylko wersje opisane dla CloudLinux MySQL Governor (do mariadb1104), wspierane przez MariaDB.org;
 * - PHP: gałęzie wspierane wg php.net (8.2 tylko poprawki bezpieczeństwa do 31.12.2026);
 * - DirectAdmin: kanały z „Predefined installation options” (bez alpha);
 * - LiteSpeed: linia stabilna (6.4 dopiero po wyjściu z RC).
 */
export const DOZWOLONE = {
  mariadb: [
    { v: '10.11', opis: 'LTS, wsparcie do 2028', governor: 'mariadb1011' },
    { v: '11.4', opis: 'LTS, wsparcie do 2029 (zalecane)', governor: 'mariadb1104' },
  ],
  php1: [
    { v: '8.2', opis: 'tylko poprawki bezpieczeństwa do 31.12.2026' },
    { v: '8.3', opis: 'poprawki bezpieczeństwa do 31.12.2027' },
    { v: '8.4', opis: 'aktywne wsparcie do 31.12.2026, bezpieczeństwo do 2028' },
    { v: '8.5', opis: 'aktywne wsparcie do 31.12.2027, bezpieczeństwo do 2029' },
  ],
  daKanal: [
    { v: 'stable', opis: 'stabilny (zalecany)' },
    { v: 'current', opis: 'bieżący – nowości szybciej' },
  ],
  litespeedLinia: [{ v: '6.3', opis: 'stabilna' }],
} as const;

/** Kolejne wersje MariaDB dla Governora — upgrade tylko o jeden krok (dokumentacja CloudLinux). */
export const SCIEZKA_MARIADB = ['10.6', '10.11', '11.4'] as const;

/** Następny krok z `obecna` w stronę `cel` (null = już na miejscu albo poza ścieżką). */
export function nastepnyKrokMariadb(obecna: string | null | undefined, cel: string): string | null {
  const o = (obecna ?? '').match(/^\d+\.\d+/)?.[0];
  const i = SCIEZKA_MARIADB.indexOf(o as never);
  const j = SCIEZKA_MARIADB.indexOf(cel as never);
  if (i < 0 || j < 0 || i >= j) return null;
  return SCIEZKA_MARIADB[i + 1];
}

const q = (v: string) => `'${v.replace(/'/g, '')}'`;

/** Treść /etc/verris-stack.env (bash `source`-owalny, bez sekretów). */
export function stosJakoEnv(s: ManifestStosu = STOS_WEZLA): string {
  return [
    '# Verris – manifest stosu węzła (PB-30). Plik zarządzany przez control-plane – nie edytuj ręcznie.',
    `VERRIS_STACK_VERSION=${q(s.wersja)}`,
    `VERRIS_DA_CHANNEL=${q(s.daKanal)}`,
    `VERRIS_DA_COMMIT=${q(s.daCommit)}`,
    `VERRIS_PHP1_RELEASE=${q(s.php1)}`,
    `VERRIS_MARIADB=${q(s.mariadb)}`,
    `VERRIS_GOVERNOR_MYSQL=${q(s.governorMysql)}`,
    `VERRIS_WEBSERVER=${q(s.webserver)}`,
    `VERRIS_MODSECURITY_RULESET=${q(s.modsecurityRuleset)}`,
    `VERRIS_LITESPEED_LINE=${q(s.litespeedLinia)}`,
    `VERRIS_PHP_VERSIONS=${q(s.phpAlt.join(' '))}`,
    // Decyzja 14 — profil instaluje wszystkie wersje alt-php z repozytorium od tej w górę.
    `VERRIS_PHP_MIN=${q(s.phpMin)}`,
    // Docelowe wersje dla node-db-upgrade.sh (strażnik po stronie węzła; API sprawdza to samo).
    `VERRIS_MARIADB_ALLOWED=${q(DOZWOLONE.mariadb.map((m) => m.v).join(' '))}`,
    '',
  ].join('\n');
}

export interface PozycjaZgodnosci {
  co: string;
  oczekiwane: string;
  faktyczne: string | null;
  zgodne: boolean | null;
}

/**
 * Raport zgodności węzła z manifestem. `null` = węzeł jeszcze nie raportował tej wartości.
 * Porównanie prefiksem wersji (np. MariaDB „11.4” pasuje do „11.4.13”).
 */
export function zgodnoscZManifestem(w: {
  stackVersion?: string | null;
  dbVersion?: string | null;
  lsVersion?: string | null;
  phpVersion?: string | null;
}, s: ManifestStosu = STOS_WEZLA): PozycjaZgodnosci[] {
  const zgodna = (fakt: string | null | undefined, ocz: string) =>
    fakt ? fakt === ocz || fakt.startsWith(`${ocz}.`) || fakt.includes(` ${ocz}.`) : null;
  return [
    { co: 'Manifest stosu', oczekiwane: s.wersja, faktyczne: w.stackVersion ?? null, zgodne: w.stackVersion ? w.stackVersion === s.wersja : null },
    { co: 'MariaDB', oczekiwane: s.mariadb, faktyczne: w.dbVersion ?? null, zgodne: zgodna(w.dbVersion, s.mariadb) },
    { co: 'LiteSpeed', oczekiwane: `${s.litespeedLinia}.x`, faktyczne: w.lsVersion ?? null, zgodne: zgodna(w.lsVersion, s.litespeedLinia) },
    { co: 'PHP (domyślne)', oczekiwane: s.php1, faktyczne: w.phpVersion ?? null, zgodne: zgodna(w.phpVersion, s.php1) },
  ];
}
