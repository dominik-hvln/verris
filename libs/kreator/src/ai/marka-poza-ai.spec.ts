import { walidujStrone, type Strona } from '../model.ts';
import { PRZYKLAD_MIGAWKI_MARKI as MIG } from '../marka-strony/przyklad.ts';
import { zastosujMarke } from '../marka-strony/zastosuj.ts';
import { PRZYKLAD_SALON } from '../przyklady/salon.ts';
import { PRZYKLAD_SALON_EN } from '../przyklady/salon-en.ts';
import { kompaktujStrone, POLA_POZA_AI } from './kompakt.ts';
import { blokMasterPromptu, budujZapytanieZmiany } from './master-prompt.ts';
import { odczytajWynikGeneracji, odczytajWynikZmiany } from './odczyt.ts';
import { opisModeluStrony } from './opis-schematu.ts';
import { budujZapytanieTlumaczenia, odczytajWynikTlumaczenia } from './tlumaczenie.ts';

/**
 * Paczka 130 – migawka marki (SVG) jest poza AI: model jej nie zna (opis schematu), nie dostaje jej w stronie i nie może
 * jej wstrzyknąć w odpowiedzi; zmiana i tłumaczenie zostawiają migawkę dokładnie taką, jak przed wywołaniem.
 */
function model(w: unknown): Strona {
  const r = walidujStrone(w);
  if (!r.ok) throw new Error(r.bledy.join('\n'));
  return r.strona;
}
const zMarka = () => zastosujMarke(model(PRZYKLAD_SALON), MIG).strona;
/** Poprawne SVG „od AI” (przechodzi schemat) – nie może zastąpić migawki serwera. */
const SVG_AI = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><text>AI</text></svg>';
const markaOdAi = { markaId: 'ai', wersja: 99, nazwa: 'AI', logoPoziome: SVG_AI, favicon: SVG_AI, kolory: { glowny: '#000000', akcent: '#000000' } };

describe('Marka poza AI', () => {
  it('opis modelu i master prompt nie znają pola marka', () => {
    expect(POLA_POZA_AI).toEqual(['marka']);
    expect(opisModeluStrony()).not.toMatch(/marka|logoPoziome|favicon/);
    expect(blokMasterPromptu()).not.toMatch(/logoPoziome|marka\?:/);
  });

  it('strona wysyłana do AI (pełna i skrót) nie zawiera migawki ani SVG', () => {
    const s = zMarka();
    expect(kompaktujStrone(s)).not.toHaveProperty('marka');
    const zap = budujZapytanieZmiany(s, 'Zmień kolory', null, 'pro');
    const caly = JSON.stringify(zap);
    expect(caly).not.toContain('logoPoziome');
    expect(caly).not.toContain('<svg');
    expect(JSON.stringify(budujZapytanieZmiany(s, 'x', 'start', 'pro'))).not.toContain('logoPoziome');
    expect(JSON.stringify(budujZapytanieTlumaczenia(s, 'en', [''], 'pro'))).not.toContain('logoPoziome');
  });

  it('generacja: marka w odpowiedzi AI znika (nie trafia do modelu)', () => {
    const odp = JSON.stringify({ ...model(PRZYKLAD_SALON), marka: markaOdAi });
    const w = odczytajWynikGeneracji(odp, 'pro');
    if (!w.ok) throw new Error(w.bledy.join('\n'));
    expect(w.strona.marka).toBeUndefined();
  });

  it('zmiana całej strony (pełny model): migawka z bazy zostaje, marka od AI ignorowana', () => {
    const s = zMarka();
    const odp = JSON.stringify({ ...kompaktujStrone(s) as object, marka: markaOdAi });
    const w = odczytajWynikZmiany(s, odp, null, 'pro');
    if (!w.ok) throw new Error(w.bledy.join('\n'));
    expect(w.strona.marka).toEqual(s.marka);
    // strona bez marki – AI nie dołoży jej
    const bez = model(PRZYKLAD_SALON);
    const w2 = odczytajWynikZmiany(bez, JSON.stringify({ ...kompaktujStrone(bez) as object, marka: markaOdAi }), null, 'pro');
    if (!w2.ok) throw new Error(w2.bledy.join('\n'));
    expect(w2.strona.marka).toBeUndefined();
  });

  it('zmiana sekcji i operacje: migawka zostaje bez zmian', () => {
    const s = zMarka();
    const hero = s.strony[0]!.sekcje[0]!;
    const w = odczytajWynikZmiany(s, JSON.stringify({ ...hero, dane: { ...hero.dane, nadtytul: 'Nowy nadtytuł' } }), hero.id, 'pro');
    if (!w.ok) throw new Error(w.bledy.join('\n'));
    expect(w.strona.marka).toEqual(s.marka);
    const op = odczytajWynikZmiany(s, JSON.stringify({ operacje: [{ op: 'seo', seo: { tytul: 'Salon – nowy tytuł' } }] }), null, 'pro');
    if (!op.ok) throw new Error(op.bledy.join('\n'));
    expect(op.strona.marka).toEqual(s.marka);
  });

  it('tłumaczenie zostawia migawkę marki', () => {
    const s = zMarka();
    const en = structuredClone(PRZYKLAD_SALON_EN.strony.find((p) => p.slug === 'en')!) as unknown as Record<string, unknown>;
    const odp = JSON.stringify({ podstrony: [{ klucz: '', sciezka: '', tytul: en.tytul, seo: en.seo, sekcje: en.sekcje }] });
    const w = odczytajWynikTlumaczenia(s, odp, 'en', [''], { data: '2026-11-19' });
    if (!w.ok) throw new Error(w.bledy.join('\n'));
    expect(w.strona.marka).toEqual(s.marka);
  });
});
