import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Kod SERWEROWY paneli woła API po adresie wewnętrznym, nie publicznym.
 *
 * POWÓD ISTNIENIA
 * ───────────────
 * X-37, 2026-08-25. Panel klienta przestał wpuszczać użytkowników: logowanie
 * trwało wielokrotność dziesięciu sekund, a dashboard pokazywał „Usługi: fetch
 * failed / Domeny: fetch failed". Przyczyną była jedna stała:
 *
 *     const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
 *
 * `NEXT_PUBLIC_*` to z definicji adres dla PRZEGLĄDARKI. Użyty w kodzie, który
 * wykonuje serwer, każe kontenerowi wyjść na publiczny adres własnego hosta
 * i wrócić do środka (hairpin NAT). Dopóki ta pętla się domyka, wszystko
 * wygląda dobrze. Kiedy przestaje — a przestaje po zmianie sieci, mostka albo
 * NAT-u, czyli po czymś, co z panelem nie ma nic wspólnego — undici czeka
 * swoje domyślne 10 s i rzuca `fetch failed`.
 *
 * Najgorsze było to, jak ta awaria WYGLĄDAŁA. Panel admina działał, bo
 * `staff-api.ts` czytał `API_URL`. Nawigacja panelu klienta też się pojawiała,
 * bo `session-profile.ts` czytał `API_URL`. Zepsute były tylko te dwa miejsca,
 * które ominął ten sam nawyk — więc objaw czytał się jak „coś z siecią",
 * „coś z bazą", „coś z firewallem", i tam właśnie szukaliśmy.
 *
 * To jest rodzina „bliźniaczych miejsc": ta sama decyzja zapisana w pięciu
 * plikach, w czterech poprawnie. Kompilator nie pomoże, bo po obu stronach
 * to zwykły odczyt ze środowiska.
 *
 * CO STRAŻNIK ROBI
 * ────────────────
 * 1. Chodzi po kodzie paneli, pomija moduły `'use client'` (tam adres
 *    publiczny jest JEDYNYM poprawnym).
 * 2. Znajduje nazwy związane z wyrażeniem czytającym `NEXT_PUBLIC_API_URL`.
 * 3. Sprawdza, czy taka nazwa trafia do `fetch(...)`. Jeśli służy tylko do
 *    zbudowania odnośnika dla przeglądarki (np. `eco/page.tsx` składa adres
 *    odznaki), to jest w porządku i strażnik milczy.
 * 4. Jeśli trafia do `fetch(...)`, wyrażenie MUSI czytać też zmienną
 *    nie-publiczną — i to przed publiczną, bo publiczna jest zawsze ustawiona.
 * 5. Na koniec sprawdza, że ta zmienna wewnętrzna w ogóle jest podawana
 *    kontenerom w `docker-compose.prod.yml`. Fallback na zmienną, której nikt
 *    nie ustawia, jest gorszy niż jego brak: wygląda na przemyślany.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');
const PANELE = ['client-panel', 'staff-panel', 'admin-panel', 'status-page'];
const PUBLICZNA = 'NEXT_PUBLIC_API_URL';

function plikiZrodlowe(katalog: string): string[] {
  const wynik: string[] = [];
  let wpisy: string[];
  try {
    wpisy = readdirSync(katalog);
  } catch {
    return wynik;
  }
  for (const wpis of wpisy) {
    if (wpis === 'node_modules' || wpis === '.next') continue;
    const sciezka = join(katalog, wpis);
    if (statSync(sciezka).isDirectory()) {
      wynik.push(...plikiZrodlowe(sciezka));
    } else if (/\.tsx?$/.test(wpis) && !/\.spec\.tsx?$/.test(wpis)) {
      wynik.push(sciezka);
    }
  }
  return wynik;
}

function jestModulemPrzegladarki(tresc: string): boolean {
  return /^\s*(['"])use client\1/m.test(tresc.slice(0, 400));
}

/** Zmienne środowiskowe odczytane w danym wyrażeniu. */
function odczytaneZmienne(wyrazenie: string): string[] {
  return [...wyrazenie.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
}

/**
 * Wyrażenie czyta adres wewnętrzny, jeśli sięga po jakąkolwiek zmienną spoza
 * przestrzeni `NEXT_PUBLIC_`. Nie narzucamy jednej nazwy — panele używają
 * `API_URL`, strona statusu `VERRIS_API_URL` — narzucamy zasadę.
 */
function maAdresWewnetrzny(wyrazenie: string): boolean {
  return odczytaneZmienne(wyrazenie).some((n) => !n.startsWith('NEXT_PUBLIC_'));
}

/** Adres wewnętrzny musi być sprawdzany PRZED publicznym. */
function wewnetrznyJestPierwszy(wyrazenie: string): boolean {
  const nazwy = odczytaneZmienne(wyrazenie);
  const iWew = nazwy.findIndex((n) => !n.startsWith('NEXT_PUBLIC_'));
  const iPub = nazwy.indexOf(PUBLICZNA);
  return iWew !== -1 && (iPub === -1 || iWew < iPub);
}

interface Baza {
  nazwa: string;
  wyrazenie: string;
}

/** Nazwy (stałe i funkcje), których wartość pochodzi z NEXT_PUBLIC_API_URL. */
function bazyAdresu(tresc: string): Baza[] {
  const bazy: Baza[] = [];
  const stala = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*([\s\S]*?);/g;
  for (const m of tresc.matchAll(stala)) {
    if (m[2].includes(PUBLICZNA)) bazy.push({ nazwa: m[1], wyrazenie: m[2] });
  }
  const funkcja = /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g;
  for (const m of tresc.matchAll(funkcja)) {
    if (m[2].includes(PUBLICZNA)) bazy.push({ nazwa: `${m[1]}()`, wyrazenie: m[2] });
  }
  return bazy;
}

/** Pierwszy argument każdego wywołania `fetch(`, z grubsza. */
function argumentyFetch(tresc: string): string[] {
  return [...tresc.matchAll(/\bfetch\s*\(/g)].map((m) =>
    tresc.slice(m.index! + m[0].length, m.index! + m[0].length + 200),
  );
}

function uzytaJakoBazaFetch(tresc: string, nazwa: string): boolean {
  const goly = nazwa.replace(/\(\)$/, '');
  return argumentyFetch(tresc).some(
    (arg) =>
      arg.includes('${' + goly + '}') ||
      arg.includes('${' + goly + '()}') ||
      new RegExp(`\\b${goly}\\s*\\+`).test(arg),
  );
}

interface Naruszenie {
  plik: string;
  nazwa: string;
  powod: string;
}

function zbadajPanele(): { naruszenia: Naruszenie[]; zmienneWewnetrzne: Set<string> } {
  const naruszenia: Naruszenie[] = [];
  const zmienneWewnetrzne = new Set<string>();

  for (const panel of PANELE) {
    const zrodla = join(KORZEN, 'apps', panel, 'src');
    for (const plik of plikiZrodlowe(zrodla)) {
      const tresc = readFileSync(plik, 'utf8');
      if (!tresc.includes(PUBLICZNA)) continue;
      if (jestModulemPrzegladarki(tresc)) continue;

      for (const baza of bazyAdresu(tresc)) {
        if (!uzytaJakoBazaFetch(tresc, baza.nazwa)) continue;
        const wzgledna = relative(KORZEN, plik);
        if (!maAdresWewnetrzny(baza.wyrazenie)) {
          naruszenia.push({
            plik: wzgledna,
            nazwa: baza.nazwa,
            powod: `czyta tylko ${PUBLICZNA} (adres przeglądarki), a wynik trafia do fetch() po stronie serwera`,
          });
        } else if (!wewnetrznyJestPierwszy(baza.wyrazenie)) {
          naruszenia.push({
            plik: wzgledna,
            nazwa: baza.nazwa,
            powod: `${PUBLICZNA} jest sprawdzana przed zmienną wewnętrzną, więc wewnętrzna nigdy nie zadziała`,
          });
        } else {
          for (const n of odczytaneZmienne(baza.wyrazenie)) {
            if (!n.startsWith('NEXT_PUBLIC_')) zmienneWewnetrzne.add(n);
          }
        }
      }
    }
  }
  return { naruszenia, zmienneWewnetrzne };
}

describe('adres API po stronie serwera', () => {
  const { naruszenia, zmienneWewnetrzne } = zbadajPanele();

  it('żaden serwerowy fetch panelu nie wychodzi na adres publiczny', () => {
    const opis = naruszenia.map((n) => `  ${n.plik} → ${n.nazwa}: ${n.powod}`).join('\n');
    expect(naruszenia.length === 0 ? '' : `\n${opis}\n`).toBe('');
  });

  it('strażnik faktycznie łapie kod sprzed X-37', () => {
    const przedPoprawka = [
      "const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';",
      'const res = await fetch(`${API_URL}/services`);',
    ].join('\n');
    const bazy = bazyAdresu(przedPoprawka);
    expect(bazy).toHaveLength(1);
    expect(uzytaJakoBazaFetch(przedPoprawka, bazy[0].nazwa)).toBe(true);
    expect(maAdresWewnetrzny(bazy[0].wyrazenie)).toBe(false);
  });

  it('strażnik przepuszcza poprawny wzorzec', () => {
    const poPoprawce = [
      "const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';",
      'const res = await fetch(`${API_URL}/services`);',
    ].join('\n');
    const bazy = bazyAdresu(poPoprawce);
    expect(bazy).toHaveLength(1);
    expect(maAdresWewnetrzny(bazy[0].wyrazenie)).toBe(true);
    expect(wewnetrznyJestPierwszy(bazy[0].wyrazenie)).toBe(true);
  });

  it('strażnik milczy, gdy adres publiczny służy przeglądarce, nie fetchowi', () => {
    const odznaka = [
      "const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\\/$/, '');",
      'const href = `${apiBase}/public/eco/badge/${token}`;',
    ].join('\n');
    const bazy = bazyAdresu(odznaka);
    expect(bazy.length).toBeGreaterThan(0);
    expect(uzytaJakoBazaFetch(odznaka, bazy[0].nazwa)).toBe(false);
  });

  it('każda zmienna wewnętrzna jest naprawdę podawana kontenerom', () => {
    const compose = readFileSync(join(KORZEN, 'docker-compose.prod.yml'), 'utf8');
    const nieustawione = [...zmienneWewnetrzne].filter(
      (n) => !new RegExp(`^\\s*${n}\\s*:`, 'm').test(compose),
    );
    expect({ nieustawione, znalezione: [...zmienneWewnetrzne].sort() }).toEqual({
      nieustawione: [],
      znalezione: [...zmienneWewnetrzne].sort(),
    });
  });

  it('panel klienta i panel personelu używają tego samego wzorca', () => {
    const czytaWewnetrzny = (p: string) =>
      maAdresWewnetrzny(readFileSync(join(KORZEN, p), 'utf8'));
    expect(czytaWewnetrzny('apps/client-panel/src/lib/api.ts')).toBe(true);
    expect(czytaWewnetrzny('apps/staff-panel/src/lib/staff-api.ts')).toBe(true);
    expect(czytaWewnetrzny('apps/client-panel/src/lib/session-profile.ts')).toBe(true);
    expect(
      czytaWewnetrzny('apps/client-panel/src/app/dashboard/file-manager/data.ts'),
    ).toBe(true);
  });
});
