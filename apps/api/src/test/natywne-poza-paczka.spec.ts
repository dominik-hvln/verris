import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';

/**
 * Zależność API ze skryptem instalacyjnym (dodatek natywny, node-gyp) musi być poza paczką bundlera (Rspack).
 * 2026-09-23: ssh2 (I-18) przeszedł lint, typecheck i wszystkie testy, a build obrazu padł na
 * „Can't resolve '../build/Release/cpufeatures.node'” — testy nie budują paczki, więc tego nie widziały.
 */
const API = resolve(import.meta.dirname, '../..');
type Zewnetrzny = (a: { request: string }, cb: (e?: unknown, r?: string) => void) => void;
// Plik konfiguracji leży poza src (rootDir), więc ładujemy go dynamicznie, nie importem statycznym.
const { default: konfiguracjaRspack, NATYWNE } = (await import(pathToFileURL(join(API, 'rspack.config.js')).href)) as {
  default: (o: object) => { externals: Zewnetrzny[] };
  NATYWNE: string[];
};

function pakiet(nazwa: string): { scripts?: Record<string, string>; gypfile?: boolean } | null {
  for (const baza of [join(API, 'node_modules'), join(API, '../../node_modules')]) {
    const p = join(baza, nazwa, 'package.json');
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  }
  return null;
}

describe('zależności natywne poza paczką bundlera (Rspack)', () => {
  const deps = Object.keys(JSON.parse(readFileSync(join(API, 'package.json'), 'utf8')).dependencies ?? {});

  it('każda zależność ze skryptem instalacyjnym jest w externals', () => {
    const natywne = deps.filter((d) => {
      const pk = pakiet(d);
      return pk && (pk.gypfile || ['install', 'preinstall', 'postinstall'].some((k) => pk.scripts?.[k]));
    });
    expect(natywne).toEqual(expect.arrayContaining(['bcrypt', 'ssh2'])); // test sam się nie oszukuje
    expect(natywne.filter((d) => !NATYWNE.includes(d))).toEqual([]);
  });

  it('konfiguracja rzeczywiście oddaje je jako zewnętrzne moduły (ESM: import z node_modules)', () => {
    const cfg = konfiguracjaRspack({});
    for (const nazwa of NATYWNE) {
      let wynik: string | undefined;
      cfg.externals[0]({ request: nazwa }, (_e, r) => { wynik = r; });
      expect(wynik).toBe(`module ${nazwa}`);
    }
  });
});
