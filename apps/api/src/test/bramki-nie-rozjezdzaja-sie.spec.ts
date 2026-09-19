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
 *
 * ROZSZERZENIE 2026-09-19 (X-50) — I DLACZEGO TEN STRAŻNIK SAM PRZEPUŚCIŁ ROZJAZD
 * ─────────────────────────────────────────────────────────────────────────────
 * Ten plik istniał od X-42 i był zielony, kiedy `deploy.yml` nie wołał bramki
 * podatności. Nie dlatego, że sprawdzał złą rzecz — dlatego, że JEGO DEFINICJA
 * „polecenia bramkowego" była listą trzech komend, które akurat istniały w dniu
 * jego powstania: `pnpm lint`, `pnpm typecheck`, `pnpm test`. Bramka podatności
 * uruchamia się jako `node ops/ci/audyt-bramka.cjs` i dla tego wyrażenia
 * regularnego była niewidzialna.
 *
 * Skutek: trzy podatności HIGH w multerze (SEC-07, zdalny DoS bez
 * uwierzytelnienia) mogły pojechać na produkcję przez zielone wdrożenie,
 * przy zielonym strażniku pilnującym rozjazdu bramek.
 *
 * To NOWA ODMIANA rodziny „test, który niczego nie dowodzi" — po fałszywej
 * asercji (Z-01, H-20) i fałszywym środowisku (X-34) mamy ZA WĄSKĄ DEFINICJĘ
 * SPRAWDZANEJ KLASY. Asercja była dobra, środowisko prawdziwe, tylko zbiór
 * rzeczy, po których iterowała, nie obejmował tej, która się zepsuła.
 *
 * PYTANIE DO KAŻDEGO PRZYSZŁEGO STRAŻNIKA KLASY: czy mój wzorzec obejmuje
 * kontrole, które dopiero powstaną, czy tylko te, które widziałem przy pisaniu?
 * Jeżeli to drugie — każda nowa kontrola rodzi się poza jego zasięgiem i nikt
 * nie dostanie o tym sygnału.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');

/**
 * Polecenia bramkowe. Dwa kształty, bo bramki mają dwa kształty:
 * zadania Turbo dla całego workspace'u i samodzielne skrypty w `ops/ci`.
 *
 * Skrypty z `ops/ci` są tu WZORCEM KATALOGU, nie listą nazw — nowa bramka
 * dołożona do tego katalogu trafia pod strażnika sama, bez edycji tego pliku.
 * Powód w nagłówku: poprzednia wersja wymieniała trzy nazwy i przez to nie
 * zauważyła, że bramka podatności nie dojechała do `deploy.yml`.
 */
const BRAMKOWE = /^pnpm\s+(?:run\s+)?(lint|typecheck|test)$/;
const BRAMKOWY_SKRYPT = /^node\s+(ops\/ci\/[\w.-]+\.(?:cjs|mjs|js))$/;

function poleceniaBramkowe(plik: string): Set<string> {
  const tresc = readFileSync(join(KORZEN, '.github', 'workflows', plik), 'utf8');
  const wynik = new Set<string>();
  for (const linia of tresc.split('\n')) {
    if (/^\s*#/.test(linia)) continue; // proza cytuje polecenia — patrz X-41
    const m = linia.match(/^\s*run:\s*(.+?)\s*$/);
    if (!m) continue;
    const dopasowanie = m[1].match(BRAMKOWE);
    if (dopasowanie) wynik.add(dopasowanie[1]);
    const skrypt = m[1].match(BRAMKOWY_SKRYPT);
    if (skrypt) wynik.add(skrypt[1]);
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

  it('bramka podatności jest w obu — to ona nas ugryzła drugi raz (X-50)', () => {
    // Wymieniona z nazwy, tak jak lint wyżej, i z tego samego powodu: to nie
    // hipoteza, tylko rzecz, która się wydarzyła. Do 2026-09-19 `deploy.yml`
    // nie wołał jej wcale, a `Security scans` nie było checkiem wymaganym.
    expect(ci.has('ops/ci/audyt-bramka.cjs')).toBe(true);
    expect(wdrozenie.has('ops/ci/audyt-bramka.cjs')).toBe(true);
  });

  it('strażnik faktycznie łapie rozjazd', () => {
    const zbiorCi = new Set(['lint', 'typecheck', 'test']);
    const zbiorWdrozenia = new Set(['typecheck', 'test']);
    const brakujace = [...zbiorCi].filter((c) => !zbiorWdrozenia.has(c));
    expect(brakujace).toEqual(['lint']);
  });

  it('wzorzec obejmuje skrypty bramkowe, nie tylko trzy znane nazwy', () => {
    // Asercja o samym wzorcu, nie o dzisiejszej zawartości workflowów. Bez niej
    // ktoś mógłby zawęzić BRAMKOWY_SKRYPT z powrotem do jednej nazwy i wrócić
    // dokładnie do usterki, którą X-50 opisuje.
    expect('node ops/ci/audyt-bramka.cjs'.match(BRAMKOWY_SKRYPT)?.[1]).toBe('ops/ci/audyt-bramka.cjs');
    expect('node ops/ci/przyszla-bramka.mjs'.match(BRAMKOWY_SKRYPT)?.[1]).toBe(
      'ops/ci/przyszla-bramka.mjs',
    );
    expect('node scripts/cokolwiek.js'.match(BRAMKOWY_SKRYPT)).toBeNull();
  });
});
