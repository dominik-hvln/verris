import { describe, expect, it } from 'vitest';
import { Marka, ProjektLogo } from './model.ts';
import { CHARAKTERY_PALET, kontrast } from '../style/kolory.ts';
import { cmykOrientacyjnie, koloryMarki, koloryZHex, kontrastyMarki } from './kolory-marki.ts';
import { metadaneAi, rysujSygnet, wierszeNapisu, zlozLogo } from './zloz.ts';
import { ocenProjekt, analizaCzytelnosci, elementyDlaWysokosci } from './reguly.ts';
import { odciskParametrow, odciskRastra, odciskSvg, odlegloscHamminga, podobienstwo, rasteryzujSciezki } from './odcisk.ts';
import { kafelWzoruSvg, wzorPattern } from './wzor.ts';
import { IKONY_APLIKACJI, faviconSvg, ikonaSvg, manifestAplikacji, znacznikiFavicon } from './favicon.ts';
import { materialyKv, kvPost, kvWizytowka, bezpiecznyUrlZdjecia } from './kv/index.ts';
import { stopkaEmailHtml } from './stopka-email.ts';
import { ksiegaHtml, stronyKsiegi } from './ksiega.ts';
import type { KsztaltNapisu } from './typy.ts';

const kolory = koloryMarki(265, 'jasna', { akcentBarwa: 76 });
const projekt = (zm: Partial<ProjektLogo> = {}): ProjektLogo =>
  ProjektLogo.parse({
    sygnet: { typ: 'biblioteka', rodzina: 'kolumna-litera', parametry: { zlobki: 3 }, litery: 'K' },
    napis: { font: 'Source Serif 4', waga: 600 },
    kolory,
    fonty: { naglowki: 'Source Serif 4', tekst: 'Hanken Grotesk' },
    ...zm,
  });
const ZLA = 'Zła <script>alert(1)</script> & "Spółka"';
const marka = (zm: Partial<Marka> = {}) =>
  Marka.parse({
    wersjaModelu: 1,
    zrodlo: 'nowa',
    brief: { nazwa: 'Kolumna', podpis: 'Biuro rachunkowe', branza: 'księgowość', opis: 'Księgowość dla małych firm.' },
    projekt: projekt(),
    kv: { wzor: 'rzadki', haslo: 'Księgowość, o której nie musisz myśleć', tloCiemne: true },
    kontakt: { imie: 'Anna Przykładowa', telefon: '600 000 000', email: 'a@przyklad.pl', www: 'przyklad.pl', adres: 'ul. Przykładowa 1' },
    ...zm,
  });

describe('koloryMarki', () => {
  it('360 barw × 5 charakterów: kontrast znaku ≥ 3, napisu ≥ 4,5, akcentu jasnego na głównym ≥ 3', () => {
    for (let h = 0; h < 360; h += 7)
      for (const ch of CHARAKTERY_PALET) {
        const k = koloryMarki(h, ch);
        const kk = kontrastyMarki(k);
        expect(kk.glownyNaBieli, `${h} ${ch}`).toBeGreaterThanOrEqual(4.5);
        expect(kk.akcentNaBieli, `${h} ${ch}`).toBeGreaterThanOrEqual(3);
        expect(kk.akcentJasnyNaGlownym, `${h} ${ch}`).toBeGreaterThanOrEqual(3);
        expect(k.paleta.ciemne).toMatch(/^#[0-9A-F]{6}$/);
      }
  });
  it('z kolorów wgranego logo: poprawia za jasny pomarańcz (2,45:1 z makiety) do wymaganego kontrastu', () => {
    expect(kontrast('#F28C28', '#FFFFFF')).toBeLessThan(3);
    const k = koloryZHex('#1D2B4A', '#F28C28', 'jasna');
    expect(kontrast(k.akcent, '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(k.glowny).toBe('#1D2B4A');
  });
  it('CMYK orientacyjnie: czerń, biel, czysty czerwony', () => {
    expect(cmykOrientacyjnie('#000000')).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    expect(cmykOrientacyjnie('#FFFFFF')).toEqual({ c: 0, m: 0, y: 0, k: 0 });
    expect(cmykOrientacyjnie('#FF0000')).toEqual({ c: 0, m: 100, y: 100, k: 0 });
  });
});

describe('zlozLogo', () => {
  const ksztalt = (szer: number): KsztaltNapisu => ({ d: `M0 0H${szer}V-700H0Z`, szerokosc: szer, wysokoscWersalikow: 700, zejscie: 200 });

  it('samodzielny SVG: width/height/viewBox, tytuł, metadane AI, kolory wpisane, bez zewnętrznych odwołań', () => {
    const z = zlozLogo(projekt(), 'Kolumna', 'Biuro rachunkowe', { uklad: 'poziomy', wariant: 'kolor' });
    expect(z.svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="[\d.]+" height="[\d.]+" viewBox="[-\d. ]+"/);
    expect(z.svg).toContain('<title>Kolumna</title>');
    expect(z.svg).toContain('compositeWithTrainedAlgorithmicMedia');
    expect(z.svg).not.toMatch(/currentColor|var\(|href|url\(/);
    expect(z.svg).toContain(kolory.glowny);
    expect(z.svg).toContain(kolory.akcent);
    expect(z.poleOchronne).toBe(50);
  });

  it('nazwa firmy w <text> i <title> jest escapowana (XSS)', () => {
    for (const uklad of ['poziomy', 'pionowy', 'napis'] as const) {
      const z = zlozLogo(projekt(), ZLA, '<img src=x onerror=alert(1)>', { uklad, wariant: 'kolor' });
      expect(z.svg).not.toMatch(/<script|<img|onerror=/);
      expect(z.svg).toContain('&lt;script&gt;');
    }
  });

  it('kształty napisu (eksport) zastępują <text>; wersaliki = 0,4 wysokości znaku', () => {
    const z = zlozLogo(projekt(), 'Kolumna', undefined, { uklad: 'poziomy', wariant: 'kolor', napis: ksztalt(3000) });
    expect(z.svg).not.toContain('<text');
    // skala = 40 / 700
    expect(z.svg).toContain('scale(0.05714)');
    // szerokość: znak + 30 (odstęp) + 3000 × 40/700
    expect(z.szerokosc).toBeGreaterThan(30 + 171);
  });

  it('warianty: mono jednym kolorem, negatyw z tłem i jasnym akcentem, biały cały biały', () => {
    const mono = zlozLogo(projekt(), 'Kolumna', 'Biuro', { uklad: 'poziomy', wariant: 'mono' }).svg;
    expect(new Set(mono.match(/fill="#[0-9A-F]{6}"/g))).toEqual(new Set([`fill="${kolory.paleta.tekst}"`]));
    const neg = zlozLogo(projekt(), 'Kolumna', 'Biuro', { uklad: 'poziomy', wariant: 'negatyw' }).svg;
    expect(neg).toContain(`<rect`);
    expect(neg).toContain(kolory.akcentJasny);
    const bez = zlozLogo(projekt(), 'Kolumna', 'Biuro', { uklad: 'poziomy', wariant: 'negatyw', tlo: false }).svg;
    expect(bez).not.toContain('<rect');
    const bialy = zlozLogo(projekt(), 'Kolumna', 'Biuro', { uklad: 'poziomy', wariant: 'bialy' }).svg;
    expect(new Set(bialy.match(/fill="#[0-9A-F]{6}"/g))).toEqual(new Set(['fill="#FFFFFF"']));
  });

  it('progi wysokości: < 34 px bez podpisu, < 24 px sam sygnet', () => {
    const z = (px: number) => zlozLogo(projekt(), 'Kolumna', 'Biuro rachunkowe', { uklad: 'poziomy', wariant: 'kolor', wysokoscPx: px }).svg;
    expect(z(40)).toContain('BIURO RACHUNKOWE');
    expect(z(30)).not.toContain('BIURO RACHUNKOWE');
    expect(z(30)).toContain('Kolumna</text>');
    expect(z(20)).not.toContain('<text');
    expect(z(20)).toMatch(/height="20"/);
    expect(elementyDlaWysokosci(20)).toEqual({ sygnetSam: true, podpis: false });
  });

  it('napis w dwóch wierszach tylko dla ≥ 2 słów; style wersaliki/małe/rozstrzelony', () => {
    expect(wierszeNapisu('Łódka i Wiosło', 'dwa')).toEqual(['Łódka i', 'Wiosło']);
    expect(wierszeNapisu('Kolumna', 'dwa')).toEqual(['Kolumna']);
    expect(wierszeNapisu('źródło', 'wersaliki')).toEqual(['ŹRÓDŁO']);
    expect(wierszeNapisu('ZAKWAS', 'male')).toEqual(['zakwas']);
    const z = zlozLogo(projekt({ napis: { font: 'Manrope', waga: 700, styl: 'rozstrzelony', rozstrzelenie: 0, podpis: true } }), 'Fala', undefined, { uklad: 'napis', wariant: 'kolor' });
    expect(z.svg).toContain('FALA');
    expect(z.svg).toContain('letter-spacing');
  });

  it('marka bez sygnetu → układ napisu; metadane można wyłączyć', () => {
    const z = zlozLogo(projekt({ sygnet: { typ: 'brak' } }), 'Kolumna', undefined, { uklad: 'poziomy', wariant: 'kolor', metadaneAi: false });
    expect(z.svg).not.toContain('<g transform');
    expect(z.svg).not.toContain('<metadata>');
    expect(metadaneAi('ai')).toContain('digitalsourcetype/trainedAlgorithmicMedia');
    expect(metadaneAi('brak')).not.toContain('DigitalSourceType');
  });

  it('symbol od AI jest ponownie walidowany – złośliwy SVG nie trafia do logo', () => {
    const zly = projekt({ sygnet: { typ: 'ai', svg: '<svg viewBox="0 0 100 100"><script>alert(1)</script></svg>' } });
    expect(rysujSygnet(zly.sygnet)).toBe('');
    expect(zlozLogo(zly, 'Kolumna', undefined, { uklad: 'poziomy', wariant: 'kolor' }).svg).not.toContain('<script');
    const dobry = projekt({ sygnet: { typ: 'ai', svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="currentColor"/></svg>' } });
    expect(zlozLogo(dobry, 'K', undefined, { uklad: 'poziomy', wariant: 'kolor' }).svg).toContain('trainedAlgorithmicMedia');
  });
});

describe('ocenProjekt', () => {
  it('poprawny projekt przechodzi', () => {
    const o = ocenProjekt(projekt(), 'Kolumna');
    expect(o.bledy).toEqual([]);
    expect(o.ok).toBe(true);
  });
  it('wykrywa: słaby kontrast, krój spoza katalogu, dwa wiersze dla jednego słowa, cienki symbol', () => {
    const o = ocenProjekt(
      projekt({
        kolory: { ...kolory, glowny: '#BBBBBB', akcentJasny: '#BBBBBB' },
        napis: { font: 'Comic Sans MS', waga: 600, styl: 'dwa', rozstrzelenie: 0, podpis: true },
      }),
      'Kolumna',
    );
    expect(o.ok).toBe(false);
    expect(o.bledy.join(' ')).toMatch(/kontrast z bielą/);
    expect(o.bledy.join(' ')).toMatch(/spoza katalogu/);
    expect(o.bledy.join(' ')).toMatch(/dwóch wierszach/);
    expect(o.bledy.join(' ')).toMatch(/negatyw/);
    const cienki = projekt({ sygnet: { typ: 'ai', svg: '<svg viewBox="0 0 100 100"><path d="M10 10H90V12H10Z M10 50H90V52H10Z"/></svg>' } });
    expect(ocenProjekt(cienki, 'Kolumna').ostrzezenia.join(' ')).toMatch(/cienkie/);
  });
  it('analiza czytelności: gruby kształt ok, cienkie linie wykryte', () => {
    expect(analizaCzytelnosci('<path d="M10 10H90V90H10Z"/>').cienkie).toBeLessThan(0.05);
    expect(analizaCzytelnosci('<path d="M10 10H90V13H10Z"/>').cienkie).toBeGreaterThan(0.9);
  });
});

describe('odcisk', () => {
  it('rasteryzator: kwadrat w połowie pola pokrywa 1/4 pikseli', () => {
    const r = rasteryzujSciezki(['M0 0H50V50H0Z'], 64);
    const s = r.reduce((a, v) => a + v, 0) / 255;
    expect(s).toBeCloseTo(64 * 64 * 0.25, -1);
  });
  it('pHash: identyczny dla tego samego znaku, bliski dla drobnej zmiany, daleki dla innego', () => {
    const a = odciskSvg(rysujSygnet(projekt().sygnet));
    const b = odciskSvg(rysujSygnet(projekt({ sygnet: { typ: 'biblioteka', rodzina: 'kolumna-litera', parametry: { zlobki: 3, szczel: 6 }, litery: 'K', ziarno: 0 } }).sygnet));
    const c = odciskSvg(rysujSygnet({ typ: 'biblioteka', rodzina: 'kreg-fala', parametry: {}, ziarno: 0 }));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(odlegloscHamminga(a, a)).toBe(0);
    expect(podobienstwo(a, b)).toBeGreaterThan(0.85);
    expect(podobienstwo(a, c)).toBeLessThan(0.75);
    expect(odciskRastra(new Uint8Array(64 * 64), 64, 64)).toMatch(/^[0-9a-f]{16}$/);
  });
  it('odcisk parametrów kwantyzuje (bliskie wartości – ten sam odcisk) i uwzględnia litery', () => {
    const s = (g: number, l = 'K') => odciskParametrow({ typ: 'biblioteka', rodzina: 'kolumna-litera', parametry: { grub: g }, litery: l, ziarno: 0 });
    expect(s(18)).toBe(s(19));
    expect(s(14)).not.toBe(s(24));
    expect(s(18, 'K')).not.toBe(s(18, 'M'));
    expect(odciskParametrow({ typ: 'brak' })).toBeNull();
  });
});

describe('wzór, favicon, ikony', () => {
  const syg = rysujSygnet(projekt().sygnet);
  it('kafel wzoru – rzadki 2 znaki, gęsty 4, kafel samodzielny', () => {
    const k = kafelWzoruSvg(syg, 'rzadki', '#123456')!;
    expect(k.svg).toMatch(/^<svg xmlns/);
    expect((k.svg.match(/<g transform/g) ?? []).length).toBe(2);
    const g = kafelWzoruSvg(syg, 'gesty', '#123456')!;
    expect((g.svg.match(/<g transform/g) ?? []).length).toBe(4);
    expect(kafelWzoruSvg(syg, 'bez', '#123456')).toBeNull();
    expect(wzorPattern('w1', syg, 'rzadki', '#000000')).toMatch(/^<pattern id="w1" patternUnits="userSpaceOnUse"/);
  });
  it('favicon.svg z wariantem ciemnym i unikalnymi klasami; ikony; manifest', () => {
    const fav = rysujSygnet(projekt().sygnet, { wariant: 'favicon' });
    const f = faviconSvg(fav, kolory);
    expect(f).toContain('@media (prefers-color-scheme:dark)');
    expect(f).not.toContain('currentColor');
    expect(faviconSvg(fav, kolory, { kafel: true })).toContain(`fill="${kolory.glowny}"`);
    for (const i of IKONY_APLIKACJI) expect(ikonaSvg(fav, kolory, i)).toContain(`width="${i.rozmiar}"`);
    const m = JSON.parse(manifestAplikacji('Kolumna "biuro"', kolory));
    expect(m.name).toBe('Kolumna "biuro"');
    expect(m.theme_color).toBe(kolory.glowny);
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
    expect(znacznikiFavicon('/"><script>')).not.toContain('<script>');
  });
});

describe('KV, stopka, księga', () => {
  it('wszystkie materiały: poprawne wymiary, metadane AI, escapowane dane klienta', () => {
    const m = marka({ brief: { nazwa: ZLA, branza: 'x', opis: 'x', rodzaj: 'znak-i-napis', cechy: [], barwyLubiane: [], barwyOdrzucone: [] }, kv: { wzor: 'gesty', haslo: '<b>hasło</b>', tloCiemne: false } });
    const lista = materialyKv({ marka: m });
    expect(lista.map((x) => x.material)).toEqual(['post', 'story', 'okladka-facebook', 'baner-linkedin', 'zaproszenie-teams', 'wizytowka', 'wizytowka', 'papier-firmowy', 'naklejka']);
    for (const x of lista) {
      expect(x.svg).toMatch(/^<svg xmlns/);
      expect(x.svg).toContain('DigitalSourceType');
      expect(x.svg).not.toMatch(/<script|<b>/);
    }
    expect(lista[0].szerokosc).toBe(1080);
    expect(lista[1].wysokosc).toBe(1920);
  });
  it('wizytówka: 85×55 mm + spad 3 mm + pas na linie cięcia; bez linii – sam spad', () => {
    const w = kvWizytowka({ marka: marka() });
    expect(w.przod.szerokosc).toBe(85 + 6 + 12);
    expect(w.przod.svg).toContain('width="103mm"');
    expect(w.tyl.svg).toContain('stroke-width="0.25"');
    expect(kvWizytowka({ marka: marka() }, { linieCiecia: false }).przod.szerokosc).toBe(91);
  });
  it('zdjęcie tylko z bezpiecznego adresu (https / data:image)', () => {
    expect(bezpiecznyUrlZdjecia('https://images.przyklad.pl/a.jpg')).toBeTruthy();
    expect(bezpiecznyUrlZdjecia('javascript:alert(1)')).toBeNull();
    expect(bezpiecznyUrlZdjecia('https://x.pl/a.jpg" onload="alert(1)')).toBeNull();
    expect(bezpiecznyUrlZdjecia('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    const p = kvPost({ marka: marka(), zdjecieUrl: 'https://images.przyklad.pl/a.jpg' });
    expect(p.svg).toContain('<image href="https://images.przyklad.pl/a.jpg"');
    expect(kvPost({ marka: marka(), zdjecieUrl: 'http://zly.pl/a.jpg' }).svg).not.toContain('<image');
  });
  it('stopka e-mail: tabela, style inline, img z alt, linki tel/mailto/https, escape', () => {
    const m = marka();
    const h = stopkaEmailHtml({ nazwa: ZLA, kolory, kontakt: { ...m.kontakt, imie: '<b>Anna</b>' }, logoUrl: 'https://przyklad.pl/logo.png' });
    expect(h).toMatch(/^<table role="presentation"/);
    expect(h).not.toMatch(/<style|<script|<b>|<svg/);
    expect(h).toContain('alt="Zła &lt;script&gt;');
    expect(h).toContain('href="tel:600000000"');
    expect(h).toContain('href="mailto:a@przyklad.pl"');
    expect(h).toContain('href="https://przyklad.pl"');
    expect(stopkaEmailHtml({ nazwa: 'X', kolory, kontakt: {}, logoUrl: 'javascript:alert(1)' })).not.toContain('<img');
  });
  it('księga: 10 stron A4, HTML z @page, dane do PDF, escape nazwy', () => {
    const m = marka({ brief: { nazwa: ZLA, branza: 'x', opis: 'x', rodzaj: 'znak-i-napis', cechy: [], barwyLubiane: [], barwyOdrzucone: [] } });
    const s = stronyKsiegi(m, { data: '19.11.2026' });
    expect(s.length).toBe(10);
    expect(s.map((x) => x.tytul)).toContain('Kolory');
    const h = ksiegaHtml(m, { fontyCss: '</style><script>alert(1)</script>' });
    expect(h).toMatch(/^<!doctype html>/);
    expect(h).toContain('@page{size:A4;margin:0}');
    expect((h.match(/<section class="s"/g) ?? []).length).toBe(10);
    expect(h).not.toMatch(/<script/);
    expect(h).toContain('TMview');
    expect(h).toContain('SIL Open Font License 1.1');
    expect(h).not.toMatch(/zastrzeżon|unikaln/i);
  });
});
