import { execFileSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * X-21 — deklaracje typów muszą opisywać ten kod, który naprawdę jest zainstalowany.
 *
 * Tło. `apps/api/package.json` deklarowało `archiver: ^8.0.0` i jednocześnie
 * `@types/archiver: ^7.0.0`. Archiver 8 usunął fabrykę `create()` na rzecz klas
 * per format. Kod wołał `archiver.create('zip', …)` — typecheck był zielony, bo
 * typy z linii 7 tę funkcję opisywały, a w runtime jej po prostu nie było.
 *
 * Efekt: eksport danych RODO (art. 20 — prawo do przenoszenia) i budowa domyślnej
 * strony hostingowej wywalały się przy pierwszym wywołaniu. Nie „czasem", nie „przy
 * dużych plikach" — zawsze, przy każdym wywołaniu, od momentu podniesienia archivera.
 *
 * Klasa błędu, nie przypadek. Typecheck jest u nas bramką: jeżeli typy opisują inną
 * wersję biblioteki niż zainstalowana, bramka przepuszcza kod, który się nie uruchomi.
 * Ten strażnik pilnuje całej klasy, a nie samego archivera.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');

function znajdzPackageJson(katalog: string, poziom = 0): string[] {
  if (poziom > 2) return [];
  const wyniki: string[] = [];
  for (const wpis of readdirSync(katalog)) {
    if (wpis === 'node_modules' || wpis === '.next' || wpis === 'dist' || wpis.startsWith('.')) {
      continue;
    }
    const sciezka = join(katalog, wpis);
    let stat;
    try {
      stat = statSync(sciezka);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      wyniki.push(...znajdzPackageJson(sciezka, poziom + 1));
    } else if (wpis === 'package.json') {
      wyniki.push(sciezka);
    }
  }
  return wyniki;
}

/** `@types/node-fetch` → `node-fetch`, `@types/babel__core` → `@babel/core`. */
export function pakietDlaTypow(nazwaTypow: string): string {
  const bezPrefiksu = nazwaTypow.slice('@types/'.length);
  return bezPrefiksu.includes('__')
    ? '@' + bezPrefiksu.replace('__', '/')
    : bezPrefiksu;
}

/** Pierwsza liczba w zakresie semver — `^8.0.0` → 8, `>=2.3.0` → 2, `19.2.8` → 19. */
export function major(zakres: string): number | null {
  const m = /(\d+)/.exec(zakres);
  return m ? Number(m[1]) : null;
}

/** Czy w KODZIE (nie w komentarzu) pada wywołanie usuniętej fabryki archivera. */
export function wolaCreate(zrodlo: string): boolean {
  const kod = zrodlo
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  return /archiver\s*\.\s*create\s*\(/.test(kod);
}

export interface Rozjazd {
  plik: string;
  typy: string;
  wersjaTypow: string;
  pakiet: string;
  wersjaPakietu: string;
}

export function znajdzRozjazdy(
  paczki: Array<{ plik: string; zaleznosci: Record<string, string> }>,
): Rozjazd[] {
  const rozjazdy: Rozjazd[] = [];
  for (const { plik, zaleznosci } of paczki) {
    for (const [nazwa, wersja] of Object.entries(zaleznosci)) {
      if (!nazwa.startsWith('@types/')) continue;
      const pakiet = pakietDlaTypow(nazwa);
      const wersjaPakietu = zaleznosci[pakiet];
      // Pakiet bez własnego runtime'u (np. @types/node) — nie ma się z czym rozjechać.
      if (!wersjaPakietu) continue;
      const mt = major(wersja);
      const mp = major(wersjaPakietu);
      if (mt === null || mp === null) continue;
      if (mt !== mp) {
        rozjazdy.push({ plik, typy: nazwa, wersjaTypow: wersja, pakiet, wersjaPakietu });
      }
    }
  }
  return rozjazdy;
}

function wczytajPaczki(): Array<{ plik: string; zaleznosci: Record<string, string> }> {
  return znajdzPackageJson(KORZEN).map((plik) => {
    const d = JSON.parse(readFileSync(plik, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      plik: relative(KORZEN, plik),
      zaleznosci: { ...(d.dependencies ?? {}), ...(d.devDependencies ?? {}) },
    };
  });
}

describe('X-21 — typy zgodne z runtime', () => {
  describe('strażnik ma czego pilnować', () => {
    it('widzi package.json całego monorepo, nie tylko API', () => {
      const paczki = wczytajPaczki();
      expect(paczki.length).toBeGreaterThanOrEqual(8);
      expect(paczki.map((p) => p.plik)).toContain('apps/api/package.json');
    });

    it('znajduje realne pary @types/X + X do porównania', () => {
      const paczki = wczytajPaczki();
      const pary = paczki.flatMap(({ zaleznosci }) =>
        Object.keys(zaleznosci).filter(
          (n) => n.startsWith('@types/') && zaleznosci[pakietDlaTypow(n)],
        ),
      );
      // Gdyby ktoś przepisał wykrywanie i przestało cokolwiek znajdować,
      // test niżej przechodziłby pusto. Tu jest granica tej pustki.
      expect(pary.length).toBeGreaterThanOrEqual(10);
      expect(pary).toContain('@types/archiver');
    });
  });

  it('żadne @types/X nie opisuje innego majora niż zainstalowany X', () => {
    const rozjazdy = znajdzRozjazdy(wczytajPaczki());
    const opis = rozjazdy
      .map(
        (r) =>
          `  ${r.plik}: ${r.typy}=${r.wersjaTypow} opisuje ${r.pakiet}=${r.wersjaPakietu}\n` +
          `     → podnieś ${r.typy} do linii ${major(r.wersjaPakietu)}.x ` +
          `albo cofnij ${r.pakiet} do linii ${major(r.wersjaTypow)}.x`,
      )
      .join('\n');
    expect(
      rozjazdy.length === 0
        ? ''
        : `Typy opisują inną wersję biblioteki niż zainstalowana — typecheck przepuści\n` +
          `kod, którego runtime nie ma (patrz X-21, archiver 7 vs 8):\n${opis}`,
    ).toBe('');
  });

  it('rozpoznaje spreparowany rozjazd', () => {
    const rozjazdy = znajdzRozjazdy([
      {
        plik: 'sztuczny/package.json',
        zaleznosci: { archiver: '^8.0.0', '@types/archiver': '^7.0.0' },
      },
    ]);
    expect(rozjazdy).toHaveLength(1);
    expect(rozjazdy[0].pakiet).toBe('archiver');
  });

  it('nie zgłasza @types bez odpowiadającego runtime (np. @types/node)', () => {
    const rozjazdy = znajdzRozjazdy([
      { plik: 'sztuczny/package.json', zaleznosci: { '@types/node': '^26.0.0' } },
    ]);
    expect(rozjazdy).toEqual([]);
  });

  it('engines.node nie schodzi poniżej 22.12 — poniżej require(esm) nie działa', () => {
    const korzen = JSON.parse(readFileSync(join(KORZEN, 'package.json'), 'utf8')) as {
      engines?: { node?: string };
    };
    const zakres = korzen.engines?.node ?? '';
    const m = /(\d+)\.(\d+)/.exec(zakres);
    expect(
      m === null
        ? `engines.node w korzeniu ("${zakres}") nie podaje wersji minorowej — ` +
          `archiver 8 jest czystym ESM-em i wymaga require(esm) z Node ≥ 22.12`
        : '',
    ).toBe('');
    const [, maj, min] = m as RegExpExecArray;
    expect(Number(maj) * 1000 + Number(min)).toBeGreaterThanOrEqual(22 * 1000 + 12);
  });

  it('mapuje nazwę typów pakietu z zakresem', () => {
    expect(pakietDlaTypow('@types/babel__core')).toBe('@babel/core');
    expect(pakietDlaTypow('@types/archiver')).toBe('archiver');
  });
});

describe('X-21 — archiver: kod woła API, które runtime faktycznie ma', () => {
  /**
   * Introspekcja w osobnym procesie Node'a, nie przez `require` w jeście.
   *
   * Archiver 8 jest czystym ESM-em (`"type": "module"`, wyłącznie `exports`),
   * a API kompiluje się do CommonJS-a — więc `import * as archiver` staje się
   * `require('archiver')`. Node ≥ 22.12 to obsługuje (require(esm) bez flagi),
   * ale transformacja jesta już nie, i wywala się na „Cannot use import
   * statement outside a module". Gdyby ten test biegł przez jesta, sprawdzałby
   * ładowarkę modułów jesta zamiast produkcji.
   *
   * Ten sam pomiar pilnuje przy okazji, czy paczka daje się w ogóle wczytać
   * z CommonJS-a — czyli klasy błędu ERR_REQUIRE_ESM, nie tylko braku create().
   */
  const sonda = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        `const a = require('archiver');
         const z = new a.ZipArchive({ zlib: { level: 6 } });
         const t = new a.TarArchive({ gzip: true });
         process.stdout.write(JSON.stringify({
           klucze: Object.keys(a).sort(),
           create: typeof a.create,
           zip: [z.constructor.name, typeof z.directory, typeof z.finalize],
           tar: [t.constructor.name, typeof t.directory, typeof t.finalize],
         }));`,
      ],
      { cwd: join(__dirname, '..', '..'), encoding: 'utf8' },
    ),
  ) as {
    klucze: string[];
    create: string;
    zip: string[];
    tar: string[];
  };

  it('daje się wczytać z CommonJS-a mimo że jest czystym ESM-em', () => {
    // Gdyby Node zszedł poniżej 22.12, poleciałoby ERR_REQUIRE_ESM już przy
    // execFileSync wyżej. Stąd `engines.node: ">=22.12"` w korzeniu.
    expect(sonda.klucze).toContain('ZipArchive');
    expect(sonda.klucze).toContain('TarArchive');
  });

  it('zainstalowany archiver wystawia klasy per format, nie fabrykę create()', () => {
    // Jeżeli create() kiedyś wróci, strażnik majorów i tak przypilnuje typów,
    // ale wtedy warto świadomie zdecydować, którego API używamy.
    expect(sonda.create).toBe('undefined');
  });

  it('instancje mają metody, których używa kod produkcyjny', () => {
    expect(sonda.zip).toEqual(['ZipArchive', 'function', 'function']);
    expect(sonda.tar).toEqual(['TarArchive', 'function', 'function']);
  });

  it('żadne źródło nie woła archiver.create()', () => {
    const src = join(__dirname, '..');
    const winne: string[] = [];
    const przejdz = (kat: string): void => {
      for (const wpis of readdirSync(kat)) {
        const s = join(kat, wpis);
        if (statSync(s).isDirectory()) {
          przejdz(s);
        } else if (wpis.endsWith('.ts')) {
          // Ten plik opisuje szukaną frazę w treści komunikatu błędu, więc
          // trafiałby sam w siebie. Ta sama pułapka co „jest" w X-17: strażnik
          // widzi własny tekst i melduje awarię, której nie ma. Poprawność
          // samego wykrywania pilnuje test niżej, na spreparowanym wejściu.
          if (s === __filename) continue;
          if (wolaCreate(readFileSync(s, 'utf8'))) winne.push(relative(src, s));
        }
      }
    };
    przejdz(src);
    expect(
      winne.length === 0
        ? ''
        : `Wywołanie usuniętej fabryki archivera — użyj new archiver.ZipArchive(…) ` +
          `albo new archiver.TarArchive(…):\n  ${winne.join('\n  ')}`,
    ).toBe('');
  });

  /**
   * Powierzchnia API, z której korzystają obie ścieżki produkcyjne, przejechana
   * naprawdę: string, JSON, strumień, `pipe`, `finalize`, zdarzenie `close` —
   * oraz `directory`, `data`, `end` dla tara.
   *
   * Uwaga o zakresie: to pilnuje ARCHIVERA, nie naszych serwisów. Test, który
   * buduje eksport RODO z prawdziwych danych i sprawdza zawartość ZIP-a, to
   * osobna pozycja — X-22. Dopóki jej nie ma, tu jest granica: wiemy, że
   * używane metody istnieją i produkują poprawne archiwum, nie wiemy, czy
   * serwis składa je we właściwej kolejności.
   */
  const smoke = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        `const archiver = require('archiver');
         const fs = require('fs'), os = require('os'), path = require('path');
         const { Readable } = require('stream');
         const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'x21-'));
         const plik = path.join(kat, 'proba.zip');
         const out = fs.createWriteStream(plik);
         const a = new archiver.ZipArchive({ zlib: { level: 6 } });
         const ostrzezenia = [];
         a.on('warning', (e) => ostrzezenia.push(String(e.code)));
         a.on('error', (e) => { process.stdout.write(JSON.stringify({ blad: e.message })); process.exit(0); });
         out.on('close', () => {
           const zrodlo = path.join(kat, 'zrodlo');
           fs.mkdirSync(path.join(zrodlo, 'assets'), { recursive: true });
           fs.writeFileSync(path.join(zrodlo, 'index.html'), '<!doctype html>');
           fs.writeFileSync(path.join(zrodlo, 'assets', 'a.svg'), '<svg/>');
           const t = new archiver.TarArchive({ gzip: true });
           const kawalki = [];
           t.on('data', (c) => kawalki.push(c));
           t.on('error', (e) => { process.stdout.write(JSON.stringify({ blad: e.message })); process.exit(0); });
           t.on('end', () => {
             process.stdout.write(JSON.stringify({
               zipBajtow: fs.statSync(plik).size,
               zipSciezka: plik,
               tarBajtow: Buffer.concat(kawalki).length,
               ostrzezenia,
             }));
           });
           t.directory(zrodlo, false);
           void t.finalize();
         });
         a.pipe(out);
         a.append('README treść', { name: 'README.txt' });
         a.append(JSON.stringify({ a: 1 }, null, 2), { name: 'user.json' });
         a.append(Readable.from([Buffer.from('załącznik')]), { name: 'attachments/p.txt' });
         void a.finalize();`,
      ],
      { cwd: join(__dirname, '..', '..'), encoding: 'utf8' },
    ),
  ) as {
    blad?: string;
    zipBajtow?: number;
    zipSciezka?: string;
    tarBajtow?: number;
    ostrzezenia?: string[];
  };

  it('ZIP powstaje ze stringa, JSON-a i strumienia — tak jak w eksporcie RODO', () => {
    expect(smoke.blad ?? '').toBe('');
    expect(smoke.ostrzezenia).toEqual([]);
    expect(smoke.zipBajtow ?? 0).toBeGreaterThan(200);
  });

  it('powstały ZIP jest poprawnym archiwum z oczekiwanymi wpisami', () => {
    // Bez zewnętrznej biblioteki: czytamy centralny katalog ZIP-a wprost.
    const bufor = readFileSync(smoke.zipSciezka as string);
    expect(bufor.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04])); // "PK\x03\x04"
    const tekst = bufor.toString('latin1');
    for (const wpis of ['README.txt', 'user.json', 'attachments/p.txt']) {
      expect(tekst).toContain(wpis);
    }
    // Sygnatura końca centralnego katalogu — archiwum domknięte, nie ucięte.
    expect(tekst).toContain('PK\x05\x06');
  });

  it('tar.gz powstaje z katalogu — tak jak paczka domyślnej strony hostingowej', () => {
    expect(smoke.tarBajtow ?? 0).toBeGreaterThan(100);
  });

  it('wykrywanie rozpoznaje wywołanie i nie myli się na komentarzu', () => {
    expect(wolaCreate("const a = archiver.create('zip', {});")).toBe(true);
    expect(wolaCreate('const a = archiver . create ("tar");')).toBe(true);
    expect(wolaCreate('// kiedyś stało tu archiver.create("zip")')).toBe(false);
    expect(wolaCreate(' * patrz archiver.create() w historii')).toBe(false);
    expect(wolaCreate('const a = new archiver.ZipArchive({});')).toBe(false);
  });
});
