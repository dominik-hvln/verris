import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * X-17 — strażnik klasy błędu „job CI uruchamia testy, ale nie zbudował tego,
 * czego one potrzebują".
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SKĄD SIĘ WZIĄŁ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `@verris/database` ma `main: dist/index.js`. Bez zbudowanego `dist/` jest nie
 * rozwiąże modułu i 32 z 48 zestawów nie startują W OGÓLE — nie failują, tylko
 * się nie uruchamiają.
 *
 * Przed X-11 testy API biegły wewnątrz joba `static-checks`, którego krok
 * `pnpm typecheck` idzie przez Turbo, a `typecheck` ma w turbo.json
 * `dependsOn: ["^build"]`. Biblioteki budowały się PRZY OKAZJI — nikt tego nie
 * zapisał, bo nikt tego nie zaprojektował.
 *
 * X-11 wydzieliło testy do własnego joba. Nowy job nie budował niczego,
 * `pnpm --filter api test` omija Turbo, a zadanie `test` nie miało `dependsOn`.
 * Job stał się czerwony i był czerwony przez trzy wdrożenia — przy zielonych
 * testach na maszynie deweloperskiej, gdzie `dist/` leżało zbudowane z dawnych
 * uruchomień.
 *
 * To jest dokładnie ten wzorzec, który X-11 miał naprawiać: krok, który DOWODZI,
 * przestał dowodzić. Tylko poprzednio przestał, bo blokował go typecheck,
 * a teraz — bo sam nie miał czego uruchomić.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CZEGO PILNUJE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Każdy job, który uruchamia jest, musi wcześniej wygenerować klienta Prismy
 * i zbudować biblioteki workspace'u. Każdy job, który uruchamia seed albo
 * cokolwiek importującego @verris/database, musi wygenerować klienta.
 *
 * Test czyta ci.yml jako TEKST — celowo, bez parsera YAML — żeby nie wymagać
 * zależności, której pakiet testowy nie ma. Zakres joba wyznaczają wcięcia,
 * bo tak wygląda plik i tak go czyta człowiek.
 */

const KORZEN = resolve(__dirname, '../../../..');
const CI = resolve(KORZEN, '.github/workflows/ci.yml');

interface Job {
  nazwa: string;
  tresc: string;
}

/** Rozbija ci.yml na joby po wcięciu dwóch spacji pod `jobs:`. */
function joby(): Job[] {
  const linie = readFileSync(CI, 'utf-8').split('\n');
  const start = linie.findIndex((l) => l.trimEnd() === 'jobs:');
  expect(start).toBeGreaterThan(-1);

  const out: Job[] = [];
  let biezacy: Job | null = null;

  for (const linia of linie.slice(start + 1)) {
    const naglowek = linia.match(/^ {2}([a-zA-Z0-9_-]+):\s*$/);
    if (naglowek) {
      if (biezacy) out.push(biezacy);
      biezacy = { nazwa: naglowek[1]!, tresc: '' };
      continue;
    }
    // Komentarze wypadają PRZED dopasowaniem wzorców. Pierwsza wersja tego
    // strażnika tego nie robiła i zapaliła się na polskim słowie „jest"
    // w moim własnym komentarzu — fałszywy alarm w narzędziu, którego jedynym
    // zadaniem jest nie kłamać.
    if (biezacy && !linia.trim().startsWith('#')) biezacy.tresc += linia + '\n';
  }
  if (biezacy) out.push(biezacy);
  return out;
}

/** Tylko faktyczne wywołania, nie wzmianki w tekście. */
const URUCHAMIA_JEST =
  /jest\s+--config|npx\s+jest\b|pnpm\s+--filter\s+\S+\s+test\b|pnpm\s+test\b|turbo\s+run\s+test\b/;
const GENERUJE_KLIENTA = /db:generate|prisma generate/;
const BUDUJE_BIBLIOTEKI = /@verris\/database.*run build|turbo run build|pnpm build/;
const POTRZEBUJE_KLIENTA = new RegExp(`db:seed|prisma db seed|${URUCHAMIA_JEST.source}`);

describe('X-17 — joby CI budują to, czego ich kroki potrzebują', () => {
  it('plik ci.yml daje się rozłożyć na joby', () => {
    const lista = joby();
    expect(lista.length).toBeGreaterThanOrEqual(5);
    expect(lista.map((j) => j.nazwa)).toEqual(
      expect.arrayContaining(['static-checks', 'api-tests', 'migrations', 'integration']),
    );
  });

  it('każdy job uruchamiający testy najpierw buduje biblioteki workspace’u', () => {
    const winni = joby()
      .filter((j) => URUCHAMIA_JEST.test(j.tresc))
      .filter((j) => !BUDUJE_BIBLIOTEKI.test(j.tresc) && !/pnpm typecheck/.test(j.tresc))
      .map((j) => j.nazwa);

    if (winni.length > 0) {
      throw new Error(
        `Joby uruchamiające testy bez zbudowania bibliotek: ${winni.join(', ')}.\n\n` +
          '@verris/database ma main: dist/index.js. Bez `dist/` jest nie rozwiąże modułu\n' +
          'i zestawy testowe NIE WYSTARTUJĄ — job będzie czerwony w sposób, który wygląda\n' +
          'jak awaria testów, a jest awarią konfiguracji.\n\n' +
          'Dodaj krok:\n' +
          '  - name: Build workspace libraries\n' +
          '    run: pnpm --filter @verris/database --filter @verris/contracts --filter @verris/directadmin-sdk run build',
      );
    }
    expect(winni).toEqual([]);
  });

  it('każdy job potrzebujący @verris/database generuje klienta Prismy', () => {
    const winni = joby()
      .filter((j) => POTRZEBUJE_KLIENTA.test(j.tresc))
      .filter((j) => !GENERUJE_KLIENTA.test(j.tresc))
      .map((j) => j.nazwa);

    if (winni.length > 0) {
      throw new Error(
        `Joby wołające kod importujący @verris/database bez wygenerowanego klienta: ${winni.join(', ')}.\n\n` +
          'Klient Prismy nie jest w repozytorium — powstaje z `prisma generate`.\n' +
          'Dodaj krok:\n' +
          '  - name: Generate Prisma client\n' +
          '    run: pnpm --filter @verris/database db:generate',
      );
    }
    expect(winni).toEqual([]);
  });

  it('zadanie `test` w turbo.json zależy od zbudowanych zależności', () => {
    // Żeby `pnpm test` był poprawny również lokalnie i w każdym przyszłym jobie,
    // a nie tylko tam, gdzie ktoś pamiętał o jawnym kroku budowania.
    const turbo = JSON.parse(readFileSync(resolve(KORZEN, 'turbo.json'), 'utf-8'));
    expect(turbo.tasks.test.dependsOn).toEqual(['^build']);
  });

  it('job integracyjny stawia bazę i stosuje migracje przed testami', () => {
    const job = joby().find((j) => j.nazwa === 'integration');
    expect(job).toBeDefined();
    expect(job!.tresc).toContain('postgres');
    expect(job!.tresc).toContain('prisma migrate deploy');
    expect(job!.tresc).toContain('jest.integration.cjs');
  });

  it('kontrola samego strażnika — rozpoznaje job bez budowania', () => {
    const atrapa = `  zly-job:
    steps:
      - name: Generate Prisma client
        run: pnpm --filter @verris/database db:generate
      - name: API unit tests
        run: pnpm --filter api test
`;
    expect(URUCHAMIA_JEST.test(atrapa)).toBe(true);
    expect(BUDUJE_BIBLIOTEKI.test(atrapa)).toBe(false);
  });
});
