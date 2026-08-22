import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * X-23 (część druga) — wyciszenie Dependabota z terminem, nie na zawsze.
 *
 * `.github/dependabot.yml` dostał reguły `ignore` na majory Prismy
 * i TypeScriptu. Powody są prawdziwe (patrz X-18 i X-20), ale wyciszenie bez
 * terminu to dokładnie ten sam ruch co `continue-on-error` na kroku audytu:
 * alarm przestaje dzwonić i nikt się nie dowie, kiedy przyczyna zniknie.
 *
 * Ten strażnik wymaga, żeby przy każdej regule `ignore` stały dwa komentarze:
 *
 *   # pozycja: X-20          ← kto za to odpowiada
 *   # przegląd: 2026-11-15   ← do kiedy
 *
 * i czerwieni się, gdy termin minie. Przedłużenie jest wtedy decyzją, nie
 * skutkiem tego, że nikt nie zajrzał.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');
const PLIK = join(KORZEN, '.github', 'dependabot.yml');

export interface Wyciszenie {
  pakiet: string;
  pozycja: string | null;
  przeglad: string | null;
  linia: number;
}

/**
 * Czyta reguły `ignore` razem z komentarzami stojącymi bezpośrednio nad nimi.
 * Parser YAML-a komentarzy nie widzi, a to w nich siedzi cała odpowiedzialność.
 */
export function wyciszenia(yaml: string): Wyciszenie[] {
  const linie = yaml.split('\n');
  const wynik: Wyciszenie[] = [];
  let wIgnore = false;
  let wciecieIgnore = 0;

  for (let i = 0; i < linie.length; i++) {
    const l = linie[i];
    const start = /^(\s*)ignore:\s*$/.exec(l);
    if (start) {
      wIgnore = true;
      wciecieIgnore = start[1].length;
      continue;
    }
    if (!wIgnore) continue;

    // Wyjście z bloku: linia z treścią na wcięciu <= `ignore:` i nie będąca
    // jego elementem ani komentarzem.
    const wciecie = /^(\s*)/.exec(l)?.[1].length ?? 0;
    if (l.trim() !== '' && !/^\s*#/.test(l) && wciecie <= wciecieIgnore) {
      wIgnore = false;
      continue;
    }

    const wpis = /^\s*-\s*dependency-name:\s*'?"?([^'"\s]+)'?"?\s*$/.exec(l);
    if (!wpis) continue;

    // Cofamy się przez komentarze bezpośrednio nad wpisem.
    let pozycja: string | null = null;
    let przeglad: string | null = null;
    for (let j = i - 1; j >= 0 && /^\s*#/.test(linie[j]); j--) {
      const p = /#\s*pozycja:\s*([A-ZŁŚŻŹĆÓĘĄŃ]+-\d+)/.exec(linie[j]);
      const d = /#\s*przegląd:\s*(\d{4}-\d{2}-\d{2})/.exec(linie[j]);
      if (p && !pozycja) pozycja = p[1];
      if (d && !przeglad) przeglad = d[1];
    }
    wynik.push({ pakiet: wpis[1], pozycja, przeglad, linia: i + 1 });
  }
  return wynik;
}

describe('X-23 — wyciszenia Dependabota mają termin', () => {
  const tresc = readFileSync(PLIK, 'utf8');
  const lista = wyciszenia(tresc);

  it('strażnik ma czego pilnować', () => {
    // Gdyby parser przestał cokolwiek znajdować, testy niżej przechodziłyby
    // pusto. Tu jest granica tej pustki.
    expect(lista.length).toBeGreaterThanOrEqual(3);
    expect(lista.map((w) => w.pakiet)).toEqual(
      expect.arrayContaining(['@prisma/client', 'prisma', 'typescript']),
    );
  });

  it('każde wyciszenie wskazuje pozycję macierzy i termin przeglądu', () => {
    const braki = lista
      .filter((w) => !w.pozycja || !w.przeglad)
      .map(
        (w) =>
          `  ${PLIK.split('/').slice(-2).join('/')}:${w.linia} — ${w.pakiet}: ` +
          `${!w.pozycja ? 'brak „# pozycja: X-nn"' : ''}` +
          `${!w.pozycja && !w.przeglad ? ' i ' : ''}` +
          `${!w.przeglad ? 'brak „# przegląd: RRRR-MM-DD"' : ''}`,
      );
    expect(
      braki.length === 0
        ? ''
        : `Wyciszenie Dependabota bez właściciela albo bez terminu to alarm ` +
          `wyłączony na zawsze (patrz X-23):\n${braki.join('\n')}`,
    ).toBe('');
  });

  it('żaden termin przeglądu nie minął', () => {
    const dzis = new Date();
    const przeterminowane = lista
      .filter((w) => w.przeglad && new Date(w.przeglad) < dzis)
      .map(
        (w) =>
          `  ${w.pakiet} (${w.pozycja ?? 'bez pozycji'}) — termin ${w.przeglad} minął`,
      );
    expect(
      przeterminowane.length === 0
        ? ''
        : `Termin przeglądu wyciszenia minął. Sprawdź, czy przyczyna nadal ` +
          `istnieje: jeśli tak — przedłuż świadomie, jeśli nie — usuń regułę ` +
          `i pozwól Dependabotowi wrócić:\n${przeterminowane.join('\n')}`,
    ).toBe('');
  });

  it('każda pozycja wskazana w wyciszeniu istnieje w macierzy', () => {
    const macierz = readFileSync(join(KORZEN, 'audyt', 'dane', 'macierz.csv'), 'utf8');
    for (const w of lista) {
      if (w.pozycja) expect(macierz).toContain(`${w.pozycja},`);
    }
  });

  it('parser rozpoznaje brak komentarzy i nie zmyśla', () => {
    const bezKomentarzy = [
      'updates:',
      '  - package-ecosystem: npm',
      '    ignore:',
      "      - dependency-name: 'jakis-pakiet'",
      '        update-types: [version-update:semver-major]',
    ].join('\n');
    const w = wyciszenia(bezKomentarzy);
    expect(w).toHaveLength(1);
    expect(w[0].pozycja).toBeNull();
    expect(w[0].przeglad).toBeNull();
  });

  it('parser nie wychodzi poza blok ignore', () => {
    const zSasiadem = [
      '    ignore:',
      '      # pozycja: X-20',
      '      # przegląd: 2026-11-15',
      '      - dependency-name: prisma',
      '        update-types: [version-update:semver-major]',
      '  - package-ecosystem: docker',
      '    directory: /',
      '      - dependency-name: nie-liczy-sie',
    ].join('\n');
    const w = wyciszenia(zSasiadem);
    expect(w.map((x) => x.pakiet)).toEqual(['prisma']);
    expect(w[0].przeglad).toBe('2026-11-15');
  });
});
