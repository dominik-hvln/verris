import * as archiver from 'archiver';
import { PDFDocument, PDFName } from 'pdf-lib';
import {
  IKONY_APLIKACJI,
  KATALOG_FONTOW,
  PROPORCJE,
  ROZMIARY_ICO,
  WYMIARY_SOCIAL,
  cmykOrientacyjnie,
  faviconSvg,
  formatCmyk,
  ikonaSvg,
  kafelWzoruSvg,
  koloryKv,
  kvBanerLinkedin,
  kvNaklejka,
  kvOkladkaFacebook,
  kvPapierFirmowy,
  kvPost,
  kvStory,
  kvWizytowka,
  kvZaproszenieTeams,
  manifestAplikacji,
  plikFontu,
  rozstrzelenieNapisu,
  rysujSygnet,
  stopkaEmailHtml,
  stronyKsiegi,
  tekstPodpisu,
  wierszeNapisu,
  zlozLogo,
  zrodloMetadanych,
  type KsztaltyKv,
  type Marka,
  type MaterialKv,
  type MaterialSvg,
  type UkladLogo,
  type WariantKoloru,
  type WejscieKv,
  type ZlozoneLogo,
} from '@verris/kreator';
import { escXml, NapisMarkiService } from './napis-marki.js';
import { MM_NA_PT, stronaZSvg, svgWProstokacie, wymagaRastra } from './pdf-svg.js';
import { pakietXmp, pngZSvg, zlozIco } from './pliki-graficzne.js';
import { katalogPlikow, NAZWY_UKLADOW, NAZWY_WARIANTOW, SZEROKOSCI_PNG_LOGO, ukladyMarki, WARIANTY_PLIKOW, type OpisPliku } from './dane-marki.js';
import { TEKST_OFL } from './ofl.js';

/**
 * Kreator marki (paczka 131) – pliki marki z modelu `Marka` (deterministycznie, bez przechowywania): logo SVG na krzywych
 * (układy × warianty) z metadanymi AI, PNG (sharp, przezroczyste, XMP), PDF wektorowe (pdf-lib – logo, wizytówka ze
 * spadem i liniami cięcia, papier firmowy, naklejka, księga znaku; kolory RGB z odpowiednikami CMYK w opisie),
 * favicon.ico/svg, ikony i manifest, wzór, materiały KV, kroje OFL z licencją, stopka e-mail, ZIP (archiver, MIT).
 */

export interface WynikPliku {
  dane: Buffer;
  typ: string;
  nazwa: string;
}

export interface KontekstPlikow {
  /** Zdjęcie KV jako data URI (kopia z biblioteki konta) – nigdy w logo. */
  zdjecieUrl?: string;
  /** Adres https logo PNG do stopki e-mail (plik publiczny pod nieodgadywalnym adresem). */
  logoStopkiUrl?: string;
  /** Data wydania księgi (np. „19.11.2026”). */
  data?: string;
  /** Znak wodny „podgląd” na materiałach (konto bez Pakietu ogląda materiały, ale ich nie pobiera). */
  podglad?: boolean;
}

const r2 = (x: number) => String(Math.round(x * 100) / 100);
const tytulMarki = (m: Marka) => m.brief.nazwa;

export class GeneratorPlikowMarki {
  constructor(private readonly napis: NapisMarkiService) {}

  /** Kształty napisu marki (wiersze nazwy, podpis) – dokładnie te teksty, które składa `zlozLogo`. */
  async ksztalty(m: Marka): Promise<KsztaltyKv> {
    const n = m.projekt.napis;
    const [w1, w2] = wierszeNapisu(m.brief.nazwa, n.styl);
    const rozs = rozstrzelenieNapisu(n);
    const [napis, napis2, podpis] = await Promise.all([
      w1 ? this.napis.ksztaltuj(w1, n.font, n.waga, rozs) : null,
      w2 ? this.napis.ksztaltuj(w2, n.font, n.waga, rozs) : null,
      m.brief.podpis?.trim() ? this.napis.ksztaltuj(tekstPodpisu(m.brief.podpis), m.projekt.fonty.tekst, 600, PROPORCJE.podpisRozstrzelenie * 1000) : null,
    ]);
    return { napis, napis2, podpis };
  }

  /** Logo SVG z napisem na krzywych (gdy krój niedostępny – `<text>`, plik i tak poprawny). */
  async logo(m: Marka, uklad: UkladLogo, wariant: WariantKoloru, o: { metadane?: boolean; ksztalty?: KsztaltyKv; wysokoscPx?: number; tlo?: boolean } = {}): Promise<ZlozoneLogo> {
    const k = o.ksztalty ?? (await this.ksztalty(m));
    return zlozLogo(m.projekt, m.brief.nazwa, m.brief.podpis, {
      uklad,
      wariant,
      napis: k.napis,
      napis2: k.napis2,
      podpis: k.podpis,
      metadaneAi: o.metadane !== false,
      wysokoscPx: o.wysokoscPx,
      tlo: o.tlo,
    });
  }

  /** Wnętrze faviconu (viewBox 0 0 100 100): sygnet w wariancie „favicon”, a marka bez znaku – pierwsza litera nazwy. */
  async wnetrzeFavicon(m: Marka): Promise<string> {
    const s = rysujSygnet(m.projekt.sygnet, { wariant: 'favicon', nazwa: m.brief.nazwa });
    if (s) return s;
    const litera = [...m.brief.nazwa.trim()].find((c) => /\p{L}|\p{N}/u.test(c))?.toLocaleUpperCase('pl-PL') ?? 'A';
    const k = await this.napis.ksztaltuj(litera, m.projekt.napis.font, Math.max(600, m.projekt.napis.waga), 0);
    if (!k || !k.szerokosc) return `<rect x="20" y="20" width="60" height="60" rx="12" fill="currentColor"/>`;
    const skala = Math.min(76 / k.wysokoscWersalikow, 76 / k.szerokosc);
    const dx = 50 - (k.szerokosc * skala) / 2;
    const dy = 50 + (k.wysokoscWersalikow * skala) / 2;
    return `<path fill="currentColor" transform="translate(${r2(dx)} ${r2(dy)}) scale(${skala.toFixed(5)})" d="${k.d}"/>`;
  }

  async faviconSvg(m: Marka): Promise<string> {
    return faviconSvg(await this.wnetrzeFavicon(m), m.projekt.kolory);
  }

  private xmp(m: Marka, tytul?: string): string {
    return pakietXmp(zrodloMetadanych(m.projekt.sygnet), tytul);
  }

  /** Wejście szablonów KV (kształty napisu marki, zdjęcie z biblioteki konta). */
  private async wejscieKv(m: Marka, kontekst: KontekstPlikow): Promise<WejscieKv> {
    return { marka: m, ksztalty: await this.ksztalty(m), ...(kontekst.zdjecieUrl ? { zdjecieUrl: kontekst.zdjecieUrl } : {}) };
  }

  /** SVG materiału KV z napisami na krzywych (podgląd i pliki). Wizytówka – przód (tył w PDF). */
  async materialSvg(m: Marka, material: MaterialKv, kontekst: KontekstPlikow = {}): Promise<{ svg: string; jednostka: 'px' | 'mm' } | null> {
    const we = await this.wejscieKv(m, kontekst);
    let wynik: { svg: string; jednostka: 'px' | 'mm' } | null;
    switch (material) {
      case 'post':
      case 'story':
      case 'okladka-facebook':
      case 'baner-linkedin':
      case 'zaproszenie-teams': {
        const f = { post: kvPost, story: kvStory, 'okladka-facebook': kvOkladkaFacebook, 'baner-linkedin': kvBanerLinkedin, 'zaproszenie-teams': kvZaproszenieTeams }[material];
        wynik = { svg: f(we).svg, jednostka: 'px' };
        break;
      }
      case 'wizytowka':
        wynik = { svg: kvWizytowka(we).przod.svg, jednostka: 'mm' };
        break;
      case 'papier-firmowy':
        wynik = { svg: kvPapierFirmowy(we).svg, jednostka: 'mm' };
        break;
      case 'naklejka':
        wynik = { svg: kvNaklejka(we).svg, jednostka: 'mm' };
        break;
      case 'wzor': {
        const k = koloryKv(m);
        const kafel = kafelWzoruSvg(rysujSygnet(m.projekt.sygnet, { nazwa: m.brief.nazwa }), m.kv.wzor === 'bez' ? 'rzadki' : m.kv.wzor, k.akcent, k.tlo);
        wynik = kafel ? { svg: kafel.svg, jednostka: 'px' } : null;
        break;
      }
      case 'favicon':
        wynik = { svg: await this.faviconSvg(m), jednostka: 'px' };
        break;
      default:
        wynik = null;
    }
    if (!wynik) return null;
    let svg = await this.napis.tekstNaKrzywe(wynik.svg);
    if (kontekst.podglad) svg = await this.napis.tekstNaKrzywe(znakWodny(svg, m.projekt.fonty.tekst));
    return { svg, jednostka: wynik.jednostka };
  }

  /** PNG materiału: social w natywnym rozmiarze, druk – 1200 px szerokości; podgląd ≤ 720 px. */
  async materialPng(m: Marka, material: MaterialKv, kontekst: KontekstPlikow = {}): Promise<Buffer | null> {
    const s = await this.materialSvg(m, material, kontekst);
    if (!s) return null;
    const natywna = material in WYMIARY_SOCIAL ? WYMIARY_SOCIAL[material as keyof typeof WYMIARY_SOCIAL][0] : material === 'wzor' ? 600 : material === 'favicon' ? 256 : 1200;
    const szer = kontekst.podglad ? Math.min(720, natywna) : natywna;
    return pngZSvg(s.svg, { szerokosc: szer, xmp: this.xmp(m, `${tytulMarki(m)} – ${material}`) });
  }

  // ───────────────────────── PDF ─────────────────────────

  private async nowyPdf(m: Marka, tytul: string): Promise<PDFDocument> {
    const doc = await PDFDocument.create();
    const k = m.projekt.kolory;
    const opisKoloru = (nazwa: string, hex: string) => `${nazwa} ${hex} (≈ ${formatCmyk(cmykOrientacyjnie(hex))})`;
    doc.setTitle(tytul);
    doc.setSubject(
      `Kolory RGB z orientacyjnymi odpowiednikami CMYK: ${opisKoloru('główny', k.glowny)}, ${opisKoloru('akcent', k.akcent)}, ${opisKoloru('akcent jasny', k.akcentJasny)}. Drukarnia przelicza kolory swoim profilem – poproś o próbę koloru.`,
    );
    doc.setKeywords(['Verris Kreator marki', m.brief.nazwa]);
    doc.setCreator('Verris Kreator marki');
    doc.setProducer('Verris Kreator marki (pdf-lib)');
    const xmp = this.xmp(m, tytul);
    const strumien = doc.context.flateStream(xmp, { Type: 'Metadata', Subtype: 'XML' });
    doc.catalog.set(PDFName.of('Metadata'), doc.context.register(strumien));
    return doc;
  }

  /** Strona PDF z SVG; elementy niewektorowe (cień, zdjęcie, gradient) – jako obraz PNG 300 dpi. */
  private async stronaPdf(doc: PDFDocument, svg: string, jednostka: 'mm' | 'px'): Promise<void> {
    const naKrzywych = await this.napis.tekstNaKrzywe(svg);
    if (!wymagaRastra(naKrzywych)) {
      stronaZSvg(doc, naKrzywych, jednostka);
      return;
    }
    const vb = /viewBox="([^"]+)"/.exec(naKrzywych)?.[1]?.split(/\s+/).map(Number) ?? [0, 0, 100, 100];
    const k = jednostka === 'mm' ? MM_NA_PT : 0.75;
    const page = doc.addPage([vb[2]! * k, vb[3]! * k]);
    const png = await pngZSvg(naKrzywych, { szerokosc: Math.min(4096, Math.round(jednostka === 'mm' ? (vb[2]! / 25.4) * 300 : vb[2]! * 2)) });
    const obraz = await doc.embedPng(png);
    page.drawImage(obraz, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }

  async logoPdf(m: Marka): Promise<Buffer> {
    const doc = await this.nowyPdf(m, `${tytulMarki(m)} – logo`);
    const ksztalty = await this.ksztalty(m);
    const k = m.projekt.kolory;
    const uklad = ukladyMarki(m)[0]!;
    for (const w of WARIANTY_PLIKOW) {
      const z = await this.logo(m, uklad, w, { ksztalty, metadane: false, tlo: false });
      // strona: logo 120 mm szerokości (albo 60 mm wysokości) z marginesem 15 mm; biały i negatyw – na kolorze głównym
      const s = Math.min(120 / z.szerokosc, 60 / z.wysokosc);
      const W = z.szerokosc * s + 30;
      const H = z.wysokosc * s + 30;
      const tlo = w === 'bialy' || w === 'negatyw' ? `<rect width="${r2(W)}" height="${r2(H)}" fill="${k.glowny}"/>` : '';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(W)}mm" height="${r2(H)}mm" viewBox="0 0 ${r2(W)} ${r2(H)}">${tlo}${zagniezdz(z.svg, 15, 15, W - 30, H - 30)}</svg>`;
      await this.stronaPdf(doc, svg, 'mm');
    }
    // strona kolorów: próbki, HEX, RGB, CMYK orientacyjnie
    const kolory: [string, string][] = [['Kolor główny', k.glowny], ['Akcent', k.akcent], ['Akcent jasny', k.akcentJasny]];
    const fT = m.projekt.fonty.tekst;
    const czesci = [`<rect width="210" height="297" fill="#FFFFFF"/>`, tekstSvg(`${m.brief.nazwa} – kolory marki`, 20, 30, 18, k.glowny, m.projekt.fonty.naglowki, 700)];
    kolory.forEach(([nazwa, hex], i) => {
      const y = 50 + i * 42;
      const n = parseInt(hex.slice(1), 16);
      czesci.push(`<rect x="20" y="${y}" width="34" height="34" rx="2" fill="${hex}" stroke="#D0D5DD" stroke-width="0.2"/>`);
      czesci.push(tekstSvg(nazwa, 62, y + 8, 4.2, '#1F2937', fT, 600));
      czesci.push(tekstSvg(`HEX ${hex}   RGB ${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`, 62, y + 16, 3.4, '#374151', fT, 400));
      czesci.push(tekstSvg(`CMYK orientacyjnie ${formatCmyk(cmykOrientacyjnie(hex))}`, 62, y + 23, 3.4, '#374151', fT, 400));
    });
    const uwagi = [
      'Kolory w pliku są zapisane w RGB. Odpowiedniki CMYK są orientacyjne – drukarnia przelicza kolory',
      'swoim profilem (np. ISO Coated v2). Przed większym nakładem poproś o próbę koloru.',
      'Znak przygotowano w Verris Kreator marki z pomocą AI. Przed rejestracją albo drukiem sprawdź',
      'podobne znaki w bazie TMview (tmdn.org/tmview) – to nie jest badanie prawne.',
    ];
    uwagi.forEach((t, i) => czesci.push(tekstSvg(t, 20, 190 + i * 6, 3.2, '#4B5563', fT, 400)));
    await this.stronaPdf(doc, `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">${czesci.join('')}</svg>`, 'mm');
    return Buffer.from(await doc.save());
  }

  async drukPdf(m: Marka, material: 'wizytowka' | 'papier-firmowy' | 'naklejka', kontekst: KontekstPlikow = {}): Promise<Buffer> {
    const we = await this.wejscieKv(m, kontekst);
    const tytuly = { wizytowka: 'wizytówka', 'papier-firmowy': 'papier firmowy', naklejka: 'naklejka' } as const;
    const doc = await this.nowyPdf(m, `${tytulMarki(m)} – ${tytuly[material]}`);
    const strony: MaterialSvg[] = material === 'wizytowka' ? (({ przod, tyl }) => [przod, tyl])(kvWizytowka(we)) : material === 'papier-firmowy' ? [kvPapierFirmowy(we)] : [kvNaklejka(we)];
    for (const s of strony) await this.stronaPdf(doc, s.svg, 'mm');
    return Buffer.from(await doc.save());
  }

  async ksiegaPdf(m: Marka, kontekst: KontekstPlikow = {}): Promise<Buffer> {
    const doc = await this.nowyPdf(m, `${tytulMarki(m)} – księga znaku`);
    const ksztalty = await this.ksztalty(m);
    const strony = stronyKsiegi(m, { ksztalty, data: kontekst.data, wersja: '1.0' });
    const PT = 0.3528;
    for (const s of strony) {
      const page = doc.addPage([210 * MM_NA_PT, 297 * MM_NA_PT]);
      const wektor: string[] = [];
      const rastry: { svg: string; x: number; y: number; w: number; h: number }[] = [];
      for (const b of s.bloki) {
        if (b.typ === 'prostokat') {
          if (b.kolor === 'none' && !b.obrys) continue;
          wektor.push(
            `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}"${b.promien ? ` rx="${b.promien}"` : ''} fill="${b.kolor === 'none' ? 'none' : b.kolor}"${b.obrys ? ` stroke="${b.obrys}" stroke-width="0.25"${b.przerywany ? ' stroke-dasharray="1 0.8"' : ''}` : ''}/>`,
          );
        } else if (b.typ === 'svg') {
          const svg = await this.napis.tekstNaKrzywe(b.svg);
          if (wymagaRastra(svg)) rastry.push({ svg, x: b.x, y: b.y, w: b.w, h: b.h });
          else wektor.push(zagniezdz(svg, b.x, b.y, b.w, b.h));
        } else {
          const rozmiar = b.rozmiar * PT;
          const L = b.font === 'naglowki' ? 1.15 : 1.35;
          const font = b.font === 'naglowki' ? m.projekt.fonty.naglowki : m.projekt.fonty.tekst;
          b.wiersze.forEach((w, i) => {
            if (!w.trim()) return;
            const baza = b.y + i * L * rozmiar + ((L - 1.2) / 2) * rozmiar + 0.93 * rozmiar;
            wektor.push(tekstSvg(w, b.x, baza, rozmiar, b.kolor, font, b.waga, b.wyrownanie === 'prawo' ? 'end' : b.wyrownanie === 'srodek' ? 'middle' : undefined));
          });
        }
      }
      const svg = await this.napis.tekstNaKrzywe(`<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">${wektor.join('')}</svg>`);
      svgWProstokacie(doc, page, svg, 0, 0, 210, 297);
      for (const r of rastry) {
        const png = await pngZSvg(r.svg, { szerokosc: Math.round((r.w / 25.4) * 300) });
        const obraz = await doc.embedPng(png);
        page.drawImage(obraz, { x: r.x * MM_NA_PT, y: page.getHeight() - (r.y + r.h) * MM_NA_PT, width: r.w * MM_NA_PT, height: r.h * MM_NA_PT });
      }
    }
    return Buffer.from(await doc.save());
  }

  // ───────────────────────── kroje ─────────────────────────

  /** Pliki krojów marki (napis, nagłówki, tekst – wszystkie wagi z katalogu, latin i latin-ext) + OFL.txt. */
  async krojeZip(m: Marka): Promise<Buffer> {
    const rodziny = [...new Set([m.projekt.napis.font, m.projekt.fonty.naglowki, m.projekt.fonty.tekst])];
    const pliki: { nazwa: string; dane: Buffer }[] = [];
    for (const r of rodziny) {
      const f = KATALOG_FONTOW.find((x) => x.rodzina === r);
      if (!f) continue;
      for (const w of f.wagi) {
        for (const z of ['latin', 'latin-ext'] as const) {
          const nazwa = plikFontu(r, w, false, z);
          const p = await this.napis.plikKroju(nazwa);
          if (p) pliki.push({ nazwa, dane: p });
        }
      }
    }
    const readme = [
      `Kroje pisma marki ${m.brief.nazwa}: ${rodziny.join(', ')}.`,
      '',
      'Pliki pochodzą z Google Fonts (format WOFF2 – do stron internetowych; do programów graficznych pobierz',
      'pełne pliki TTF/OTF ze strony rodziny w Google Fonts). Kroje są udostępniane na licencji SIL Open Font',
      'License 1.1 (plik OFL.txt) – możesz ich używać, także komercyjnie, ale nie wolno sprzedawać samych krojów.',
      'Informacje o autorach i prawach autorskich są zapisane w plikach krojów.',
    ].join('\n');
    return zip([...pliki.map((p) => ({ nazwa: p.nazwa, dane: p.dane })), { nazwa: 'OFL.txt', dane: Buffer.from(TEKST_OFL) }, { nazwa: 'CZYTAJ.txt', dane: Buffer.from(readme) }]);
  }

  stopkaHtml(m: Marka, logoUrl?: string, wymiary?: { szer: number; wys: number }): string {
    return stopkaEmailHtml({
      nazwa: m.brief.nazwa,
      kolory: m.projekt.kolory,
      kontakt: m.kontakt,
      ...(logoUrl ? { logoUrl, logoSzer: wymiary?.szer, logoWys: wymiary?.wys } : {}),
      font: m.projekt.fonty.tekst,
    });
  }

  /** Logo do stopki e-mail: poziome w kolorze, wyświetlane w 48 px wysokości (plik 2× dla ekranów retina). */
  async logoStopki(m: Marka): Promise<{ png: Buffer; szer: number; wys: number }> {
    const uklad = ukladyMarki(m)[0]!;
    const z = await this.logo(m, uklad, 'kolor', { metadane: false });
    const wys = 48;
    const szer = Math.min(240, Math.round((z.szerokosc / z.wysokosc) * wys));
    const png = await pngZSvg(z.svg, { szerokosc: szer * 2, wysokosc: wys * 2, xmp: this.xmp(m, `${tytulMarki(m)} – logo`) });
    return { png, szer, wys };
  }

  /** Obraz OG 1200 × 630 (podgląd linku na stronie z Kreatora stron): logo poziome na tle palety marki. */
  async obrazOg(m: Marka): Promise<Buffer> {
    const uklad = ukladyMarki(m)[0]!;
    const z = await this.logo(m, uklad, 'kolor', { metadane: false });
    const k = m.projekt.kolory;
    const s = Math.min(900 / z.szerokosc, 300 / z.wysokosc);
    const w = z.szerokosc * s;
    const h = z.wysokosc * s;
    const wn = zagniezdz(z.svg, (1200 - w) / 2, (630 - h) / 2, w, h);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${k.paleta.tlo}"/><rect y="610" width="1200" height="20" fill="${k.akcent}"/>${wn}</svg>`;
    return pngZSvg(svg, { szerokosc: 1200, wysokosc: 630, xmp: this.xmp(m, `${tytulMarki(m)} – obraz do udostępniania`) });
  }

  // ───────────────────────── pojedynczy plik ─────────────────────────

  /** Plik z katalogu (`katalogPlikow`) – null, gdy nazwy nie ma w katalogu tej marki. */
  async plik(m: Marka, nazwa: string, kontekst: KontekstPlikow = {}, ksztalty?: KsztaltyKv): Promise<WynikPliku | null> {
    const opis = katalogPlikow(m).find((p) => p.plik === nazwa);
    if (!opis) return null;
    const dane = await this.dane(m, opis, kontekst, ksztalty);
    return dane ? { dane, typ: opis.typ, nazwa } : null;
  }

  private async dane(m: Marka, p: OpisPliku, kontekst: KontekstPlikow, ksztalty?: KsztaltyKv): Promise<Buffer | null> {
    const logo = /^logo-([a-z]+)-([a-z]+)\.(svg|png)$/.exec(p.plik);
    if (logo) {
      const uklad = (Object.entries(NAZWY_UKLADOW).find(([, v]) => v === logo[1])?.[0] ?? 'poziomy') as UkladLogo;
      const wariant = (Object.entries(NAZWY_WARIANTOW).find(([, v]) => v === logo[2])?.[0] ?? 'kolor') as WariantKoloru;
      const z = await this.logo(m, uklad, wariant, { ksztalty });
      if (logo[3] === 'svg') return Buffer.from(z.svg);
      return pngZSvg(z.svg, { szerokosc: SZEROKOSCI_PNG_LOGO[SZEROKOSCI_PNG_LOGO.length - 1], xmp: this.xmp(m, `${tytulMarki(m)} – logo`) });
    }
    switch (p.plik) {
      case 'logo.pdf':
        return this.logoPdf(m);
      case 'favicon.svg':
        return Buffer.from(await this.faviconSvg(m));
      case 'favicon.ico': {
        const svg = await this.faviconSvg(m);
        const obrazy = await Promise.all(ROZMIARY_ICO.map(async (r) => ({ rozmiar: r, png: await pngZSvg(svg, { szerokosc: r, wysokosc: r }) })));
        return zlozIco(obrazy);
      }
      case 'site.webmanifest':
        return Buffer.from(manifestAplikacji(m.brief.nazwa, m.projekt.kolory));
      case 'kroje.zip':
        return this.krojeZip(m);
      case 'stopka-email.html':
        return Buffer.from(this.stopkaHtml(m, kontekst.logoStopkiUrl, { szer: 120, wys: 48 }));
      case 'wzor.svg':
        return Buffer.from((await this.materialSvg(m, 'wzor', kontekst))?.svg ?? '');
      case 'ksiega-znaku.pdf':
        return this.ksiegaPdf(m, kontekst);
      case 'wizytowka.pdf':
      case 'papier-firmowy.pdf':
      case 'naklejka.pdf':
        return this.drukPdf(m, p.material as 'wizytowka' | 'papier-firmowy' | 'naklejka', kontekst);
      default:
        break;
    }
    const ikona = IKONY_APLIKACJI.find((i) => i.plik === p.plik);
    if (ikona) return pngZSvg(ikonaSvg(await this.wnetrzeFavicon(m), m.projekt.kolory, ikona), { szerokosc: ikona.rozmiar, wysokosc: ikona.rozmiar });
    if (p.material && p.typ === 'image/png') return this.materialPng(m, p.material, kontekst);
    return null;
  }

  /**
   * Eksport ZIP: dostępne pliki w katalogach (logo/svg, logo/png – trzy szerokości, druk, ikony, kv, kroje, stopka)
   * + CZYTAJ.txt (prawa, TMview, CMYK, AI). `dostepne` – nazwy plików bez blokady.
   */
  async eksportZip(m: Marka, dostepne: Set<string>, kontekst: KontekstPlikow = {}): Promise<Buffer> {
    const ksztalty = await this.ksztalty(m);
    const wpisy: { nazwa: string; dane: Buffer }[] = [];
    const katalog: Record<OpisPliku['grupa'], string> = { logo: 'logo', ikony: 'ikony', kv: 'materialy', druk: 'druk', kroje: 'kroje', stopka: 'stopka-email' };
    for (const p of katalogPlikow(m)) {
      if (!dostepne.has(p.plik)) continue;
      const logo = /^logo-([a-z]+)-([a-z]+)\.png$/.exec(p.plik);
      if (logo) {
        const uklad = (Object.entries(NAZWY_UKLADOW).find(([, v]) => v === logo[1])?.[0] ?? 'poziomy') as UkladLogo;
        const wariant = (Object.entries(NAZWY_WARIANTOW).find(([, v]) => v === logo[2])?.[0] ?? 'kolor') as WariantKoloru;
        const z = await this.logo(m, uklad, wariant, { ksztalty });
        for (const sz of SZEROKOSCI_PNG_LOGO) {
          wpisy.push({ nazwa: `logo/png/${p.plik.replace(/\.png$/, `-${sz}px.png`)}`, dane: await pngZSvg(z.svg, { szerokosc: sz, xmp: this.xmp(m, `${tytulMarki(m)} – logo`) }) });
        }
        continue;
      }
      const d = await this.dane(m, p, kontekst, ksztalty);
      if (!d) continue;
      const podkatalog = p.grupa === 'logo' ? 'logo/svg' : katalog[p.grupa];
      wpisy.push({ nazwa: `${podkatalog}/${p.plik}`, dane: d });
    }
    wpisy.push({ nazwa: 'CZYTAJ.txt', dane: Buffer.from(czytajEksport(m)) });
    return zip(wpisy);
  }
}

/** Samodzielny SVG jako zagnieżdżony `<svg>` w prostokącie (viewBox zostaje – proporcje „meet”). */
export function zagniezdz(svg: string, x: number, y: number, w: number, h: number): string {
  return svg
    .trim()
    .replace(/^<svg\b([^>]*)>/, (_x, a: string) => `<svg${a.replace(/\s(x|y|width|height|xmlns)="[^"]*"/g, '')} x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}">`);
}

/** `<text>` do zamiany na krzywe (font z katalogu marki). */
function tekstSvg(t: string, x: number, y: number, rozmiar: number, kolor: string, font: string, waga: number, kotwica?: 'middle' | 'end'): string {
  return `<text x="${r2(x)}" y="${r2(y)}" fill="${kolor}" font-family="'${escXml(font)}', sans-serif" font-weight="${waga}" font-size="${r2(rozmiar)}"${kotwica ? ` text-anchor="${kotwica}"` : ''}>${escXml(t)}</text>`;
}

/** Znak wodny „Podgląd” (materiały Pakietu oglądane bez Pakietu). */
function znakWodny(svg: string, font: string): string {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(/\s+/).map(Number) ?? [0, 0, 100, 100];
  const [x, y, w, h] = vb as [number, number, number, number];
  const rozmiar = Math.min(w, h) * 0.12;
  const t = tekstSvg('PODGLĄD – PAKIET MARKI', x + w / 2, y + h / 2 + rozmiar / 3, rozmiar, '#FFFFFF', font, 700, 'middle').replace('<text ', `<text opacity="0.55" `);
  const pas = `<rect x="${r2(x)}" y="${r2(y + h / 2 - rozmiar)}" width="${r2(w)}" height="${r2(rozmiar * 1.6)}" fill="#111827" fill-opacity="0.45"/>`;
  return svg.replace(/<\/svg>\s*$/, `${pas}${t}</svg>`);
}

function czytajEksport(m: Marka): string {
  const k = m.projekt.kolory;
  return [
    `Marka: ${m.brief.nazwa}`,
    '',
    'Zawartość: logo w układach i wariantach kolorystycznych (SVG – wektor, PNG z przezroczystym tłem), PDF wektorowy,',
    'ikony strony i aplikacji, kroje pisma z licencją SIL OFL 1.1, stopka e-mail, a z Pakietem marki – materiały i pliki do druku.',
    '',
    `Kolory (RGB / CMYK orientacyjnie): główny ${k.glowny} / ${formatCmyk(cmykOrientacyjnie(k.glowny))}, akcent ${k.akcent} / ${formatCmyk(cmykOrientacyjnie(k.akcent))}, akcent jasny ${k.akcentJasny} / ${formatCmyk(cmykOrientacyjnie(k.akcentJasny))}.`,
    'Odpowiedniki CMYK są orientacyjne – drukarnia przelicza kolory swoim profilem. Przed większym nakładem poproś o próbę.',
    '',
    'Znak przygotowano w Verris Kreator marki z pomocą AI (pliki mają metadane „wygenerowano z pomocą AI”).',
    'Przed rejestracją znaku albo drukiem sprawdź podobne znaki w bazie TMview (https://www.tmdn.org/tmview/).',
    'Verris nie sprawdza rejestrów znaków towarowych i nie gwarantuje, że podobnego znaku nikt nie używa – to nie jest badanie prawne.',
    'Prawa do logo i materiałów: licencja z Regulaminu Verris §13b ust. 4–6 (https://panel.verris.pl/legal/terms).',
  ].join('\n');
}

/** ZIP w pamięci (archiver 8 – klasa ZipArchive, jak zip-strony.ts); stała data wpisów = powtarzalny plik. */
export function zip(wpisy: { nazwa: string; dane: Buffer }[]): Promise<Buffer> {
  return new Promise((ok, blad) => {
    const a = new archiver.ZipArchive({ zlib: { level: 9 } });
    const czesci: Buffer[] = [];
    a.on('data', (c: Buffer) => czesci.push(c));
    a.on('error', blad);
    a.on('end', () => ok(Buffer.concat(czesci)));
    for (const w of wpisy) a.append(w.dane, { name: w.nazwa, date: new Date('2026-01-01T00:00:00Z') });
    void a.finalize();
  });
}
