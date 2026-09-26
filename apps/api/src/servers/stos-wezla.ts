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
 */
export const STOS_WEZLA = {
  /** Podbijaj przy każdej zmianie — węzeł raportuje, którą wersję manifestu ma. */
  wersja: '2026-09-26.1',
  daKanal: 'stable',
  /** Build DirectAdmin sprawdzony na węźle testowym (D3). Pusty = najnowszy z kanału. */
  daCommit: '',
  php1: '8.3',
  mariadb: '11.4',
  governorMysql: 'mariadb1104',
  webserver: 'litespeed',
  modsecurityRuleset: 'owasp',
  /** Główna linia LiteSpeed Enterprise dopuszczona na flocie (raport zgodności porównuje prefiks). */
  litespeedLinia: '6.3',
} as const;

const q = (v: string) => `'${v.replace(/'/g, '')}'`;

/** Treść /etc/verris-stack.env (bash `source`-owalny, bez sekretów). */
export function stosJakoEnv(): string {
  const s = STOS_WEZLA;
  return [
    '# Verris — manifest stosu węzła (PB-30). Plik zarządzany przez control-plane — nie edytuj ręcznie.',
    `VERRIS_STACK_VERSION=${q(s.wersja)}`,
    `VERRIS_DA_CHANNEL=${q(s.daKanal)}`,
    `VERRIS_DA_COMMIT=${q(s.daCommit)}`,
    `VERRIS_PHP1_RELEASE=${q(s.php1)}`,
    `VERRIS_MARIADB=${q(s.mariadb)}`,
    `VERRIS_GOVERNOR_MYSQL=${q(s.governorMysql)}`,
    `VERRIS_WEBSERVER=${q(s.webserver)}`,
    `VERRIS_MODSECURITY_RULESET=${q(s.modsecurityRuleset)}`,
    `VERRIS_LITESPEED_LINE=${q(s.litespeedLinia)}`,
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
}): PozycjaZgodnosci[] {
  const s = STOS_WEZLA;
  const zgodna = (fakt: string | null | undefined, ocz: string) =>
    fakt ? fakt === ocz || fakt.startsWith(`${ocz}.`) || fakt.includes(` ${ocz}.`) : null;
  return [
    { co: 'Manifest stosu', oczekiwane: s.wersja, faktyczne: w.stackVersion ?? null, zgodne: w.stackVersion ? w.stackVersion === s.wersja : null },
    { co: 'MariaDB', oczekiwane: s.mariadb, faktyczne: w.dbVersion ?? null, zgodne: zgodna(w.dbVersion, s.mariadb) },
    { co: 'LiteSpeed', oczekiwane: `${s.litespeedLinia}.x`, faktyczne: w.lsVersion ?? null, zgodne: zgodna(w.lsVersion, s.litespeedLinia) },
    { co: 'PHP (domyślne)', oczekiwane: s.php1, faktyczne: w.phpVersion ?? null, zgodne: zgodna(w.phpVersion, s.php1) },
  ];
}
