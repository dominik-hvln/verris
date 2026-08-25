import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Każdy spec ma runner, a bramka uruchamia każdy runner.
 *
 * POWÓD ISTNIENIA
 * ───────────────
 * X-40. `apps/client-panel/src/lib/client-nav-access.spec.ts` leżał w repo
 * miesiącami i NIE WYKONAŁ SIĘ ANI RAZU. Pakiet nie miał skryptu `test`,
 * a bramka CI wołała `pnpm --filter api test`, czyli dokładnie jeden pakiet.
 *
 * Test, którego nikt nie uruchamia, jest gorszy niż jego brak. Brak widać —
 * martwy spec wygląda jak pokrycie i zniechęca do napisania prawdziwego.
 *
 * Koszt był większy niż jeden plik. Przy X-37, X-38 i X-39 każdy strażnik
 * dotyczący panelu musiał CZYTAĆ ŹRÓDŁO zamiast wykonywać kod, bo nie było
 * gdzie go uruchomić. To słabsza forma dowodu: sprawdza, jak kod wygląda,
 * nie jak się zachowuje.
 *
 * DWA WARUNKI, OBA KONIECZNE
 * ──────────────────────────
 * Sam skrypt `test` w pakiecie nic nie daje, jeśli bramka go nie woła.
 * Samo `pnpm test` w bramce nic nie daje, jeśli pakiet nie ma skryptu.
 * Ten strażnik pilnuje obu naraz — bo defekt polegał na tym, że każda połowa
 * z osobna wyglądała rozsądnie.
 */

const KORZEN = resolve(__dirname, '..', '..', '..', '..');

/** Polecenie obejmujące CAŁY workspace, a nie wybrany pakiet. */
const CALY_WORKSPACE = /(?:^|\s)(?:pnpm\s+(?:run\s+)?test|(?:pnpm\s+)?turbo\s+run\s+test)(?:\s|$)/m;

/**
 * Wycina komentarze YAML przed szukaniem poleceń.
 *
 * Bez tego strażnik czytałby komentarz opisujący STARE polecenie tak samo jak
 * prawdziwy krok. To czwarta odsłona tej pułapki w tym repo (X-35, X-39,
 * strażnik importów) — reguła jest już utrwalona: skanujesz źródło, najpierw
 * odetnij prozę.
 */
function bezKomentarzy(yaml: string): string {
  return yaml
    .split('\n')
    .filter((linia) => !/^\s*#/.test(linia))
    .join('\n');
}

function pakietyWorkspace(): string[] {
  const wynik: string[] = [];
  for (const grupa of ['apps', 'libs']) {
    const katalog = join(KORZEN, grupa);
    if (!existsSync(katalog)) continue;
    for (const wpis of readdirSync(katalog)) {
      const sciezka = join(katalog, wpis);
      if (statSync(sciezka).isDirectory() && existsSync(join(sciezka, 'package.json'))) {
        wynik.push(`${grupa}/${wpis}`);
      }
    }
  }
  return wynik;
}

function specy(katalog: string): string[] {
  const wynik: string[] = [];
  let wpisy: string[];
  try {
    wpisy = readdirSync(katalog);
  } catch {
    return wynik;
  }
  for (const wpis of wpisy) {
    if (wpis === 'node_modules' || wpis === '.next' || wpis === 'dist') continue;
    const sciezka = join(katalog, wpis);
    if (statSync(sciezka).isDirectory()) wynik.push(...specy(sciezka));
    else if (/\.(spec|test)\.tsx?$/.test(wpis)) wynik.push(sciezka);
  }
  return wynik;
}

function skrypty(pakiet: string): Record<string, string> {
  const json = JSON.parse(readFileSync(join(KORZEN, pakiet, 'package.json'), 'utf8'));
  return json.scripts ?? {};
}

describe('każdy spec ma runner', () => {
  const pakiety = pakietyWorkspace();

  it('pakiet ze specami deklaruje skrypt `test`', () => {
    const osierocone = pakiety
      .filter((p) => specy(join(KORZEN, p)).length > 0)
      .filter((p) => !skrypty(p).test)
      .map((p) => {
        const ile = specy(join(KORZEN, p)).length;
        return `  ${p}: ${ile} spec(ów), brak skryptu \`test\` — nikt ich nie uruchamia`;
      });
    expect(osierocone.join('\n')).toBe('');
  });

  it.each([
    ['.github/workflows/ci.yml'],
    ['.github/workflows/deploy.yml'],
  ])('%s uruchamia testy całego workspace, nie jednego pakietu', (plik) => {
    const polecenia = bezKomentarzy(readFileSync(join(KORZEN, plik), 'utf8'))
      .split('\n')
      .filter((l) => /^\s*run:/.test(l));
    const obejmujeWszystko = polecenia.some((l) => CALY_WORKSPACE.test(l));
    expect({ plik, obejmujeWszystko }).toEqual({ plik, obejmujeWszystko: true });
  });

  it('panel klienta ma komplet: skrypt, konfigurację i tsconfig widzący specy', () => {
    const panel = 'apps/client-panel';
    expect(skrypty(panel).test).toBeTruthy();
    expect(existsSync(join(KORZEN, panel, 'jest.config.cjs'))).toBe(true);

    // Główny tsconfig panelu WYKLUCZA specy (Next ich nie buduje). Musi więc
    // istnieć osobny, który je obejmuje — inaczej testy nie są typowane.
    const glowny = JSON.parse(readFileSync(join(KORZEN, panel, 'tsconfig.json'), 'utf8'));
    expect(glowny.exclude.join(' ')).toMatch(/spec/);
    const testowy = join(KORZEN, panel, 'tsconfig.spec.json');
    expect(existsSync(testowy)).toBe(true);
    // tsconfig to JSONC — TypeScript dopuszcza komentarze, `JSON.parse` nie.
    const spec = JSON.parse(
      readFileSync(testowy, 'utf8')
        .split('\n')
        .filter((linia) => !/^\s*\/\//.test(linia))
        .join('\n'),
    );
    expect(spec.include.join(' ')).toMatch(/src/);
    expect(spec.compilerOptions.module).toBe('commonjs');
  });

  describe('strażnik faktycznie łapie stan sprzed X-40', () => {
    it('odrzuca bramkę wołającą tylko jeden pakiet', () => {
      const filtr = ['pnpm', '--filter', 'api', 'test'].join(' ');
      expect(CALY_WORKSPACE.test(`        run: ${filtr}`)).toBe(false);
      expect(CALY_WORKSPACE.test('        run: pnpm test')).toBe(true);
      expect(CALY_WORKSPACE.test('        run: turbo run test')).toBe(true);
    });

    it('nie daje się nabrać na komentarz cytujący stare polecenie', () => {
      const filtr = ['pnpm', '--filter', 'api', 'test'].join(' ');
      const yaml = [`      # kiedyś było: ${filtr}`, '      - name: X', '        run: pnpm lint'].join('\n');
      const polecenia = bezKomentarzy(yaml).split('\n').filter((l) => /^\s*run:/.test(l));
      expect(polecenia.some((l) => CALY_WORKSPACE.test(l))).toBe(false);
      expect(bezKomentarzy(yaml)).not.toMatch(/kiedyś było/);
    });
  });
});
