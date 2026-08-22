import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Panel admina woła ścieżki, które API naprawdę wystawia.
 *
 * POWÓD ISTNIENIA
 * ───────────────
 * Przy M-06 formularz faktury ręcznej wołał `/admin/billing/invoices/reczna`,
 * a kontroler wystawia `/admin/invoices/reczna`. Kod się kompilował, testy
 * jednostkowe przechodziły, panel się budował — i formularz zwracałby 404
 * dopiero pod palcem operatora.
 *
 * To jest ta sama rodzina co „bliźniacze miejsca", tylko rozciągnięta na dwa
 * pakiety: ścieżka jest zapisana dwa razy, w panelu i w kontrolerze, a nic
 * ich nie łączy. Kompilator nie może pomóc, bo po obu stronach to zwykły
 * napis.
 *
 * CO STRAŻNIK ROBI
 * ────────────────
 * Wyciąga wszystkie wywołania `adminApi(...)` z panelu i wszystkie trasy
 * z kontrolerów API, po czym sprawdza, czy każde wywołanie ma pokrycie.
 * Segmenty dynamiczne (`${id}` w panelu, `:id` w kontrolerze) pasują do
 * wszystkiego — sprawdzamy kształt ścieżki i metodę, nie wartości.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');
const PANEL = join(KORZEN, 'apps', 'admin-panel', 'src');
const API = join(__dirname, '..');

type Metoda = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface Wywolanie {
  plik: string;
  metoda: Metoda;
  /** Ścieżka po normalizacji — jeden z wariantów. */
  sciezka: string;
  /** Napis dokładnie taki, jak stoi w kodzie panelu. */
  oryginal: string;
}

interface Trasa {
  metoda: Metoda;
  wzorzec: string;
}

function pliki(kat: string, rozszerzenia: string[], out: string[] = []): string[] {
  let wpisy: string[];
  try {
    wpisy = readdirSync(kat);
  } catch {
    return out;
  }
  for (const w of wpisy) {
    if (w === 'node_modules' || w === '.next') continue;
    const s = join(kat, w);
    if (statSync(s).isDirectory()) pliki(s, rozszerzenia, out);
    else if (rozszerzenia.some((r) => w.endsWith(r))) out.push(s);
  }
  return out;
}

/**
 * Warianty ścieżki, z których WYSTARCZY, że pasuje jeden.
 *
 * Wstawka doklejona do segmentu (`/admin/users${qs}`) bywa dwiema różnymi
 * rzeczami: kolejnym segmentem albo ciągiem zapytania, który przy pustej
 * wartości znika. Pierwsza wersja tego strażnika zamieniała ją na `*`
 * w miejscu i zgłaszała `/admin/users*` jako ścieżkę bez pokrycia — czyli
 * jedenaście fałszywych alarmów przy dwóch prawdziwych znaleziskach.
 * Strażnik, który tonie we własnym szumie, zostanie wyciszony.
 */
export function kandydaci(sciezka: string): string[] {
  const bezZapytania = sciezka.split('?')[0];
  const pelny = bezZapytania
    .replace(/\$\{[^}]*\}/g, '*')
    // Ścieżka kończąca się ukośnikiem to sklejanie w kodzie
    // (`/admin/plans/` + id) — traktujemy jak segment dynamiczny.
    .replace(/\/$/, '/*');
  const out = [pelny];

  // Wstawka NIE poprzedzona ukośnikiem może zniknąć (pusty ciąg zapytania).
  const doklejona = /[^/]\$\{/.test(bezZapytania);
  if (doklejona) {
    const uciety = bezZapytania.replace(/\$\{[\s\S]*$/, '').replace(/\/$/, '');
    if (uciety.startsWith('/admin')) out.push(uciety);
  }
  return out;
}

/** Zgodność wsteczna dla testów kontrolnych. */
export function normalizuj(sciezka: string): string {
  return kandydaci(sciezka)[0];
}

/** `/admin/plans/:id/pdf` → `/admin/plans/*​/pdf` */
export function wzorzecTrasy(baza: string, pod: string): string {
  const czesci = [baza, pod].filter((c) => c && c !== '/').join('/');
  return (
    '/' +
    czesci
      .split('/')
      .filter(Boolean)
      .map((s) => (s.startsWith(':') ? '*' : s))
      .join('/')
  );
}

export function pasuje(wywolanie: string, wzorzec: string): boolean {
  const a = wywolanie.split('/').filter(Boolean);
  const b = wzorzec.split('/').filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((s, i) => s === '*' || b[i] === '*' || s === b[i]);
}

function zbierzWywolania(): Wywolanie[] {
  const out: Wywolanie[] = [];
  for (const p of pliki(PANEL, ['.ts', '.tsx'])) {
    const tekst = readFileSync(p, 'utf8');
    // adminApi<...>( "ścieżka" | `ścieżka` , { method: "POST" ... } )
    const re = /adminApi\s*(?:<[^>]*>)?\s*\(\s*[`"']([^`"']+)[`"']([\s\S]{0,400})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tekst)) !== null) {
      const sciezka = m[1];
      if (!sciezka.startsWith('/admin')) continue;
      // Ogon przycięty do KOŃCA TEGO wywołania. Pierwsza wersja czytała 220
      // znaków na ślepo i łapała `method: "POST"` z NASTĘPNEGO wywołania —
      // przez co zwykły `adminApi("/…/activity")` raportowany był jako POST
      // do trasy, która jest GET-em. Strażnik wskazujący nie ten wiersz
      // kosztuje tyle samo czasu co brak strażnika.
      const ogon = m[2].split(';')[0].split('adminApi')[0];
      const mm = /method:\s*["'](GET|POST|PATCH|PUT|DELETE)["']/.exec(ogon);
      const metoda = (mm?.[1] as Metoda) ?? 'GET';
      for (const s of kandydaci(sciezka)) {
        out.push({ plik: relative(KORZEN, p), metoda, sciezka: s, oryginal: sciezka });
      }
    }
  }
  return out;
}

function zbierzTrasy(): Trasa[] {
  const out: Trasa[] = [];
  for (const p of pliki(API, ['.controller.ts'])) {
    const tekst = readFileSync(p, 'utf8');
    const baza = /@Controller\(\s*['"`]([^'"`]*)['"`]/.exec(tekst)?.[1] ?? '';
    const re = /@(Get|Post|Patch|Put|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tekst)) !== null) {
      out.push({
        metoda: m[1].toUpperCase() as Metoda,
        wzorzec: wzorzecTrasy(baza, m[2] ?? ''),
      });
    }
  }
  return out;
}

describe('Panel admina i API mówią tymi samymi ścieżkami', () => {
  const wywolania = zbierzWywolania();
  const trasy = zbierzTrasy();

  it('strażnik ma czego pilnować', () => {
    // Bez tego progu przepisanie wyciągania na wzorzec, który niczego nie
    // znajduje, dałoby wiecznie zielony test.
    expect(wywolania.length).toBeGreaterThan(30);
    expect(trasy.length).toBeGreaterThan(80);
  });

  it('każde wywołanie z panelu ma odpowiadającą trasę w API', () => {
    // Warianty tej samej ścieżki grupujemy po pliku i metodzie — wystarczy,
    // że pasuje jeden z nich.
    const wgKlucza = new Map<string, Wywolanie[]>();
    for (const w of wywolania) {
      // Grupujemy po ORYGINALE, nie po wariancie. Pierwsza poprawka
      // grupowała po ściętej ścieżce i rozdzielała warianty tego samego
      // wywołania do osobnych grup — czyli wariant „pełny" zawsze zostawał sam
      // i zawsze wyglądał na niepokryty.
      const k = `${w.plik}|${w.metoda}|${w.oryginal}`;
      wgKlucza.set(k, [...(wgKlucza.get(k) ?? []), w]);
    }
    const bezPokrycia = [...wgKlucza.values()]
      .filter(
        (grupa) =>
          !grupa.some((w) =>
            trasy.some((t) => t.metoda === w.metoda && pasuje(w.sciezka, t.wzorzec)),
          ),
      )
      .map((grupa) => grupa[0]);
    const opis = bezPokrycia
      .map((w) => {
        const tenSamKsztalt = trasy.filter((t) => pasuje(w.sciezka, t.wzorzec));
        const podpowiedz = tenSamKsztalt.length
          ? ` (ścieżka istnieje, ale dla metod: ${tenSamKsztalt.map((t) => t.metoda).join(', ')})`
          : '';
        return `  ${w.plik}: ${w.metoda} ${w.oryginal}${podpowiedz}`;
      })
      .join('\n');
    expect(
      bezPokrycia.length === 0
        ? ''
        : `Panel woła ścieżki, których API nie wystawia — kod się kompiluje, ` +
          `panel się buduje, a 404 wychodzi dopiero pod palcem operatora:\n${opis}`,
    ).toBe('');
  });

  it('rozpoznaje ścieżkę, której nie ma', () => {
    expect(pasuje('/admin/nie/ma/takiej', '/admin/invoices/reczna')).toBe(false);
    expect(pasuje('/admin/invoices/reczna', '/admin/invoices/reczna')).toBe(true);
  });

  it('segment dynamiczny pasuje po obu stronach', () => {
    expect(pasuje(normalizuj('/admin/plans/${id}'), wzorzecTrasy('admin/plans', ':id'))).toBe(true);
    expect(pasuje(normalizuj('/admin/plans/'), wzorzecTrasy('admin/plans', ':id'))).toBe(true);
    expect(pasuje(normalizuj('/admin/plans/${id}/x'), wzorzecTrasy('admin/plans', ':id'))).toBe(
      false,
    );
  });

  it('zapytanie w adresie nie wpływa na dopasowanie', () => {
    expect(normalizuj('/admin/invoices?status=PAID&page=2')).toBe('/admin/invoices');
  });
});
