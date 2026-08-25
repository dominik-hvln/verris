import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';

/**
 * Kod paczki `api` nie sięga ścieżką względną poza własną paczkę.
 *
 * POWÓD ISTNIENIA
 * ───────────────
 * 2026-08-25, wdrożenie X-38. Nowy strażnik importował moduł z sąsiedniej
 * paczki ścieżką względną:
 *
 *     import { opiszBladSieci } from '../../../client-panel/src/lib/blad-sieci';
 *
 * Lokalnie `jest` przechodził. Bramka CI padła.
 *
 * DLACZEGO JEDNO MÓWIŁO „TAK", A DRUGIE „NIE"
 * ───────────────────────────────────────────
 * `ts-jest` kompiluje plik po pliku i nie zna pojęcia `rootDir`. `tsc --noEmit`
 * buduje jeden program dla całej paczki i sprawdza, czy każdy plik mieści się
 * w `rootDir: "src"`. Plik z `apps/client-panel` się nie mieści — TS6059.
 *
 * Bramka odpala OBIE rzeczy. Zielony `jest` nie jest więc dowodem, że wdrożenie
 * przejdzie, i ten strażnik istnieje po to, żeby różnica między nimi objawiała
 * się w teście, a nie w nieudanym wdrożeniu.
 *
 * CO ROBIĆ ZAMIAST
 * ────────────────
 * Kod współdzielony między paczkami trafia do `libs/` i jest importowany
 * NAZWĄ PAKIETU (`@verris/contracts`, `@verris/database`). Import po nazwie
 * przechodzi przez `node_modules` i `rootDir` go nie dotyczy — `apps/api` robi
 * tak od zawsze.
 *
 * To jest też jedyna droga do testowania logiki paneli: `apps/client-panel`
 * nie ma runnera (X-40), więc czysta logika, która ma być sprawdzana
 * wykonaniem, musi mieszkać w `libs/`.
 */

const PACZKA = resolve(__dirname, '..', '..');           // apps/api
const ZRODLA = join(PACZKA, 'src');

function pliki(katalog: string): string[] {
  const wynik: string[] = [];
  for (const wpis of readdirSync(katalog)) {
    if (wpis === 'node_modules' || wpis === 'dist') continue;
    const sciezka = join(katalog, wpis);
    if (statSync(sciezka).isDirectory()) wynik.push(...pliki(sciezka));
    else if (/\.tsx?$/.test(wpis)) wynik.push(sciezka);
  }
  return wynik;
}

interface Ucieczka {
  plik: string;
  import: string;
  prowadziDo: string;
}

/**
 * Usuwa komentarze przed skanowaniem.
 *
 * Bez tego strażnik zapala się na WŁASNEJ dokumentacji: opis defektu cytuje
 * zakazany import, a wyrażenie regularne nie odróżnia prozy od kodu. To trzecia
 * odsłona tej samej pułapki w tym repo — pierwsza przy `noDataState` (X-35),
 * druga przy `.catch(() => null)` (X-39). Zasada: strażnik czytający źródło
 * MUSI najpierw odciąć komentarze, inaczej opisanie defektu staje się jego
 * popełnieniem.
 *
 * Komentarze liniowe wycinamy tylko wtedy, gdy `//` zaczyna linię — inaczej
 * połowa adresów `https://` zniknęłaby razem z resztą wiersza.
 */
function bezKomentarzy(tresc: string): string {
  return tresc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((linia) => !/^\s*\/\//.test(linia))
    .join('\n');
}

function ucieczki(): Ucieczka[] {
  const znalezione: Ucieczka[] = [];
  for (const plik of pliki(ZRODLA)) {
    const tresc = bezKomentarzy(readFileSync(plik, 'utf8'));
    const wzorzec = /(?:from|import|require\()\s*['"](\.[^'"]*)['"]/g;
    for (const m of tresc.matchAll(wzorzec)) {
      const cel = resolve(dirname(plik), m[1]);
      if (cel === PACZKA || cel.startsWith(PACZKA + sep)) continue;
      znalezione.push({
        plik: relative(PACZKA, plik),
        import: m[1],
        prowadziDo: relative(resolve(PACZKA, '..', '..'), cel),
      });
    }
  }
  return znalezione;
}

describe('testy nie sięgają poza swoją paczkę', () => {
  it('żaden import względny nie wychodzi poza apps/api', () => {
    const opis = ucieczki()
      .map(
        (u) =>
          `  ${u.plik}\n    import '${u.import}' → ${u.prowadziDo}\n` +
          `    użyj nazwy pakietu (@verris/...) i przenieś kod do libs/`,
      )
      .join('\n');
    expect(opis).toBe('');
  });

  it('strażnik faktycznie łapie import, który wywrócił wdrożenie X-38', () => {
    const zTestu = resolve(ZRODLA, 'test');
    const cel = resolve(zTestu, '../../../client-panel/src/lib/blad-sieci');
    expect(cel.startsWith(PACZKA + sep)).toBe(false);

    const wPaczce = resolve(zTestu, '../prisma/prisma.service');
    expect(wPaczce.startsWith(PACZKA + sep)).toBe(true);
  });

  it('nie zapala się na cudzysłowie w komentarzu', () => {
    // Ścieżkę składamy z kawałków CELOWO. Wpisana wprost, byłaby prawdziwym
    // naruszeniem w tym pliku — strażnik złapałby własny materiał testowy.
    // To ta sama pułapka, przed którą broni `bezKomentarzy`, tylko o piętro
    // głębiej: nie wystarczy odciąć komentarze, nie wolno też ZAPISAĆ wzorca
    // w źródle strażnika.
    const zly = ['..', '..', '..', 'inna-paczka', 'x'].join('/');
    const dobry = ['.', 'sasiad'].join('/');
    const zKomentarzem = [
      `/** przyklad zlego importu: from '${zly}' */`,
      `// tez zly: from '${zly}'`,
      `import { cos } from '${dobry}';`,
      "const url = 'https://przyklad.pl/a';",
    ].join('\n');

    const czysty = bezKomentarzy(zKomentarzem);
    expect(czysty).not.toMatch(/inna-paczka/);
    expect(czysty).toMatch(/sasiad/);
    // Adres z `//` w środku ma przeżyć — inaczej wycinanie komentarzy
    // kaleczyłoby zwykły kod.
    expect(czysty).toMatch(/https:\/\/przyklad\.pl/);
  });
});
