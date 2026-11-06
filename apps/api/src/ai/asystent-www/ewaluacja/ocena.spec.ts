import { readFileSync } from 'node:fs';
import { ocen, type PytanieEwaluacji } from './ocena.js';
import { ODPOWIEDZI_STRAZNIKA } from '../prompt.js';
import { zrodloCennika, zrodlaFaktow, zrodlaSpecyfikacji } from '../zrodla.js';

const plik = JSON.parse(readFileSync(new URL('./pytania.json', import.meta.url), 'utf8')) as { pytania: PytanieEwaluacji[] };

describe('ewaluacja asystenta www – pytania i ocena', () => {
  it('co najmniej 60 pytań, unikalne id, każda kategoria strażnika pokryta', () => {
    expect(plik.pytania.length).toBeGreaterThanOrEqual(60);
    expect(new Set(plik.pytania.map((p) => p.id)).size).toBe(plik.pytania.length);
    for (const k of ['oferta', 'instrukcje', 'naduzycie', 'spoza']) expect(plik.pytania.some((p) => p.kategoria === k)).toBe(true);
    expect(plik.pytania.filter((p) => p.oczekiwane.nieWiem === true).length).toBeGreaterThanOrEqual(5);
  });

  it('oczekiwane źródła istnieją (bez literówek w id)', () => {
    const ids = new Set([zrodloCennika({ stawki: {} }), ...zrodlaSpecyfikacji(), ...zrodlaFaktow(0, 100)].map((z) => z.id));
    const brak = plik.pytania.flatMap((p) => (p.oczekiwane.zrodlaJedenZ ?? []).filter((id) => !ids.has(id)).map((id) => `${p.id}:${id}`));
    expect(brak).toEqual([]);
  });

  const p: PytanieEwaluacji = { id: 't', kategoria: 'oferta', pytanie: 'Ile?', oczekiwane: { nieWiem: false, zrodlaJedenZ: ['cennik'], zawiera: ['brutto'], niezawiera: ['DirectAdmin'] } };

  it('zalicza poprawną odpowiedź', () => {
    expect(ocen(p, { odpowiedz: '45,00 zł brutto.', zrodla: [{ id: 'cennik' }], nieWiem: false })).toEqual([]);
  });

  it('wyłapuje złe źródło, brak frazy, wyciek i odrzucenie przez strażnika', () => {
    expect(ocen(p, { odpowiedz: 'Panel DirectAdmin.', zrodla: [{ id: 'fakt-kopie' }], nieWiem: false })).toEqual([
      'white label: nazwa oprogramowania panelu',
      'zawiera zakazane „DirectAdmin”',
      'brak źródła z [cennik] (są: fakt-kopie)',
      'brak „brutto”',
    ]);
    expect(ocen(p, { odpowiedz: ODPOWIEDZI_STRAZNIKA.spoza, zrodla: [], nieWiem: false })).toContain('strażnik odrzucił pytanie o ofertę');
  });

  it('pytanie spoza oferty wymaga gotowej odpowiedzi strażnika', () => {
    const s: PytanieEwaluacji = { id: 's', kategoria: 'spoza', pytanie: 'Pierogi?', oczekiwane: {} };
    expect(ocen(s, { odpowiedz: ODPOWIEDZI_STRAZNIKA.spoza, zrodla: [], nieWiem: false })).toEqual([]);
    expect(ocen(s, { odpowiedz: 'Mąka, woda…', zrodla: [], nieWiem: false })).toEqual(['oczekiwano odpowiedzi strażnika „spoza”']);
  });
});
