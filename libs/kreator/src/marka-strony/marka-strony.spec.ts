import { migrujModel, Strona, WERSJA_MODELU, walidujStrone, type StronaWejscie } from '../model.ts';
import { zastosujTekst } from '../edycja.ts';
import { PRZYKLAD_SALON } from '../przyklady/salon.ts';
import { PRZYKLAD_MIGAWKI_MARKI as MIG } from './przyklad.ts';
import { analizujSvgMarki, czystySvgMarki, MAKS_SVG_LOGO } from './svg.ts';
import { migawkaZMarki, odlaczMarke, porownajMarke, wygladMarki, zastosujMarke, WSZYSTKO_Z_MARKI, type MigawkaMarki } from './zastosuj.ts';
import type { Marka } from '../marka/model.ts';

const salon = (): Strona => {
  const w = walidujStrone(PRZYKLAD_SALON);
  if (!w.ok) throw new Error(w.bledy.join('; '));
  return w.strona;
};
const svg = (wnetrze: string, atr = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"${atr}>${wnetrze}</svg>`;

describe('SVG logo marki – walidacja (biała lista)', () => {
  it('przyjmuje logo z kreatora marki (ścieżki, tekst, maski, gradient, metadane AI)', () => {
    for (const s of [MIG.logoPoziome, MIG.sygnet!, MIG.logoNegatyw!, MIG.favicon]) expect(analizujSvgMarki(s)).toMatchObject({ ok: true });
    expect(analizujSvgMarki(svg('<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/>')).ok).toBe(true);
    expect(analizujSvgMarki(svg('<use href="#a"/><g id="a"><path d="M0 0h1"/></g>')).ok).toBe(true);
  });

  it.each([
    ['skrypt', svg('<script>alert(1)</script>')],
    ['skrypt wielkimi literami', svg('<SCRIPT>alert(1)</SCRIPT>')],
    ['foreignObject', svg('<foreignObject><div>x</div></foreignObject>')],
    ['zdarzenie onload', svg('', ' onload="alert(1)"')],
    ['zdarzenie w elemencie', svg('<rect width="1" height="1" onclick="alert(1)"/>')],
    ['href zewnętrzny', svg('<use href="https://zly.pl/x.svg#a"/>')],
    ['xlink:href javascript', svg('<use xlink:href="javascript:alert(1)"/>', ' xmlns:xlink="http://www.w3.org/1999/xlink"')],
    ['javascript: zakodowany encjami', svg('<use href="&#106;avascript:alert(1)"/>')],
    ['url() zewnętrzny', svg('<rect width="1" height="1" fill="url(https://zly.pl/a)"/>')],
    ['atrybut style', svg('<rect width="1" height="1" style="fill:red"/>')],
    ['element style', svg('<style>*{}</style>')],
    ['image', svg('<image href="#a"/>')],
    ['a', svg('<a href="#x"><rect width="1" height="1"/></a>')],
    ['animate', svg('<animate attributeName="href" to="javascript:alert(1)"/>')],
    ['DOCTYPE i encje', `<!DOCTYPE svg [<!ENTITY x "y">]>${svg('')}`],
    ['nie zaczyna się od <svg', `<div>${svg('')}</div>`],
    ['instrukcja przetwarzania', `<?xml version="1.0"?>${svg('')}`],
    ['CDATA', svg('<text><![CDATA[<script>]]></text>')],
    ['atrybut bez cudzysłowu', '<svg viewBox=0 0 1 1></svg>'],
    ['niezamknięty element', '<svg viewBox="0 0 1 1"><g>'],
    ['dwa korzenie', `${svg('')}${svg('')}`],
    ['bez viewBox', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ['obca przestrzeń nazw', '<svg xmlns="http://www.w3.org/1999/xhtml" viewBox="0 0 1 1"></svg>'],
    ['href w metadanych', svg('<metadata><x:a xlink:href="javascript:alert(1)"/></metadata>')],
    ['tekst poza elementem tekstowym', svg('<g>tekst</g>')],
    ['za długi', svg(`<path d="${'M0 0'.repeat(MAKS_SVG_LOGO / 4)}"/>`)],
    ['nieznana encja', svg('<text>&nbsp;</text>')],
  ])('odrzuca: %s', (_opis, s) => {
    expect(analizujSvgMarki(s).ok).toBe(false);
  });

  it('serializacja od nowa: escapowanie, prefiks id, bez metadanych/tytułu, aria-hidden inline', () => {
    const czysty = czystySvgMarki(MIG.logoPoziome, { prefiksId: 'mkn' })!;
    expect(czysty).toContain('aria-hidden="true"');
    expect(czysty).toContain('<clipPath id="mkn-k">');
    expect(czysty).toContain('clip-path="url(#mkn-k)"');
    expect(czysty).toContain('Łódka &amp; Wiosło</text>');
    expect(czysty).not.toMatch(/metadata|rdf|<title|role="img"|aria-label/);
    // kolory kanałów zostają (CSS strony ustawia color i --akcent)
    expect(czysty).toContain('fill="currentColor"');
    expect(czysty).toContain('var(--akcent, currentColor)');
  });

  it('plik samodzielny: kolory kanałów wpisane na stale (obraz bez CSS strony)', () => {
    const plik = czystySvgMarki(MIG.favicon, { plik: { glowny: '#112233', akcent: '#AABBCC' } })!;
    expect(plik).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#112233"/><circle cx="32" cy="32" r="14" fill="#AABBCC"/></svg>');
  });

  it('nic z wejścia nie przechodzi bez escapowania (tekst z <, cudzysłów w atrybucie z encji)', () => {
    const s = czystySvgMarki(svg('<text font-family="A&quot;B">&lt;b&gt; &#34;x&#34;</text>'))!;
    expect(s).toContain('font-family="A&quot;B"');
    expect(s).toContain('&lt;b&gt; &quot;x&quot;');
    expect(s).not.toContain('<b>');
  });
});

describe('Model strony v2 – migawka marki', () => {
  it(`WERSJA_MODELU = 2, strona v1 migruje się bez marki (marka z v1 odrzucona)`, () => {
    expect(WERSJA_MODELU).toBe(2);
    const v1 = { ...structuredClone(PRZYKLAD_SALON), wersjaModelu: 1 } as unknown as StronaWejscie;
    expect(walidujStrone(v1).ok).toBe(false);
    const w = walidujStrone(migrujModel(v1));
    expect(w.ok && w.strona.wersjaModelu).toBe(2);
    const zMarka = { ...v1, marka: { ...MIG, uzyj: { logo: true, favicon: true } } };
    const m = migrujModel(zMarka) as Record<string, unknown>;
    expect(m.marka).toBeUndefined();
    expect(zMarka.marka).toBeDefined(); // bez mutacji wejścia
    expect(migrujModel(null)).toBeNull();
  });

  it('strona z migawką przechodzi walidację; złośliwe SVG w migawce – błąd przy polu marka', () => {
    const { strona } = zastosujMarke(salon(), MIG);
    expect(walidujStrone(strona).ok).toBe(true);
    const zla = { ...strona, marka: { ...strona.marka!, logoPoziome: svg('<script>alert(1)</script>') } };
    const w = walidujStrone(zla);
    expect(w.ok).toBe(false);
    expect(!w.ok && w.bledy.join()).toMatch(/marka\.logoPoziome: Niedozwolony plik SVG logo: niedozwolony element <script>/);
    const zlyAdres = { ...strona, marka: { ...strona.marka!, obrazOg: 'javascript:alert(1)' } };
    expect(walidujStrone(zlyAdres).ok).toBe(false);
  });

  it('edycja na stronie nie przyjmuje ścieżek marki (SVG nie jest polem tekstowym)', () => {
    const { strona } = zastosujMarke(salon(), MIG);
    for (const sciezka of ['marka.logoPoziome', 'marka.nazwa', 'marka.favicon', 'marka.kolory.glowny']) {
      const w = zastosujTekst(strona, sciezka, '<svg viewBox="0 0 1 1"></svg>');
      expect(w.ok, sciezka).toBe(false);
    }
  });
});

describe('zastosujMarke / porownajMarke / odlaczMarke', () => {
  it('pełne zastosowanie: migawka, paleta (z korektą kontrastu), fonty, lista zmian dla klienta', () => {
    const przed = salon();
    const { strona, zmiany, ostrzezenia } = zastosujMarke(przed, MIG);
    expect(zmiany.map((z) => z.opis)).toEqual([
      'Logo w nagłówku i stopce',
      'Favicon (ikona w karcie przeglądarki)',
      'Obraz do udostępniania w mediach społecznościowych',
      'Paleta z marki',
      'Fonty: Playfair Display / Inter',
    ]);
    expect(ostrzezenia).toEqual([]);
    expect(strona.marka).toMatchObject({ markaId: MIG.markaId, wersja: 3, uzyj: { logo: true, favicon: true } });
    expect(strona.marka).not.toHaveProperty('paleta');
    expect(strona.motyw.fonty).toEqual({ ...przed.motyw.fonty, naglowki: 'Playfair Display', tekst: 'Inter' });
    expect(strona.motyw.paleta.tlo).toBe('#FBF8F3');
    expect(przed.marka).toBeUndefined(); // bez mutacji
    // drugi raz to samo – nic do zmiany
    expect(zastosujMarke(strona, MIG).zmiany).toEqual([]);
  });

  it('opcje: tylko kolory – logo i favicon wyłączone (inicjał), fonty bez zmian; nic nie zaznaczone = strona bez zmian', () => {
    const przed = salon();
    const w = zastosujMarke(przed, MIG, { logo: false, paleta: true, fonty: false, favicon: false });
    expect(w.zmiany.map((z) => z.element)).toEqual(['paleta']);
    expect(w.strona.marka?.uzyj).toEqual({ logo: false, favicon: false });
    expect(w.strona.motyw.fonty).toEqual(przed.motyw.fonty);
    const nic = zastosujMarke(przed, MIG, { logo: false, paleta: false, fonty: false, favicon: false });
    expect(nic).toEqual({ strona: przed, zmiany: [], ostrzezenia: [] });
    // wyłączenie logo na stronie, która je ma
    const zLogo = zastosujMarke(przed, MIG).strona;
    expect(zastosujMarke(zLogo, MIG, { ...WSZYSTKO_Z_MARKI, logo: false }).zmiany.map((z) => z.opis)).toEqual(['Logo: wraca inicjał firmy w nagłówku i stopce']);
  });

  it('krój spoza katalogu kreatora stron: fonty bez zmian i ostrzeżenie', () => {
    const w = zastosujMarke(salon(), { ...MIG, fonty: { naglowki: 'Comic Neue Zly', tekst: 'Inter' } });
    expect(w.zmiany.some((z) => z.element === 'fonty')).toBe(false);
    expect(w.ostrzezenia).toEqual(['Krój „Comic Neue Zly” nie jest dostępny w kreatorze stron – fonty strony bez zmian.']);
  });

  it('migawka spoza schematu (złośliwe SVG od dostawcy) – wyjątek, strona nietknięta', () => {
    expect(() => zastosujMarke(salon(), { ...MIG, favicon: svg('<script>x</script>') })).toThrow();
  });

  it('porównanie: brak → aktualna → starsza (nowa wersja marki) → inna marka; nic nie zmienia się samo', () => {
    const s0 = salon();
    expect(porownajMarke(s0, MIG)).toMatchObject({ stan: 'brak', wersjaNaStronie: null, wersjaMarki: 3 });
    const s1 = zastosujMarke(s0, MIG).strona;
    expect(porownajMarke(s1, MIG)).toMatchObject({ stan: 'aktualna', zmiany: [] });
    const nowsza: MigawkaMarki = { ...MIG, wersja: 4, logoPoziome: MIG.logoPoziome.replace('Łódka &amp; Wiosło</text>', 'Łódka</text>') };
    const p = porownajMarke(s1, nowsza);
    expect(p).toMatchObject({ stan: 'starsza', wersjaNaStronie: 3, wersjaMarki: 4 });
    expect(p.zmiany.map((z) => z.element)).toEqual(['logo']);
    expect(s1.marka?.wersja).toBe(3);
    expect(porownajMarke(s1, { ...MIG, markaId: 'inna' }).stan).toBe('inna');
  });

  it('odłączenie marki: logo i favicon wracają do inicjału, paleta i fonty zostają', () => {
    const s = zastosujMarke(salon(), MIG).strona;
    const w = odlaczMarke(s);
    expect(w.strona.marka).toBeUndefined();
    expect(w.strona.motyw).toEqual(s.motyw);
    expect(w.zmiany.map((z) => z.element)).toEqual(['logo', 'favicon']);
  });

  it('wygląd do podglądu przed/po: logo jako samodzielny SVG z kolorami, bez marki – inicjał', () => {
    const przed = wygladMarki(salon());
    expect(przed).toMatchObject({ logo: null, favicon: null, inicjal: 'P' });
    const po = wygladMarki(zastosujMarke(salon(), MIG).strona);
    expect(po.logo).toContain('fill="#1F3A5F"');
    expect(po.logo).not.toContain('currentColor');
    expect(po.fonty.naglowki).toBe('Playfair Display');
  });

  it('migawka z modelu marki (kontrakt marka/model.ts): kolory, paleta i fonty z projektu', () => {
    const marka = {
      brief: { nazwa: 'Łódka i Wiosło' },
      projekt: { kolory: { glowny: '#1F3A5F', akcent: '#E07A3F', akcentJasny: '#F5C9A8', paleta: MIG.paleta }, fonty: MIG.fonty },
    } as unknown as Marka;
    const m = migawkaZMarki(marka, { markaId: 'm1', wersja: 1, logoPoziome: MIG.logoPoziome, favicon: MIG.favicon });
    expect(m).toMatchObject({ nazwa: 'Łódka i Wiosło', kolory: { glowny: '#1F3A5F', akcent: '#E07A3F' }, fonty: MIG.fonty });
    expect(() => migawkaZMarki(marka, { markaId: 'm1', wersja: 1, logoPoziome: '<svg onload="x" viewBox="0 0 1 1"/>', favicon: MIG.favicon })).toThrow();
  });
});
