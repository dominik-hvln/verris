import { jezykPodstrony, jezykiStrony, kluczPodstrony, slugBezJezyka } from '../../jezyki.ts';
import type { Obraz, Podstrona, Strona } from '../../model.ts';
import { dopasujDoPlanu } from '../../plany.ts';
import { renderujStrone } from '../../render/index.ts';
import { szerokosciWariantow } from '../../render/obraz.ts';
import { KLASA_ZAKRESU, prefiksKlas } from '../css.ts';
import { bezEncji, maKlase, parsujHtml, tekstWezla, znajdz, type Wezel } from '../html.ts';
import { WERSJA_FORMATU_EKSPORTU, type EksportCms, type MediumCms, type OpcjeEksportu, type PozycjaMenuCms, type StronaCms } from '../model.ts';
import * as b from './bloki.ts';
import { adresLinku, blokZ, blokiTresci, bloki, htmlZPrzestrzenia, TOKEN_MEDIUM, type KontekstKonwersji } from './konwerter.ts';
import { KATALOG_MOTYWU, SZABLON_STRONY, plikiMotywu } from './motyw.ts';

/** Klucz strony w eksporcie: 'glowna' albo 'p-<slug>' (ukośnik → „__”, myślnik w slugu zostaje). */
export function kluczStrony(slug: string): string {
  return slug ? `p-${slug.replace(/\//g, '__')}` : 'glowna';
}

/** Największy wariant jpg do 1600 px – WordPress robi z niego własne rozmiary. */
const MAKS_SZEROKOSC_MEDIUM = 1600;

/** Efekty strony statycznej, których motyw WordPressa nie odtwarza (wymagają skryptu kreatora). */
const EFEKTY_BEZ_ODPOWIEDNIKA: Record<string, string> = {
  karuzela: 'karuzele (zdjęcia i opinie pokazują się jako przewijany pas)',
  lightbox: 'powiększanie zdjęć',
  'przelacznik-cen': 'przełącznik cen miesięcznie/rocznie',
  pojawianie: 'płynne pojawianie sekcji',
  'wejscie-naglowka': 'animowany nagłówek',
  paralaksa: 'paralaksa',
  'postep-czytania': 'pasek postępu czytania',
};

function wszystkieObrazy(x: unknown, wynik: Map<string, Obraz>): Map<string, Obraz> {
  if (Array.isArray(x)) for (const e of x) wszystkieObrazy(e, wynik);
  else if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (typeof o.zasobId === 'string' && typeof o.alt === 'string') wynik.set(o.zasobId, o as unknown as Obraz);
    for (const v of Object.values(o)) wszystkieObrazy(v, wynik);
  }
  return wynik;
}

/** <body>…</body> dokumentu z renderera jako węzły. */
function cialo(dokument: string): Wezel[] {
  const m = /<body[^>]*>([\s\S]*)<\/body>/.exec(dokument);
  if (!m) throw new Error('Render bez <body>');
  return parsujHtml(m[1]!);
}

function trescMain(dokument: string): Wezel[] {
  const main = znajdz(cialo(dokument), (w) => w.tag === 'main');
  if (!main) throw new Error('Render bez <main>');
  const dzieci = (main.dzieci ?? []).filter((w) => !(w.tag === '#text' && !(w.tekst ?? '').trim()));
  // Wpis bloga: <main><article>…</article></main> – treść bez opakowania (szablon daje <main>).
  return dzieci.length === 1 && dzieci[0]!.tag === 'article' ? (dzieci[0]!.dzieci ?? []) : (main.dzieci ?? []);
}

const zZakresem = (w: Wezel): Wezel => ({ ...w, atrybuty: { ...w.atrybuty, class: `${KLASA_ZAKRESU} ${w.atrybuty.class ?? ''}`.trim() }, kolejnosc: w.kolejnosc.includes('class') ? w.kolejnosc : ['class', ...w.kolejnosc] });

/**
 * Nagłówek strony: logo, nawigacja (blok nawigacji – menu z eksportu tworzy importer), telefon i przycisk.
 * Przycisk mobilnego menu renderera pomijamy – blok nawigacji ma własne menu na telefonie.
 */
function naglowekMotywu(w: Wezel, k: KontekstKonwersji): string {
  const wnetrze = znajdz(w.dzieci ?? [], (x) => maKlase(x, 'naglowek-wnetrze'));
  const czesci: string[] = [];
  for (const d of wnetrze?.dzieci ?? []) {
    if (d.tag === '#text') continue;
    if (maKlase(d, 'logo')) czesci.push(b.akapit({ klasa: 'vk-logo-blok' }, htmlZPrzestrzenia([d], k)));
    else if (maKlase(d, 'nav')) czesci.push(b.blok('navigation', { className: 'vk-nawigacja', overlayMenu: 'mobile', layout: { type: 'flex', justifyContent: 'center' } }, null));
    else {
      const blok = blokZ(d, k);
      if (blok) czesci.push(blok);
    }
  }
  const klasaWnetrza = prefiksKlas(wnetrze?.atrybuty.class ?? 'kontener naglowek-wnetrze');
  return b.grupa(
    { tag: 'header', klasa: `${KLASA_ZAKRESU} ${prefiksKlas(w.atrybuty.class ?? 'naglowek')}` },
    b.grupa({ klasa: klasaWnetrza }, czesci.join('\n')),
  );
}

function menuZNaglowka(w: Wezel | null, k: KontekstKonwersji): PozycjaMenuCms[] {
  const nav = w ? znajdz(w.dzieci ?? [], (x) => maKlase(x, 'nav')) : null;
  if (!nav) return [];
  const linki: PozycjaMenuCms[] = [];
  const zbierz = (x: Wezel) => {
    if (x.tag === 'a') {
      const adres = adresLinku(x.atrybuty.href ?? '', k);
      const strona = /^verris-kreator:\/\/strona\/([a-z0-9_-]+)$/.exec(adres)?.[1];
      linki.push({ etykieta: bezEncji(tekstWezla(x)).trim(), adres, ...(strona ? { strona } : {}) });
      return;
    }
    for (const d of x.dzieci ?? []) zbierz(d);
  };
  zbierz(nav);
  return linki;
}

function jsonLdZDokumentu(dokument: string): unknown {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(dokument);
  if (!m) return null;
  const ld = JSON.parse(m[1]!) as { '@context'?: string; '@graph'?: Record<string, unknown>[] };
  // Witryna i firma – wspólne dla wszystkich stron; dane FAQ, produktów i wpisów zależą od podstrony.
  const graf = (ld['@graph'] ?? []).filter((x) => x['@type'] === 'WebSite' || String(x['@id'] ?? '').endsWith('#firma'));
  return { '@context': ld['@context'] ?? 'https://schema.org', '@graph': graf };
}

/**
 * Eksport strony do WordPressa: strony z treścią w blokach, menu, media do importu, motyw blokowy.
 * Strona jest najpierw dopasowana do wersji kreatora (jak publikacja), render jest ten sam co strony statycznej
 * (linki względne zamienione na tokeny stron, zdjęcia z biblioteki na tokeny mediów).
 */
export function eksportujWordpress(wejscie: Strona, opcje: OpcjeEksportu): EksportCms {
  const data = opcje.dataGeneracji ? new Date(opcje.dataGeneracji) : new Date();
  const { strona: s } = dopasujDoPlanu(wejscie, opcje.wersja);
  const wynik = renderujStrone(wejscie, {
    wersja: opcje.wersja,
    tryb: 'publikacja',
    bazaFontow: 'fonts',
    dataGeneracji: data.toISOString(),
    ...(opcje.adresFormularza ? { adresFormularza: opcje.adresFormularza } : {}),
    adresZasobu: (id, szer, format) => `${TOKEN_MEDIUM}${id}/${szer}.${format}`,
  });
  const plik = (sciezka: string) => wynik.pliki.find((p) => p.sciezka === sciezka)?.tresc;
  const ostrzezenia = wynik.ostrzezenia.filter((o) => !o.startsWith('Brak adresu strony'));
  const klucze = new Map(s.strony.map((p) => [p.slug, kluczStrony(p.slug)] as const));
  const media = new Set<string>();
  const kontekst = (slug: string, czesc = false): KontekstKonwersji => ({ slug, klucze, media, ostrzezenia, ...(czesc ? { kotwiceDoGlownej: true } : {}) });

  // Wpisy bloga z sekcji blog (podstrony `blog/<slug>`, także w wersjach językowych).
  const wpisy = new Map<string, { data: string; lead: string }>();
  for (const p of s.strony) for (const sek of p.sekcje) if (sek.typ === 'blog') for (const w of sek.dane.wpisy) wpisy.set(w.slug, { data: w.data, lead: w.lead });

  let formularz = false;
  const strony: StronaCms[] = s.strony.map((p: Podstrona, i) => {
    const dokument = plik(p.slug ? `${p.slug}/index.html` : 'index.html');
    if (!dokument) throw new Error(`Render bez podstrony „${p.slug}”`);
    const tresc = blokiTresci(trescMain(dokument), kontekst(p.slug));
    if (tresc.includes('data-formularz')) formularz = true;
    const jezyk = jezykPodstrony(s, p);
    const wzgledny = slugBezJezyka(s, p);
    const czesci = p.slug.split('/');
    const wpis = wzgledny.startsWith('blog/') ? wpisy.get(wzgledny.slice(5)) : undefined;
    let rodzic: string | null = null;
    let nazwa = czesci.join('-');
    if (wpis) nazwa = czesci[czesci.length - 1]!;
    else if (czesci.length > 1) {
      const nadrzedny = czesci.slice(0, -1).join('/');
      if (klucze.has(nadrzedny)) {
        rodzic = klucze.get(nadrzedny)!;
        nazwa = czesci[czesci.length - 1]!;
      }
    }
    return {
      klucz: klucze.get(p.slug)!,
      slug: p.slug,
      nazwa: nazwa || 'start',
      rodzic,
      typ: wpis ? ('wpis' as const) : ('strona' as const),
      tytul: p.tytul,
      jezyk,
      grupa: kluczPodstrony(s, p) || 'glowna',
      glowna: p.slug === '',
      seo: { tytul: p.seo.tytul ?? (p.slug ? `${p.tytul} – ${s.firma.nazwa}` : s.seo.tytul), opis: p.seo.opis ?? s.seo.opis },
      tresc,
      szablon: SZABLON_STRONY,
      ...(wpis ? { wpis } : {}),
      kolejnosc: i,
    };
  });

  const glowny = plik('index.html')!;
  const cialoGlownej = cialo(glowny);
  const naglowek = znajdz(cialoGlownej, (w) => w.tag === 'header' && maKlase(w, 'naglowek'));
  const stopka = znajdz(cialoGlownej, (w) => w.tag === 'footer' && maKlase(w, 'stopka'));
  const pasek = znajdz(cialoGlownej, (w) => maKlase(w, 'pasek-cta'));
  const czesc = kontekst('', true);
  const blokiNaglowka = naglowek ? naglowekMotywu(naglowek, czesc) : '';
  const blokiStopki = [stopka, pasek].filter((w): w is Wezel => !!w).flatMap((w) => bloki([zZakresem(w)], czesc)).join('\n\n');
  const dokument404 = plik('404.html');
  const tresc404 = dokument404 ? blokiTresci(trescMain(dokument404), czesc) : '';
  const klasyHtml = (/<html[^>]*class="([^"]*)"/.exec(glowny)?.[1] ?? '').split(/\s+/).filter(Boolean);
  // Animacje i płynne przewijanie strony statycznej działają ze skryptem kreatora – motyw ich nie włącza.
  const klasyBody = [...klasyHtml.filter((x) => !['plynnie', 'ef-wejscie', 'ef-paralaksa'].includes(x)), ...(pasek ? ['z-paskiem'] : [])].map((x) => prefiksKlas(x));

  for (const e of s.motyw.efekty) {
    const opis = EFEKTY_BEZ_ODPOWIEDNIKA[e];
    if (opis) ostrzezenia.push(`W WordPressie bez efektu: ${opis}.`);
  }
  if (jezykiStrony(s).length > 1) {
    ostrzezenia.push('Wersje językowe trafiają do WordPressa jako osobne strony z prefiksem języka (bez wtyczki wielojęzycznej) – nagłówek i stopka są wspólne.');
  }

  const obrazy = wszystkieObrazy(s, new Map());
  const listaMediow: MediumCms[] = [...media].map((zasobId) => {
    const o = obrazy.get(zasobId);
    const szerokosci = szerokosciWariantow(o?.szerokosc);
    const szer = [...szerokosci].reverse().find((x) => x <= MAKS_SZEROKOSC_MEDIUM) ?? szerokosci[0]!;
    return { zasobId, alt: o?.alt ?? '', plikPublikacji: `assets/img/${zasobId}-${szer}.jpg`, nazwaPliku: `${zasobId}.jpg` };
  });

  const motyw = plikiMotywu({
    strona: s,
    css: plik('assets/styl.css') ?? '',
    naglowek: blokiNaglowka,
    stopka: blokiStopki,
    tresc404,
    klasyBody,
    jsonLd: jsonLdZDokumentu(glowny),
    formularz,
    brakujaceFonty: new Set(opcje.brakujaceFonty ?? []),
    data,
  });

  return {
    cel: 'wordpress',
    wersjaFormatu: WERSJA_FORMATU_EKSPORTU,
    nazwa: s.firma.nazwa,
    opis: s.seo.opis,
    jezyk: s.jezyk,
    jezyki: jezykiStrony(s),
    strony,
    menu: menuZNaglowka(naglowek, czesc),
    media: listaMediow,
    motyw: { katalog: KATALOG_MOTYWU, pliki: motyw.pliki, fonty: motyw.fonty },
    ostrzezenia: [...new Set(ostrzezenia)],
  };
}
