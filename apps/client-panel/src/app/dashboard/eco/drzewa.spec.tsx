/**
 * @jest-environment jsdom
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { drzewaSlownie, liczbaDrzew, procentDrzewa, punktyZaProcent } from './drzewa-format';
import type { EcoDrzewaDto } from './eco-data';

jest.mock('./eco-actions', () => ({ wymienNaDrzewoAction: jest.fn() }));
import { EcoDrzewa } from './eco-drzewa';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * A2-10 / decyzja 12 — stary panel: „wspieramy sadzenie drzew”, „Drzewa łącznie … posadzone z Twoich punktów”
 * (zwykłe dzielenie punktów, bez partnera). Teraz liczniki z API (tylko drzewa z certyfikatem) i certyfikaty.
 */
describe('Program EKO — drzewa w panelu', () => {
  it('formatowanie udziału: obcięte setne, odmiana', () => {
    expect(procentDrzewa(700)).toBe('7,00%');
    expect(procentDrzewa(70)).toBe('0,70%');
    expect(liczbaDrzew(10_799)).toBe('1,07');
    expect(liczbaDrzew(30_000)).toBe('3');
    expect(drzewaSlownie(10_000)).toBe('1 drzewo');
    expect(drzewaSlownie(50_000)).toBe('5 drzew');
    expect(drzewaSlownie(10_700)).toBe('1,07 drzewa');
    expect(punktyZaProcent(7, 150)).toBe(11);
    expect(punktyZaProcent(1, 300)).toBe(3);
  });

  it('pokazuje trzy liczniki, pulę i tylko certyfikaty z adresem jako „posadzone”', () => {
    const d: EcoDrzewaDto = {
      punkty: 250,
      punktyNaDrzewo: 200,
      wkladNa100ZlNetto: 192,
      maksWlasnychNaRaz: 10,
      liczniki: { verris: 12, zWkladuCzesci: 10_700, wlasne: 1 },
      czekaCzesci: 1500,
      pulaCzesci: 4520,
      certyfikaty: [
        { id: 'a', rodzaj: 'WLASNE', liczbaDrzew: 1, status: 'POSADZONE', testowe: false, certificateUrl: 'https://p.example/c.pdf', certificateImageUrl: null, posadzoneAt: '2026-11-02T10:00:00Z', utworzone: '2026-11-01T10:00:00Z', mojeCzesci: 10_000 },
        { id: 'b', rodzaj: 'WLASNE', liczbaDrzew: 1, status: 'W_REALIZACJI', testowe: false, certificateUrl: null, certificateImageUrl: null, posadzoneAt: null, utworzone: '2026-11-03T10:00:00Z', mojeCzesci: 10_000 },
      ],
    };
    const el = document.createElement('div');
    act(() => createRoot(el).render(<EcoDrzewa d={d} />));
    const t = el.textContent ?? '';
    expect(t).toContain('Drzewa Verris');
    expect(t).toContain('1,07');
    expect(t).toContain('45,20%');
    expect(t).toContain('1,92% drzewa');
    expect(t).toContain('Czeka na posadzenie: 15,00% drzewa');
    expect(el.querySelectorAll('a[href="https://p.example/c.pdf"]')).toHaveLength(1);
    expect(t).toContain('Certyfikat pojawi się po potwierdzeniu przez partnera.');
    // Decyzje 16–17 (4.11.2026): wkład tylko od pieniędzy, certyfikaty wyłącznie na Verris, 1% drzewa = ⌈punkty/100⌉.
    expect(t).toContain('Wkład liczymy tylko od tego, co zapłacisz pieniędzmi');
    expect(t).toMatch(/kredyty\s+z kodów \(np\. BETA\), promocji, poleceń i rekompensat/);
    expect(t).toContain('Certyfikaty wystawiamy na Verris — z tekstem „Drzewo posadzone dzięki klientom Verris”');
    expect(t).toContain('1% drzewa — 2 pkt');
  });

  it('w plikach programu EKO nie ma haseł bez pokrycia ani nazwy partnera', () => {
    const katalog = __dirname;
    const tresc = readdirSync(katalog)
      .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.spec.tsx'))
      .map((f) => readFileSync(join(katalog, f), 'utf8'))
      .join('\n')
      .toLowerCase();
    expect(tresc).not.toMatch(/wspieramy sadzenie|posadzone z twoich punktów|eko hosting|ekologiczne działania|posadzimy/);
  });
});
