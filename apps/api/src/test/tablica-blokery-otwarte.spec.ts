import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 19.10 — tablica luk liczyła „blokery startu” po samej krytyczności, także zamknięte z dowodem (P-15, Z-18:
 * werdykt PARYTET) — kafelek pokazywał 2 blokery, choć tablica planu miała 0 otwartych. Krytyczność zostaje
 * w macierzy jako historia; blokuje tylko pozycja bez werdyktu PARYTET/PRZEWAGA (jak `blokeryOtwarte` w generate.py).
 */
const KORZEN = resolve(import.meta.dirname, '../../../..');
const szablon = readFileSync(resolve(KORZEN, 'audyt/szablony/dashboard_luki.html'), 'utf-8');
const generator = readFileSync(resolve(KORZEN, 'audyt/generate.py'), 'utf-8');

type Wiersz = { kr: string; w: string };

/** Funkcje z szablonu tablicy (wykonane, nie tylko przeczytane). */
function funkcjeZSzablonu(): { otwartyBloker: (r: Wiersz) => boolean } {
  const zrodlo = (nazwa: string) => {
    const m = szablon.match(new RegExp(`function ${nazwa}\\(r\\)\\{[^\\n]*\\}`));
    if (!m) throw new Error(`brak funkcji ${nazwa} w dashboard_luki.html`);
    return m[0];
  };
  return new Function(`${zrodlo('zamknietaPozycja')}\n${zrodlo('otwartyBloker')}\nreturn { otwartyBloker };`)();
}

describe('Tablica luk: blokery startu liczone jako otwarte', () => {
  it('bloker z werdyktem PARYTET/PRZEWAGA nie jest otwarty; bez nich — jest', () => {
    const { otwartyBloker } = funkcjeZSzablonu();
    expect(otwartyBloker({ kr: 'BLOKER STARTU', w: 'PARYTET' })).toBe(false);
    expect(otwartyBloker({ kr: 'BLOKER STARTU', w: 'PRZEWAGA' })).toBe(false);
    expect(otwartyBloker({ kr: 'BLOKER STARTU', w: 'LUKA' })).toBe(true);
    expect(otwartyBloker({ kr: 'BLOKER STARTU', w: 'CZĘŚCIOWY' })).toBe(true);
    expect(otwartyBloker({ kr: 'WYSOKA', w: 'LUKA' })).toBe(false);
  });

  it('kafelek, wykres kategorii i komórka tabeli używają otwartyBloker, nie samej krytyczności', () => {
    expect(szablon).toMatch(/const nBlk = rows\.filter\(otwartyBloker\)\.length;/);
    expect(szablon).toMatch(/const blk = s\.filter\(otwartyBloker\)\.length;/);
    expect(szablon).not.toMatch(/filter\(r=>r\.kr==="BLOKER STARTU"\)\.length/);
  });

  it('arkusz XLSX i status w generate.py liczą tylko blokery bez werdyktu PARYTET/PRZEWAGA', () => {
    expect(generator).toMatch(/"BLOKER STARTU",'\s*\n\s*f'Macierz!\$K\$2:\$K\$\{N\},"<>PARYTET",Macierz!\$K\$2:\$K\$\{N\},"<>PRZEWAGA"\)'/);
    expect(generator).toMatch(/r\[11\] == "BLOKER STARTU" and r\[10\] not in ZROBIONE_WERDYKTY\]/);
  });
});
