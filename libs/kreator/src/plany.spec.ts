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

  it('zdjęcia AI (paczka 124): limit miesięczny 3/20/100, warianty 1/2/4, korzyść Pro zgodna z planem', () => {
    const p = PLANY_KREATORA;
    expect([p.proba.obrazowAiMies, p.hosting.obrazowAiMies, p.pro.obrazowAiMies]).toEqual([3, 20, 100]);
    expect([p.proba.wariantowObrazuAi, p.hosting.wariantowObrazuAi, p.pro.wariantowObrazuAi]).toEqual([1, 2, 4]);
    const k = KORZYSCI_PRO.find((x) => x.id === 'zdjecia-ai');
    expect(k?.opis).toContain(`${p.pro.obrazowAiMies} zdjęć AI miesięcznie`);
    expect(k?.opis).toContain(`${p.pro.wariantowObrazuAi} warianty`);
  });

  it('wersje językowe (paczka 124): tylko Pro, korzyść wymienia trzy języki', () => {
    expect([PLANY_KREATORA.proba.wielojezycznosc, PLANY_KREATORA.hosting.wielojezycznosc, PLANY_KREATORA.pro.wielojezycznosc]).toEqual([false, false, true]);
    const k = KORZYSCI_PRO.find((x) => x.id === 'jezyki');
    expect(k?.nazwa).toBe('Wersje językowe');
    expect(k?.opis).toContain('angielski, niemiecki, ukraiński');
  });

  it('bez Pro podstrony w językach dodatkowych nie publikują się i nie zabierają limitu podstron', () => {
    const s = salon();
    s.jezykiDodatkowe = ['en'];
    s.stopka.tlumaczenia = { en: { tekst: 'Hair salon in Poznan' } };
    s.strony.push({ ...structuredClone(s.strony[0]!), slug: 'en', tytul: 'Home' }, { ...structuredClone(s.strony[0]!), slug: 'en/prices', klucz: 'cennik', tytul: 'Prices' });
    s.strony.splice(1, 0, { ...structuredClone(s.strony[0]!), slug: 'cennik', tytul: 'Cennik' });
    expect(walidujStrone(s).ok).toBe(true);
    const h = dopasujDoPlanu(s, 'hosting');
    expect(h.strona.strony.map((p) => p.slug)).toEqual(['', 'cennik']);
    expect(h.strona.jezykiDodatkowe).toEqual([]);
    expect(h.strona.stopka.tlumaczenia).toBeUndefined();
    expect(h.zmiany).toContain('Wersje językowe nieopublikowane (Kreator Pro)');
    expect(walidujStrone(h.strona).ok).toBe(true);
    const p = dopasujDoPlanu(s, 'pro');
    expect(p.strona.strony.map((x) => x.slug)).toEqual(['', 'cennik', 'en', 'en/prices']);
  });

  it('cena Pro: netto = brutto / 1,23', () => {
    expect(Math.round((CENA_KREATORA_PRO.miesiacBrutto / 1.23) * 100) / 100).toBe(CENA_KREATORA_PRO.miesiacNetto);
    expect(Math.round((CENA_KREATORA_PRO.rokBrutto / 1.23) * 100) / 100).toBe(CENA_KREATORA_PRO.rokNetto);
  });
});
