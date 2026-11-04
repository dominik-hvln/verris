import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * P4-15 (decyzja 27, 4.11.2026) — publiczna baza wiedzy pokazywała kategorię „Migracja do Verris — Przeniesienie konta
 * z cPanel, Plesk i DirectAdmin”, a podpowiedzi AI dla klientów mówiły o „CloudLinux PHP Selector” i hoście
 * „node-pl-01.verris.pl”. White label: klient nie widzi nazw oprogramowania zaplecza, portu panelu, nazw węzłów
 * ani dostawcy. Seed CMS (pomoc.verris.pl) — cały; seed AI — artykuły dla klientów (ALL, CLIENT); STAFF może.
 * Na starym kodzie oba testy czerwone (DirectAdmin w kategorii i artykule migracji, CloudLinux i node-pl-01 w AI).
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const ZAPLECZE =
  /Direct\s*Admin|\bDA\b|Custom\s*Build|Cloud\s*Linux|CageFS|PHP Selector|selectorctl|(?:port\s*|:)2222\b|Lite\s*Speed(?!\s*Cache)|\blsws\b|Hetzner|Falkenstein|Nuremberg|Norymberg|Helsink|\bnode-[a-z]{2}-\d+|\bwęz[eł]|\/opt\/alt\b/;

const bezKomentarzy = (t: string) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));

describe('P4-15 — baza wiedzy dla klientów bez nazw zaplecza', () => {
  it('seed CMS pomocy (kategorie, artykuły, SEO, FAQ) — ani jednego słowa zaplecza', () => {
    const plik = 'apps/api/src/cli/seed-kb-cms.ts';
    const trafienia = bezKomentarzy(readFileSync(join(KORZEN, plik), 'utf8'))
      .map((l, i) => [l, ZAPLECZE.exec(l)?.[0], i] as const)
      .filter(([, slowo]) => slowo)
      .map(([l, slowo]) => `${slowo}: ${l.trim().slice(0, 90)}`);
    expect(trafienia).toEqual([]);
  });

  it('kategoria migracji ma nazwę i opis bez nazw paneli zaplecza', () => {
    const cms = readFileSync(join(KORZEN, 'apps/api/src/cli/seed-kb-cms.ts'), 'utf8');
    const kat = /\{ slug: 'migracja', name: '([^']*)', description: '([^']*)'/.exec(cms);
    expect(kat).not.toBeNull();
    expect(`${kat![1]} ${kat![2]}`).not.toMatch(ZAPLECZE);
  });

  it('seed podpowiedzi AI — artykuły dla klientów (ALL, CLIENT) bez słów zaplecza; artykuły STAFF mogą je mieć', () => {
    const zrodlo = readFileSync(join(KORZEN, 'apps/api/src/cli/seed-knowledge-base.ts'), 'utf8');
    const artykuly = [...zrodlo.matchAll(/title: '([^']*)',\s*audience: AiKnowledgeAudience\.(\w+),\s*content: `([^`]*)`/g)];
    expect(artykuly.length).toBeGreaterThan(20);
    const trafienia = artykuly
      .filter(([, , odbiorca]) => odbiorca !== 'STAFF')
      .flatMap(([, tytul, , tresc]) => {
        const m = ZAPLECZE.exec(`${tytul}\n${tresc}`);
        return m ? [`${tytul}: ${m[0]}`] : [];
      });
    expect(trafienia).toEqual([]);
    // Strażnik nie jest pusty: artykuł STAFF o dostępie do węzłów nadal nazywa panel zaplecza.
    expect(artykuly.some(([, , o, t]) => o === 'STAFF' && ZAPLECZE.test(t))).toBe(true);
  });

  it('decyzja 24 — przykłady crona w obu seedach używają krótkich nazw /usr/local/bin/phpXY', () => {
    for (const p of ['apps/api/src/cli/seed-kb-cms.ts', 'apps/api/src/cli/seed-knowledge-base.ts']) {
      expect(readFileSync(join(KORZEN, p), 'utf8')).toMatch(/\/usr\/local\/bin\/php8\d -q \$HOME\/domains\//);
    }
  });
});
