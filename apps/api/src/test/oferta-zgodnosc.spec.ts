import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

/**
 * Strażnik klasy błędu „oferta obiecuje zasób, którego nie da się dotrzymać
 * jednocześnie dla wszystkich klientów" (Z-14).
 *
 * Verris sprzedaje bazę 50 GB dysku, 8 GB RAM i 2 vCPU. Te trzy liczby nie są
 * tym samym rodzajem obietnicy:
 *
 *  - **dysk** to quota realnie egzekwowana przez system plików. Klient może ją
 *    wypełnić w całości i wtedy te 50 GB są zajęte. To alokacja.
 *  - **RAM i CPU** to w CloudLinux/LVE `MemoryMax` i `SPEED` — czyli SUFITY,
 *    do których proces może dobić, a nie zasoby zarezerwowane. Węzeł ze 128 GB
 *    pamięci obsługuje kilkadziesiąt kont z limitem 8 GB każde, bo w normalnej
 *    pracy żadne z nich nie zbliża się do sufitu.
 *
 * Model unit economics (PB-01, docs/strategy/PB-01_unit_economics_wezla.xlsx)
 * pokazał, że węzeł domyka się finansowo dopiero przy ok. 51 kontach. To znaczy
 * 51 × 8 GB = 408 GB pamięci „w cenie" na maszynie, która ma 128 GB.
 *
 * Zdanie „Baza w cenie: 8 GB RAM" jest więc prawdziwe dla jednego klienta i
 * nieprawdziwe dla wszystkich naraz. Poprawny zapis to „do 8 GB RAM".
 *
 * Ten test nie sprawdza jednego zdania — pilnuje całej klasy. Jeżeli ktoś
 * kiedykolwiek dopisze na stronie „8 GB RAM" bez „do", test zapali się na
 * czerwono, zanim zdanie trafi na produkcję.
 *
 * Test jest statyczny (czyta pliki źródłowe apps/www), więc nie wymaga
 * uruchamiania Next.js ani budowania strony.
 */

const KORZEN = resolve(__dirname, '../../../..');
const WWW_SRC = resolve(KORZEN, 'apps/www/src');

/** Zasoby, które są sufitem burst, a nie rezerwacją. */
const ZASOBY_BURST = [
  { nazwa: 'RAM', wzorzec: /(\d+)\s*GB\s+RAM/gi, bazowa: 8 },
  { nazwa: 'CPU', wzorzec: /(\d+)\s*vCPU/gi, bazowa: 2 },
];

/**
 * Słowa, które przed liczbą zamieniają obietnicę rezerwacji w opis limitu.
 * `→` obsługuje zapis zakresu skalowania („→ 64 GB").
 */
const KWALIFIKATORY = ['do', 'maksymalnie', 'maks.', 'max', '→', 'ponad', 'powyżej'];

function plikiZrodlowe(katalog: string): string[] {
  let out: string[] = [];
  for (const wpis of readdirSync(katalog)) {
    if (wpis === 'node_modules' || wpis === '.next') continue;
    const p = join(katalog, wpis);
    if (statSync(p).isDirectory()) {
      out = out.concat(plikiZrodlowe(p));
    } else if (/\.(ts|tsx|md|mdx)$/.test(wpis)) {
      out.push(p);
    }
  }
  return out;
}

interface Naruszenie {
  plik: string;
  linia: number;
  zasob: string;
  fragment: string;
}

/**
 * Zwraca wystąpienia liczby zasobu burst BEZ poprzedzającego kwalifikatora.
 * Patrzymy na ok. 20 znaków przed dopasowaniem — kwalifikator stoi tuż przed
 * liczbą albo nie ma go wcale.
 */
function znajdzNaruszenia(tresc: string, plik: string): Naruszenie[] {
  const out: Naruszenie[] = [];
  const linie = tresc.split('\n');

  linie.forEach((linia, i) => {
    for (const { nazwa, wzorzec, bazowa } of ZASOBY_BURST) {
      const re = new RegExp(wzorzec.source, wzorzec.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(linia)) !== null) {
        // Interesuje nas wyłącznie wartość BAZOWA pakietu. Wartości maksymalne
        // (64 GB, 24 vCPU) opisują sufit autoskalowania i nie udają rezerwacji.
        if (Number(m[1]) !== bazowa) continue;

        const przed = linia.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
        const zakwalifikowane = KWALIFIKATORY.some((k) => {
          const idx = przed.lastIndexOf(k.toLowerCase());
          if (idx === -1) return false;
          // między kwalifikatorem a liczbą mogą stać tylko spacje/cudzysłowy
          return /^[\s'"`»]*$/.test(przed.slice(idx + k.length));
        });
        if (zakwalifikowane) continue;

        out.push({
          plik: relative(KORZEN, plik),
          linia: i + 1,
          zasob: nazwa,
          fragment: linia.trim().slice(0, 160),
        });
      }
    }
  });

  return out;
}

describe('Z-14 — treść oferty nie obiecuje rezerwacji RAM ani CPU', () => {
  const pliki = plikiZrodlowe(WWW_SRC);

  it('znajduje pliki źródłowe strony (test ma czego pilnować)', () => {
    expect(pliki.length).toBeGreaterThan(10);
  });

  it('nigdzie nie pisze „8 GB RAM" ani „2 vCPU" bez kwalifikatora „do"', () => {
    const naruszenia = pliki.flatMap((p) => znajdzNaruszenia(readFileSync(p, 'utf-8'), p));

    if (naruszenia.length > 0) {
      const opis = naruszenia
        .map((n) => `  ${n.plik}:${n.linia} [${n.zasob}]\n    ${n.fragment}`)
        .join('\n');
      throw new Error(
        `Treść oferty obiecuje bazowy ${naruszenia[0].zasob} jako zasób przypisany na stałe.\n\n` +
          `W CloudLinux/LVE RAM i CPU są sufitami burst, nie rezerwacjami. Węzeł domyka się\n` +
          `finansowo dopiero przy ok. 51 kontach (PB-01), czyli 408 GB RAM „w cenie" na maszynie\n` +
          `ze 128 GB. Napisz „do 8 GB RAM" i „do 2 vCPU".\n\n` +
          `Dysk (50 GB) zostaje bez kwalifikatora — quota dyskowa jest realnie egzekwowana.\n\n` +
          `Znalezione wystąpienia:\n${opis}`,
      );
    }

    expect(naruszenia).toEqual([]);
  });

  it('rozpoznaje sformułowanie obiecujące (kontrola samego strażnika)', () => {
    const zle = 'Baza w cenie: 50 GB NVMe, 8 GB RAM, 2 vCPU (CloudLinux).';
    const wynik = znajdzNaruszenia(zle, join(WWW_SRC, 'atrapa.tsx'));
    expect(wynik.map((n) => n.zasob).sort()).toEqual(['CPU', 'RAM']);
  });

  it('przepuszcza sformułowanie poprawne', () => {
    const dobre = 'Baza pakietu: 50 GB NVMe oraz do 8 GB RAM i do 2 vCPU (limity CloudLinux/LVE).';
    expect(znajdzNaruszenia(dobre, join(WWW_SRC, 'atrapa.tsx'))).toEqual([]);
  });

  it('nie czepia się wartości maksymalnych autoskalowania', () => {
    const zakres = 'skalowanie do 1000 GB, 64 GB RAM, 24 vCPU';
    expect(znajdzNaruszenia(zakres, join(WWW_SRC, 'atrapa.tsx'))).toEqual([]);
  });

  it('nie czepia się dysku — 50 GB to realna quota, nie sufit', () => {
    const dysk = 'Baza w cenie: 50 GB NVMe.';
    expect(znajdzNaruszenia(dysk, join(WWW_SRC, 'atrapa.tsx'))).toEqual([]);
  });
});
