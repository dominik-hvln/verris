import { walidujStrone, type Strona } from './model.ts';
import { dopasujDoPlanu, PLANY_KREATORA, CENA_KREATORA_PRO, KORZYSCI_PRO } from './plany.ts';
import { KATALOG_STYLOW } from './style/katalog-stylow.ts';
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

  it('styl Pro bez Pro → zastępczy z katalogu stylów; paleta i fonty bez zmian, wpis w zmianach (paczka 123)', () => {
    const pro = KATALOG_STYLOW.find((x) => x.pro && x.zastepczy)!;
    const zast = KATALOG_STYLOW.find((x) => x.id === pro.zastepczy)!;
    const s = salon();
    s.motyw.styl = pro.id;
    const { strona, zmiany } = dopasujDoPlanu(s, 'hosting');
    expect(strona.motyw.styl).toBe(zast.id);
    expect(strona.motyw.paleta).toEqual(s.motyw.paleta);
    expect(strona.motyw.fonty).toEqual(s.motyw.fonty);
    expect(zmiany).toContain(`Styl „${pro.nazwa}” zamieniony na „${zast.nazwa}” (kolory i fonty zostają)`);
    expect(s.motyw.styl).toBe(pro.id);
    // Pro zostawia styl Pro, darmowy styl bez Pro też bez zmian.
    expect(dopasujDoPlanu(s, 'pro').strona.motyw.styl).toBe(pro.id);
    const darmowy = KATALOG_STYLOW.find((x) => !x.pro)!;
    s.motyw.styl = darmowy.id;
    expect(dopasujDoPlanu(s, 'proba').strona.motyw.styl).toBe(darmowy.id);
  });

  it('miejsce na zdjęcia w planach: próba 50 MB, hosting 500 MB, Pro 2 GB', () => {
    expect([PLANY_KREATORA.proba.miejsceZdjecMb, PLANY_KREATORA.hosting.miejsceZdjecMb, PLANY_KREATORA.pro.miejsceZdjecMb]).toEqual([50, 500, 2048]);
  });

  it('bez obietnicy wersji językowych, której renderer nie spełnia (paczka 123)', () => {
    expect(KORZYSCI_PRO.some((k) => k.id === 'jezyki' || /języ/i.test(k.nazwa + k.opis))).toBe(false);
    expect(Object.values(PLANY_KREATORA).some((p) => p.wielojezycznosc)).toBe(false);
  });

  it('cena Pro: netto = brutto / 1,23', () => {
    expect(Math.round((CENA_KREATORA_PRO.miesiacBrutto / 1.23) * 100) / 100).toBe(CENA_KREATORA_PRO.miesiacNetto);
    expect(Math.round((CENA_KREATORA_PRO.rokBrutto / 1.23) * 100) / 100).toBe(CENA_KREATORA_PRO.rokNetto);
  });
});
