import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Bramka wdrożenia nie jest słabsza od bramki CI.
 *
 * POWÓD ISTNIENIA
 * ───────────────
 * X-42, 2026-08-25. Przez pół dnia `deploy.yml` szedł zielono, a `ci.yml` był
 * czerwony — i nikt tego nie zauważył, bo patrzyliśmy na wdrożenia.
 *
 * Różnica była jedna: `ci.yml` odpalał `pnpm lint`, `deploy.yml` nie. Kod
 * z błędem konfiguracji ESLinta trafił więc na produkcję trzy razy, za każdym
 * razem przez zieloną bramkę, która po prostu nie zadawała tego pytania.
 *
 * To nie jest defekt lintera ani wdrożenia. To defekt ZAŁOŻENIA: „zielone
 * wdrożenie znaczy, że CI jest zielone". Dwie bramki sprawdzające różne rzeczy
 * mogą się dowolnie rozjeżdżać i nikt nie dostanie o tym sygnału.
 *
 * ZASADA
 * ──────
 * Bramka, która wpuszcza kod NA PRODUKCJĘ, musi zadawać co najmniej te pytania,
 * co bramka, która wpuszcza kod DO GAŁĘZI. Odwrotnie wolno — wdrożenie może
 * sprawdzać więcej.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');

/** Polecenia bramkowe: uruchamiane przez Turbo dla całego workspace'u. */
const BRAMKOWE = /^pnpm\s+(?:run\s+)?(lint|typecheck|test)$/;

function poleceniaBramkowe(plik: string): Set<string> {
  const tresc = readFileSync(join(KORZEN, '.github', 'workflows', plik), 'utf8');
  const wynik = new Set<string>();
  for (const linia of tresc.split('\n')) {
    if (/^\s*#/.test(linia)) continue; // proza cytuje polecenia — patrz X-41
    const m = linia.match(/^\s*run:\s*(.+?)\s*$/);
    if (!m) continue;
    const dopasowanie = m[1].match(BRAMKOWE);
    if (dopasowanie) wynik.add(dopasowanie[1]);
  }
  return wynik;
}

describe('bramki nie rozjeżdżają się', () => {
  const ci = poleceniaBramkowe('ci.yml');
  const wdrozenie = poleceniaBramkowe('deploy.yml');

  it('obie bramki w ogóle uruchamiają kontrole', () => {
    expect([...ci].sort().join(',')).not.toBe('');
    expect([...wdrozenie].sort().join(',')).not.toBe('');
  });

  it('wdrożenie sprawdza wszystko, co sprawdza CI', () => {
    const brakujace = [...ci].filter((cmd) => !wdrozenie.has(cmd)).sort();
    expect({
      brakujace,
      podpowiedz:
        brakujace.length === 0
          ? ''
          : `deploy.yml nie odpala: ${brakujace.join(', ')} — kod trafi na produkcję ` +
            'przez bramkę, która nie zadaje tego pytania',
    }).toEqual({ brakujace: [], podpowiedz: '' });
  });

  it('lint jest w obu — to on nas ugryzł', () => {
    // Wymieniony z nazwy, bo to konkretna historia, nie hipoteza:
    // trzy wdrożenia przeszły zielono przy czerwonym ci.yml.
    expect(ci.has('lint')).toBe(true);
    expect(wdrozenie.has('lint')).toBe(true);
  });

  it('strażnik faktycznie łapie rozjazd', () => {
    const zbiorCi = new Set(['lint', 'typecheck', 'test']);
    const zbiorWdrozenia = new Set(['typecheck', 'test']);
    const brakujace = [...zbiorCi].filter((c) => !zbiorWdrozenia.has(c));
    expect(brakujace).toEqual(['lint']);
  });
});
