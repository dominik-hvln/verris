import { walidujStrone, type Strona } from './model.ts';
import { dopasujDoPlanu, PLANY_KREATORA, CENA_KREATORA_PRO } from './plany.ts';
import { PRZYKLAD_SALON } from './przyklady/salon.ts';

function salon(): Strona {
  const w = walidujStrone(PRZYKLAD_SALON);
  if (!w.ok) throw new Error(w.bledy.join('\n'));
  return w.strona;
}

describe('model strony', () => {
  it('przykład z makiety przechodzi walidację i dostaje wartości domyślne', () => {
    const s = salon();
    expect(s.jezyk).toBe('pl');
    expect(s.strony[0].sekcje[0].tlo).toBe('domyslne');
  });

  it('odrzuca link javascript:, brak strony głównej i wyróżnienie spoza nagłówka', () => {
    const zly = structuredClone(PRZYKLAD_SALON) as unknown as { strony: { slug: string; sekcje: { dane: Record<string, unknown> }[] }[] };
    (zly.strony[0].sekcje[0].dane.przyciski as { cel: string }[])[0].cel = 'javascript:alert(1)';
    expect(walidujStrone(zly).ok).toBe(false);

    const bezGlownej = structuredClone(PRZYKLAD_SALON);
    bezGlownej.strony[0].slug = 'start';
    const w1 = walidujStrone(bezGlownej);
    expect(w1.ok).toBe(false);
    if (!w1.ok) expect(w1.bledy.join()).toContain('brak strony głównej');

    const zleWyr = structuredClone(PRZYKLAD_SALON) as unknown as typeof zly;
    zleWyr.strony[0].sekcje[0].dane.wyroznienie = 'czegoś innego';
    const w2 = walidujStrone(zleWyr);
    expect(w2.ok).toBe(false);
  });
});

describe('dopasujDoPlanu', () => {
  it('bez Pro: wariant Pro dostaje darmowy odpowiednik, efekty Pro i wyraziste animacje znikają, znak minimalny wraca do jasnego', () => {
    const { strona, zmiany } = dopasujDoPlanu(salon(), 'hosting');
    expect(strona.strony[0].sekcje.find((s) => s.id === 'galeria')?.wariant).toBe('galeria-mozaika');
    expect(strona.motyw.efekty).toEqual(['przyklejony-naglowek', 'pojawianie', 'pasek-cta-mobile']);
    expect(strona.motyw.animacje).toBe('subtelne');
    expect(strona.stopka.znakKreatora).toBe('jasny');
    expect(zmiany.length).toBeGreaterThanOrEqual(3);
  });

  it('Pro: strona bez zmian i bez mutacji wejścia', () => {
    const s = salon();
    const { strona, zmiany } = dopasujDoPlanu(s, 'pro');
    expect(zmiany).toEqual([]);
    expect(strona).toEqual(s);
    expect(strona).not.toBe(s);
  });

  it('próba: sekcje sklepu i bloga znikają, limit podstron obowiązuje', () => {
    const s = salon();
    s.strony[0].sekcje.push({ id: 'sklep', typ: 'produkty', wariant: 'produkty-siatka', tlo: 'domyslne', ukryta: false, dane: { naglowek: 'Sklep', produkty: [{ nazwa: 'Szampon', cenaBrutto: 49, dostepnosc: 'dostepny' }] } });
    for (let i = 1; i <= 6; i++) s.strony.push({ ...structuredClone(s.strony[0]), slug: `p${i}`, tytul: `P${i}` });
    const { strona } = dopasujDoPlanu(s, 'proba');
    expect(strona.strony).toHaveLength(PLANY_KREATORA.proba.podstron!);
    expect(strona.strony.flatMap((p) => p.sekcje).some((x) => x.typ === 'produkty')).toBe(false);
  });

  it('cena Pro: netto = brutto / 1,23', () => {
    expect(Math.round((CENA_KREATORA_PRO.miesiacBrutto / 1.23) * 100) / 100).toBe(CENA_KREATORA_PRO.miesiacNetto);
    expect(Math.round((CENA_KREATORA_PRO.rokBrutto / 1.23) * 100) / 100).toBe(CENA_KREATORA_PRO.rokNetto);
  });
});
