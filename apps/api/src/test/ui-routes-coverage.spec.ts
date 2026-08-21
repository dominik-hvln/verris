import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Strażnik klasy błędów „UI bez endpointu".
 *
 * Audyt parytetu z 2026-08-20 znalazł 16 miejsc, w których panel wołał ścieżkę,
 * której nie rejestrował żaden kontroler. Kliknięcie kończyło się 404 — czasem
 * cicho, bo front miał fallback („Auto-logowanie niedostępne"), więc nikt tego
 * nie zgłaszał. Pojedyncze testy per trasa nie zapobiegają nawrotom; ten test
 * porównuje CAŁY zbiór wywołań `apiFetch` z panelu z CAŁYM zbiorem tras API.
 *
 * Analiza jest statyczna — nie importuje kontrolerów, więc nie potrzebuje
 * klienta Prisma ani kontenera DI i działa w każdym środowisku.
 */

const API_SRC = resolve(__dirname, '..');
const PANELE = ['client-panel', 'staff-panel', 'admin-panel'].map((p) =>
  resolve(__dirname, '../../../..', 'apps', p, 'src'),
);

/** Ścieżki wołane przez panel, które celowo NIE są trasami NestJS. */
const POZA_API = [
  /^\/api\//, // trasy Next.js po stronie panelu
  /^https?:\/\//, // adresy zewnętrzne
];

function plikiTs(katalog: string): string[] {
  let out: string[] = [];
  let wpisy: string[];
  try {
    wpisy = readdirSync(katalog);
  } catch {
    return out;
  }
  for (const w of wpisy) {
    const p = join(katalog, w);
    if (statSync(p).isDirectory()) {
      if (w === 'node_modules' || w === '.next') continue;
      out = out.concat(plikiTs(p));
    } else if (/\.(ts|tsx)$/.test(w) && !/\.spec\.tsx?$/.test(w)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * `/services/${id}/hosting-db-users?db=${x}` → `/services/:p/hosting-db-users`
 *
 * Interpolacja doklejona do segmentu (bez ukośnika przed nią) to nie parametr
 * ścieżki, tylko doklejony query string — np. `` `/services/${id}/health${q}` ``.
 * Wszystko od tego miejsca odcinamy, inaczej test zgłasza fałszywe sieroty.
 */
function normalizuj(sciezka: string): string {
  let out = '';
  let i = 0;
  while (i < sciezka.length) {
    if (sciezka.startsWith('${', i)) {
      const koniec = sciezka.indexOf('}', i);
      if (koniec === -1) break;
      if (!out.endsWith('/')) break; // doklejony query string — koniec ścieżki
      out += ':p';
      i = koniec + 1;
      continue;
    }
    if (sciezka[i] === '?') break;
    out += sciezka[i];
    i += 1;
  }
  return out.replace(/\/+$/, '').replace(/^\/*/, '/');
}

interface Wywolanie {
  sciezka: string;
  plik: string;
}

function wywolaniaZPaneli(): Wywolanie[] {
  const out: Wywolanie[] = [];
  for (const panel of PANELE) {
    for (const plik of plikiTs(panel)) {
      const tresc = readFileSync(plik, 'utf8');
      // apiFetch(`/...`) oraz apiFetch<T>(`/...`)
      const re = /apiFetch\s*(?:<[^>]*>)?\s*\(\s*`([^`]+)`/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(tresc))) {
        const surowa = m[1];
        if (POZA_API.some((r) => r.test(surowa))) continue;
        if (!surowa.startsWith('/')) continue;
        out.push({ sciezka: normalizuj(surowa), plik: plik.split('/apps/')[1] ?? plik });
      }
    }
  }
  return out;
}

/** Wszystkie trasy zarejestrowane w kontrolerach: prefiks klasy + ścieżka metody. */
function trasyApi(): Set<string> {
  const trasy = new Set<string>();
  for (const plik of plikiTs(API_SRC)) {
    const tresc = readFileSync(plik, 'utf8');
    const mPrefiks = /@Controller\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/.exec(tresc);
    if (!mPrefiks) continue;
    const prefiks = (mPrefiks[1] ?? '').replace(/^\/*/, '').replace(/\/*$/, '');
    const re = /@(?:Get|Post|Patch|Put|Delete|All)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tresc))) {
      const metoda = (m[1] ?? '').replace(/^\/*/, '').replace(/\/*$/, '');
      const pelna = ['', prefiks, metoda].filter(Boolean).join('/');
      trasy.add(normalizuj('/' + pelna.replace(/^\/*/, '')));
    }
  }
  return trasy;
}

/** `:id`, `:userId`, `${x}` — wszystko to jeden segment parametru. */
function wzorzec(sciezka: string): string {
  return sciezka
    .split('/')
    .map((seg) => (seg.startsWith(':') ? ':p' : seg))
    .join('/');
}

describe('Pokrycie tras: każde wywołanie apiFetch ma zarejestrowaną trasę w API', () => {
  const trasy = new Set([...trasyApi()].map(wzorzec));
  const wywolania = wywolaniaZPaneli();

  it('znajduje sensowną liczbę tras i wywołań (test sam się nie oszukuje)', () => {
    // Gdyby regex przestał cokolwiek łapać, poniższy test przechodziłby pusty.
    expect(trasy.size).toBeGreaterThan(100);
    expect(wywolania.length).toBeGreaterThan(100);
  });

  it('nie ma wywołania bez odpowiadającej trasy', () => {
    const osierocone = wywolania
      .filter((w) => !trasy.has(wzorzec(w.sciezka)))
      .map((w) => `${w.sciezka}   ← ${w.plik}`);

    const unikalne = [...new Set(osierocone)].sort();
    expect(unikalne).toEqual([]);
  });
});
