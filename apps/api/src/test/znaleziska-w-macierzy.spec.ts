import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * X-49 — znaleziska trafiają do macierzy (rejestru), nie tylko do widoków.
 *
 * Tablice powstają z audyt/dane/*.csv (generate.py). Ten strażnik pilnuje, żeby
 * nic nie żyło obok rejestru: pozycja opisana w docs/zadania albo w archiwum
 * zadań, a nieobecna w macierzy, nie trafia do planu ani na tablice — tak
 * 2026-08-26 „zniknęły” PROD-01 i PROD-02.
 */
const KORZEN = resolve(__dirname, '../../../..');

function wiersze(plik: string): string[] {
  return readFileSync(resolve(KORZEN, plik), 'utf-8')
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(',')[0].replace(/^"|"$/g, ''))
    .filter((id) => /^[A-Z]{1,5}-\d{2,3}$/.test(id));
}

const REJESTR = new Set([...wiersze('audyt/dane/macierz.csv'), ...wiersze('audyt/dane/zadania_pb.csv')]);
const EPIKI = new Set(wiersze('audyt/dane/epiki.csv'));
const PREFIKSY = new Set([...REJESTR].map((id) => id.split('-')[0]));
/** Nazwy, które wyglądają jak ID, a nimi nie są (i dlaczego). */
const NIE_ID = new Set([
  'DNS-01', // wyzwanie ACME przy certyfikacie wildcard
  'PANEL-14', // historyczna etykieta w komentarzu kodu quota-alert.scheduler.ts, dziś K-08
]);

describe('X-49 — rejestr jest jedynym źródłem pozycji', () => {
  it('każde zadanie z docs/zadania i archiwum jest w macierzy albo w zadaniach PB', () => {
    const brak: string[] = [];
    for (const kat of ['docs/zadania', 'docs/archiwum/zadania']) {
      const pelna = resolve(KORZEN, kat);
      if (!existsSync(pelna)) continue;
      for (const plik of readdirSync(pelna)) {
        for (const id of plik.match(/^([A-Z]{1,5}-\d{2,3})(?:-([A-Z]{1,5}-\d{2,3}))?/)?.slice(1) ?? []) {
          if (id && !REJESTR.has(id)) brak.push(`${kat}/${plik}: ${id}`);
        }
      }
    }
    expect(brak).toEqual([]);
  });

  it('każde ID widoczne na tablicach istnieje w rejestrze', () => {
    const brak = new Set<string>();
    for (const plik of ['audyt-parytetu-2026-08/VERRIS_LUKI_DASHBOARD.html', 'plan-startowy-2026-08/VERRIS_PLAN_DASHBOARD.html']) {
      const tresc = readFileSync(resolve(KORZEN, plik), 'utf-8');
      for (const [id] of tresc.matchAll(/\b[A-Z]{1,5}-\d{2,3}\b/g)) {
        if (PREFIKSY.has(id.split('-')[0]) && !REJESTR.has(id) && !EPIKI.has(id) && !NIE_ID.has(id)) brak.add(`${plik}: ${id}`);
      }
    }
    expect([...brak]).toEqual([]);
  });
});
