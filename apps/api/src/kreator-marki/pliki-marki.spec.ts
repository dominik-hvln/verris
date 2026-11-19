import { PDFDocument, PDFName } from 'pdf-lib';
import sharp from 'sharp';
import { create } from 'fontkit';
import { ROZMIARY_ICO } from '@verris/kreator';
import { ksztaltZKrojow } from './napis-marki.js';
import { GeneratorPlikowMarki, zip } from './generator-plikow.js';
import { odczytajXmpPng, pakietXmp, pngZSvg, wstawXmpPng, zlozIco } from './pliki-graficzne.js';
import { blokadaPliku, katalogPlikow, kluczBranzy, listaPlikow } from './dane-marki.js';
import { rezerwuj, stanLimitow } from './limity-marki.js';
import { DOMYSLNA_KONFIGURACJA_MARKI } from './konfiguracja-marki.js';
import { parsujSvg, stronaZSvg, wymagaRastra } from './pdf-svg.js';
import { markaTestowa, napisTestowy, PLIK_LATIN, PLIK_LATIN_EXT, zrodloKrojowTestowe } from './test-marka.js';
import { NapisMarkiService } from './napis-marki.js';

/**
 * Paczka 131 – pliki Kreatora marki: napis na krzywych (fontkit, kerning, polskie znaki z podzbioru latin-ext),
 * favicon.ico (ICONDIR), PNG z XMP, PDF wektorowe (otwierają się w pdf-lib, metadane), eksport ZIP, katalog plików
 * i blokady. Na starym kodzie czerwone: modułów nie było.
 */

const latin = create(PLIK_LATIN);
const ext = create(PLIK_LATIN_EXT);

describe('napis na krzywych (fontkit)', () => {
  it('kerning: „AVATAR” jest węższy niż suma szerokości liter', () => {
    const k = ksztaltZKrojow('AVATAR', [latin, ext])!;
    const osobno = [...'AVATAR'].reduce((s, z) => s + ksztaltZKrojow(z, [latin, ext])!.szerokosc, 0);
    expect(k.szerokosc).toBeLessThan(osobno - 50);
    expect(k.wysokoscWersalikow).toBeGreaterThan(600);
    expect(k.d).toMatch(/^M/);
  });

  it('polskie litery z podzbioru latin-ext, „ó” z latin – każdy znak ma glif', () => {
    for (const z of [...'ąęłńśźżĄĘŁŃŚŹŻóÓćĆ']) {
      const k = ksztaltZKrojow(z, [latin, ext]);
      expect(k?.szerokosc, z).toBeGreaterThan(100);
      expect(k?.d, z).toMatch(/M/);
    }
    const l = ksztaltZKrojow('Łódź', [latin, ext])!;
    expect(l.szerokosc).toBeGreaterThan(ksztaltZKrojow('Ł', [latin, ext])!.szerokosc + ksztaltZKrojow('ó', [latin, ext])!.szerokosc);
  });

  it('rozstrzelenie dokłada odstęp między znakami (bez ostatniego)', () => {
    const a = ksztaltZKrojow('KAJAK', [latin, ext], 0)!;
    const b = ksztaltZKrojow('KAJAK', [latin, ext], 100)!;
    expect(Math.round(b.szerokosc - a.szerokosc)).toBe(400);
  });

  it('serwis: cache kształtów i krojów, krój spoza katalogu = null, <text> → <path> z kotwicą', async () => {
    const zrodlo = zrodloKrojowTestowe();
    const s = NapisMarkiService.zeZrodlem(zrodlo);
    const a = await s.ksztaltuj('Łódka', 'Hanken Grotesk', 700, 0);
    const b = await s.ksztaltuj('Łódka', 'Hanken Grotesk', 700, 0);
    expect(a).toBe(b);
    expect(zrodlo.wolania).toEqual(['hanken-grotesk-700-latin.woff2', 'hanken-grotesk-700-latin-ext.woff2']);
    expect(await s.ksztaltuj('X', 'Comic Sans MS', 400, 0)).toBeNull();
    const svg = await s.tekstNaKrzywe(`<svg><text x="100" y="50" fill="#123456" font-family="'Hanken Grotesk', sans-serif" font-weight="400" font-size="20" text-anchor="middle">Żółw &amp; Ćma</text></svg>`);
    expect(svg).not.toContain('<text');
    expect(svg).toMatch(/<path fill="#123456" transform="translate\((\d+(\.\d)?) 50\) scale\(0\.02000\)" d="M/);
    const x = Number(/translate\(([\d.]+)/.exec(svg)![1]);
    expect(x).toBeLessThan(100);
  });
});

describe('PNG, ICO, metadane', () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#1F3A5F"/></svg>';

  it('favicon.ico: ICONDIR, wpisy 16/32/48 z poprawnymi przesunięciami, obrazy PNG', async () => {
    const obrazy = await Promise.all(ROZMIARY_ICO.map(async (r) => ({ rozmiar: r, png: await pngZSvg(SVG, { szerokosc: r, wysokosc: r }) })));
    const ico = zlozIco(obrazy);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    let oczekiwane = 6 + 16 * 3;
    obrazy.forEach((o, i) => {
      const w = 6 + 16 * i;
      expect(ico.readUInt8(w)).toBe(o.rozmiar);
      expect(ico.readUInt8(w + 1)).toBe(o.rozmiar);
      expect(ico.readUInt16LE(w + 6)).toBe(32);
      expect(ico.readUInt32LE(w + 8)).toBe(o.png.length);
      expect(ico.readUInt32LE(w + 12)).toBe(oczekiwane);
      expect(ico.subarray(oczekiwane, oczekiwane + 4).toString('latin1')).toBe('\x89PNG');
      oczekiwane += o.png.length;
    });
    expect(ico.length).toBe(oczekiwane);
    expect(() => zlozIco([])).toThrow();
  });

  it('PNG z XMP (iTXt) – czytelny dla sharp, metadane „wygenerowano z pomocą AI”', async () => {
    const png = await pngZSvg(SVG, { szerokosc: 64, xmp: pakietXmp('kompozycja', 'Logo') });
    const xmp = odczytajXmpPng(png)!;
    expect(xmp).toContain('compositeWithTrainedAlgorithmicMedia');
    expect(xmp).toContain('Verris Kreator marki');
    const meta = await sharp(png).metadata();
    expect(meta).toMatchObject({ format: 'png', width: 64, height: 64, hasAlpha: true });
    expect(odczytajXmpPng(await pngZSvg(SVG, { szerokosc: 16 }))).toBeNull();
    expect(() => wstawXmpPng(Buffer.from('nie png'), 'x')).toThrow();
    expect(pakietXmp('brak')).not.toContain('DigitalSourceType');
  });
});

describe('PDF wektorowy', () => {
  it('SVG → strona PDF w mm, wzór i evenodd bez rastra; filtr/zdjęcie wymagają rastra', async () => {
    const doc = await PDFDocument.create();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="85mm" height="55mm" viewBox="0 0 85 55"><defs><pattern id="p" patternUnits="userSpaceOnUse" width="10" height="10"><circle cx="5" cy="5" r="2" fill="#E07A3F"/></pattern></defs>' +
      '<rect width="85" height="55" fill="#1F3A5F"/><rect width="85" height="55" fill="url(#p)"/><path fill-rule="evenodd" fill="#FFFFFF" fill-opacity="0.5" d="M10 10H40V40H10Z M20 20H30V30H20Z"/>' +
      '<path d="M1 1h4" stroke="#000000" stroke-width="0.25" stroke-dasharray="1 1" fill="none"/></svg>';
    expect(wymagaRastra(svg)).toBe(false);
    expect(wymagaRastra('<svg><filter id="c"/></svg>')).toBe(true);
    const page = stronaZSvg(doc, svg, 'mm');
    expect(page.getWidth()).toBeCloseTo((85 * 72) / 25.4, 3);
    expect(page.getHeight()).toBeCloseTo((55 * 72) / 25.4, 3);
    const zapisany = await PDFDocument.load(await doc.save());
    expect(zapisany.getPageCount()).toBe(1);
    expect(parsujSvg('<svg viewBox="0 0 1 1"><g><rect width="1" height="1"/></g></svg>')!.dzieci[0]!.dzieci[0]!.nazwa).toBe('rect');
  });
});

describe('generator plików marki', () => {
  const g = new GeneratorPlikowMarki(napisTestowy());
  const m = markaTestowa();

  it('logo SVG: napis na krzywych (bez <text>), metadane AI, wszystkie układy i warianty z katalogu', async () => {
    for (const p of katalogPlikow(m).filter((x) => x.plik.startsWith('logo-') && x.plik.endsWith('.svg'))) {
      const w = (await g.plik(m, p.plik))!;
      const svg = w.dane.toString();
      expect(svg, p.plik).toMatch(/^<svg/);
      expect(svg, p.plik).not.toContain('<text');
      expect(svg, p.plik).toContain('compositeWithTrainedAlgorithmicMedia');
    }
  });

  it('PDF: logo (4 warianty + kolory z CMYK), wizytówka ze spadem i liniami cięcia, księga – otwierają się w pdf-lib z metadanymi', async () => {
    const logo = await PDFDocument.load((await g.plik(m, 'logo.pdf'))!.dane);
    expect(logo.getPageCount()).toBe(5);
    expect(logo.getSubject()).toMatch(/CMYK/);
    expect(logo.catalog.get(PDFName.of('Metadata'))).toBeDefined();
    const wiz = await PDFDocument.load(await g.drukPdf(m, 'wizytowka'));
    expect(wiz.getPageCount()).toBe(2);
    // 85 mm + 2 × (spad 3 mm + pas linii cięcia 6 mm)
    expect(wiz.getPage(0).getWidth()).toBeCloseTo(((85 + 18) * 72) / 25.4, 1);
    const ksiega = await PDFDocument.load(await g.ksiegaPdf(m, { data: '19.11.2026' }));
    expect(ksiega.getPageCount()).toBeGreaterThanOrEqual(8);
    expect(ksiega.getTitle()).toContain('księga znaku');
  }, 60_000);

  it('favicon.ico, ikony, manifest, stopka, kroje z OFL', async () => {
    const ico = (await g.plik(m, 'favicon.ico'))!;
    expect(ico.dane.readUInt16LE(4)).toBe(3);
    const ikona = (await g.plik(m, 'icon-512.png'))!;
    expect((await sharp(ikona.dane).metadata()).width).toBe(512);
    expect(JSON.parse((await g.plik(m, 'site.webmanifest'))!.dane.toString())).toMatchObject({ name: 'Łódka i Wiosło' });
    const stopka = (await g.plik(m, 'stopka-email.html', { logoStopkiUrl: 'https://api.verris.pl/kreator-marki/p/x/logo-stopka.png' }))!.dane.toString();
    expect(stopka).toContain('<table');
    expect(stopka).toContain('https://api.verris.pl/kreator-marki/p/x/logo-stopka.png');
    const kroje = (await g.plik(m, 'kroje.zip'))!.dane;
    const tekst = kroje.toString('latin1');
    expect(tekst).toContain('OFL.txt');
    expect(tekst).toContain('hanken-grotesk-700-latin-ext.woff2');
  });

  it('materiały KV: PNG social w natywnym rozmiarze, podgląd bez Pakietu ze znakiem wodnym i ≤ 720 px', async () => {
    const post = (await g.materialPng(m, 'post'))!;
    expect((await sharp(post).metadata()).width).toBe(1080);
    const podglad = (await g.materialPng(m, 'post', { podglad: true }))!;
    expect((await sharp(podglad).metadata()).width).toBe(720);
    const svg = (await g.materialSvg(m, 'post', { podglad: true }))!.svg;
    expect(svg).not.toContain('<text');
    expect(svg).toContain('fill-opacity="0.45"');
  }, 30_000);

  it('eksport ZIP: tylko dostępne pliki, PNG w trzech szerokościach, CZYTAJ.txt z TMview', async () => {
    const dostepne = new Set(['logo-poziome-kolor.svg', 'logo-poziome-kolor.png', 'favicon.svg']);
    const z = await g.eksportZip(m, dostepne);
    const t = z.toString('latin1');
    for (const n of ['logo/svg/logo-poziome-kolor.svg', 'logo/png/logo-poziome-kolor-500px.png', 'logo/png/logo-poziome-kolor-2000px.png', 'ikony/favicon.svg', 'CZYTAJ.txt']) expect(t).toContain(n);
    expect(t).not.toContain('wizytowka.pdf');
    expect((await zip([{ nazwa: 'a.txt', dane: Buffer.from('a') }])).subarray(0, 2).toString()).toBe('PK');
  }, 30_000);
});

describe('katalog plików i blokady', () => {
  const m = markaTestowa();

  it('próba – wszystko PROBA; hosting – KV i druk wymagają Pakietu; Pakiet bez TMview – druk zablokowany', () => {
    expect(listaPlikow(m, 'proba', true).every((p) => p.blokada === 'PROBA' && !p.dostepny)).toBe(true);
    const hosting = listaPlikow(m, 'hosting', false);
    expect(hosting.find((p) => p.plik === 'logo-poziome-kolor.svg')).toMatchObject({ dostepny: true });
    expect(hosting.find((p) => p.plik === 'post.png')).toMatchObject({ dostepny: false, blokada: 'PAKIET_WYMAGANY', material: 'post' });
    expect(hosting.find((p) => p.plik === 'logo.pdf')).toMatchObject({ blokada: 'TMVIEW_WYMAGANY' });
    const pakiet = listaPlikow(m, 'pakiet', false);
    expect(pakiet.find((p) => p.plik === 'wizytowka.pdf')?.blokada).toBe('TMVIEW_WYMAGANY');
    expect(pakiet.find((p) => p.plik === 'ksiega-znaku.pdf')?.dostepny).toBe(true);
    expect(listaPlikow(m, 'pakiet', true).every((p) => p.dostepny)).toBe(true);
    expect(blokadaPliku(katalogPlikow(m)[0]!, 'hosting', false)).toBeUndefined();
  });

  it('układy plików: marka bez znaku – sam napis; wgrane logo – samo logo', () => {
    expect(katalogPlikow(markaTestowa({ projekt: { ...m.projekt, sygnet: { typ: 'brak' }, uklad: 'napis' } })).filter((p) => p.grupa === 'logo').every((p) => p.plik.startsWith('logo-napis-'))).toBe(true);
    expect(katalogPlikow(markaTestowa({ zrodlo: 'wgrane' })).filter((p) => p.grupa === 'logo').every((p) => p.plik.startsWith('logo-sygnet-'))).toBe(true);
  });

  // Paczka 134 (decyzja 19.11): wykupione pliki zawsze dostępne – Pakiet wygrywa z brakiem hostingu i z próbą.
  const bazaLimitow = (pakiet: boolean) => {
    const zakup = { id: 'z1', serie: 10, zmianyAi: 300, serieUzyte: 4, zmianyAiUzyte: 20, aktualizacjeDo: null, oplaconoAt: new Date('2026-10-01') };
    return {
      kreatorMarkaZakup: { findMany: vi.fn(async () => (pakiet ? [zakup] : [])), count: vi.fn(async () => 0), updateMany: vi.fn(async () => ({ count: 1 })) },
      kreatorMarka: { count: vi.fn(async () => 1) },
      kreatorMarkaZuzycie: { findUnique: vi.fn(async () => ({ serie: 2, zmianyAi: 7 })), upsert: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 1 })) },
      subscription: { count: vi.fn(async () => 0) },
    };
  };
  const konf = DOMYSLNA_KONFIGURACJA_MARKI;

  it('stanLimitow: Pakiet bez hostingu – wersja „pakiet”, limity tylko z puli Pakietu (bez miesięcznych w cenie hostingu)', async () => {
    const l = await stanLimitow(bazaLimitow(true) as never, 'u1', konf, null);
    expect(l.wersja).toBe('pakiet');
    expect(l.pakietKupiony).toBe(true);
    expect(l.serie).toEqual({ uzyte: 4, limit: 10 });
    expect(l.zmianyAi).toEqual({ uzyte: 20, limit: 300 });
    expect(l.marki).toEqual({ uzyte: 1, limit: konf.wCenieHostingu.marek });
  });

  it('stanLimitow: Pakiet w okresie próbnym – „pakiet”; bez Pakietu: próba i brak hostingu – „proba”, płatny – „hosting”', async () => {
    expect((await stanLimitow(bazaLimitow(true) as never, 'u1', konf, 'proba')).wersja).toBe('pakiet');
    expect((await stanLimitow(bazaLimitow(false) as never, 'u1', konf, 'proba')).wersja).toBe('proba');
    expect((await stanLimitow(bazaLimitow(false) as never, 'u1', konf, null)).wersja).toBe('proba');
    const hosting = await stanLimitow(bazaLimitow(false) as never, 'u1', konf, 'hosting');
    expect(hosting.wersja).toBe('hosting');
    expect(hosting.serie).toEqual({ uzyte: 2, limit: konf.wCenieHostingu.seriiMies });
  });

  it('rezerwuj bez hostingu: od razu z puli Pakietu, bez licznika miesięcznego w cenie hostingu', async () => {
    const db = bazaLimitow(true);
    expect(await rezerwuj(db as never, 'u1', 'zmianyAi', konf, null)).toEqual({ zrodlo: 'pakiet', zakupId: 'z1', pole: 'zmianyAi' });
    expect(db.kreatorMarkaZuzycie.updateMany).not.toHaveBeenCalled();
    expect(await rezerwuj(db as never, 'u1', 'zmianyAi', konf, 'hosting')).toMatchObject({ zrodlo: 'miesiac' });
  });

  it('klucz branży: małe litery, bez polskich znaków i interpunkcji', () => {
    expect(kluczBranzy('  Księgowość, Biuro  Rachunkowe ')).toBe('ksiegowosc biuro rachunkowe');
    expect(kluczBranzy('Łódź – gastronomia')).toBe('lodz gastronomia');
  });
});
