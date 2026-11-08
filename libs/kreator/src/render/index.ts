import { EFEKTY_ZAWSZE, KATALOG_EFEKTOW } from '../katalog.ts';
import type { Podstrona, Strona } from '../model.ts';
import { dopasujDoPlanu, PLANY_KREATORA } from '../plany.ts';
import { budujCss } from './css.ts';
import { plikFontu, ustawFonty } from './fonty.ts';
import type { KontekstPodstrony, KontekstStrony, OpcjeRenderu, PlikStrony, WynikRenderu } from './kontekst.ts';
import { przygotujEdycje } from './edycja.ts';
import { budujKolory } from './paleta.ts';
import { czyWidoczna } from './sekcje/index.ts';
import { glowaHtml, robots, sitemap, wpisDlaPodstrony } from './seo.ts';
import { budujSkrypt } from './skrypt.ts';
import { dokument, trescStrony } from './uklad.ts';

export type { OpcjeRenderu, PlikStrony, WynikRenderu } from './kontekst.ts';
export { esc, jsonBezpieczny } from './esc.ts';
export { kontrastWcag, dopasujKontrast } from './kolor.ts';
export { budujKolory } from './paleta.ts';
export { znakKreatora, logoKreatora } from './znak.ts';
export { plikFontu, slugRodziny, ZAKRESY_FONTOW, type ZakresFontu } from './fonty.ts';
export { MAKS_POL_FORMULARZA } from './sekcje/wspolne.ts';
export { dodatkiMostu, kodMostu, STYL_MOSTU, type OpcjeMostu } from './edycja-most.ts';
export { SZEROKOSCI_ZDJEC, szerokosciWariantow, wymagaAtrybucji } from './obraz.ts';

const ZNACZNIK_GLOWY = '<!--glowa-->';
const EFEKTY_ZNANE = new Set(KATALOG_EFEKTOW.map((e) => e.id));

function czyBezwzgledny(adres: string): boolean {
  return /^(https?:)?\/\//i.test(adres) || adres.startsWith('/');
}

/**
 * Renderuje stronę z modelu do statycznych plików: index.html i <slug>/index.html, assets/styl.css,
 * assets/kreator.js (gdy potrzebny), sitemap.xml, robots.txt, 404.html. Czysta funkcja.
 *
 * Publikacja (i podgląd bez `podgladPro`) – najpierw `dopasujDoPlanu`, więc wersje bez Pro dostają
 * darmowe odpowiedniki elementów Pro. Podgląd z `podgladPro` pokazuje elementy Pro ze wstęgą „Pro”.
 */
export function renderujStrone(wejscie: Strona, opcje: OpcjeRenderu): WynikRenderu {
  const plan = PLANY_KREATORA[opcje.wersja];
  const podglad = opcje.tryb === 'podglad';
  const wstegaPro = podglad && !!opcje.podgladPro && !plan.funkcjePro;
  const ostrzezenia: string[] = [];

  let strona: Strona;
  if (wstegaPro) {
    strona = structuredClone(wejscie);
  } else {
    const dop = dopasujDoPlanu(wejscie, opcje.wersja);
    strona = dop.strona;
    ostrzezenia.push(...dop.zmiany);
  }
  if (!plan.znakMinimalny && strona.stopka.znakKreatora === 'minimalny') strona.stopka.znakKreatora = 'jasny';

  const kolory = budujKolory(strona.motyw.paleta);
  ostrzezenia.push(...kolory.ostrzezenia);
  const efekty = new Set<string>([...EFEKTY_ZAWSZE]);
  for (const e of strona.motyw.efekty) {
    if (EFEKTY_ZNANE.has(e)) efekty.add(e);
    else ostrzezenia.push(`Nieznany efekt „${e}” – pominięto.`);
  }
  const data = opcje.dataGeneracji ? new Date(opcje.dataGeneracji) : new Date();
  const noindex = !!opcje.noindex || plan.publikacja === 'podglad';

  const s: KontekstStrony = {
    strona,
    opcje,
    seoPelne: plan.seo === 'pelne' || wstegaPro,
    podglad,
    wstegaPro,
    efekty,
    kolory,
    fonty: ustawFonty(strona.motyw),
    css: new Set(),
    js: new Set(),
    ostrzezenia,
    idGlownej: new Set((strona.strony.find((p) => p.slug === '')?.sekcje ?? []).filter((x) => czyWidoczna({ podglad }, x)).map((x) => x.id)),
    adres: opcje.adresStrony ? opcje.adresStrony.trim().replace(/\/+$/, '') : null,
    edycja: podglad && opcje.edycja ? przygotujEdycje(wejscie) : null,
    rok: data.getUTCFullYear(),
    dataIso: data.toISOString(),
  };

  const klasyHtml = [
    s.fonty.kursywaWyroznienia ? 'wyr-kursywa' : 'wyr-marker',
    `styl-${strona.motyw.styl}`,
    strona.motyw.animacje !== 'brak' ? 'plynnie' : '',
    efekty.has('mikrointerakcje') ? 'ef-mikro' : '',
    efekty.has('paralaksa') && strona.motyw.animacje !== 'brak' ? 'ef-paralaksa' : '',
    efekty.has('wejscie-naglowka') ? 'ef-wejscie' : '',
  ]
    .filter(Boolean)
    .join(' ');
  if (efekty.has('mikrointerakcje')) s.css.add('ef:mikrointerakcje');
  if (efekty.has('paralaksa')) s.css.add('ef:paralaksa');

  const baza = opcje.bazaFontow.replace(/\/+$/, '');
  const bazaAbs = czyBezwzgledny(baza);
  const plikNaglowka = plikFontu(s.fonty.naglowki, s.fonty.wagaNaglowka, false);

  const kontekst = (p: Podstrona, prefix: string): KontekstPodstrony => ({
    s,
    podstrona: p,
    prefix,
    idTutaj: new Set(p.sekcje.filter((x) => czyWidoczna(s, x)).map((x) => x.id)),
    licznikObrazow: 0,
    licznikPh: 0,
    bylH1: false,
  });

  // 1. przebieg: treść wszystkich podstron (zbiera moduły CSS/JS), głowa dopiero gdy wiadomo, czy jest JS.
  const strony = strona.strony;
  const robocze = strony.map((p) => {
    const prefix = p.slug ? '../'.repeat(p.slug.split('/').length) : '';
    const k = kontekst(p, prefix);
    const artykul = !!wpisDlaPodstrony(s, p);
    const html = dokument(k, { glowa: ZNACZNIK_GLOWY, klasyHtml, artykul }, trescStrony(k));
    return { p, k, html, artykul };
  });

  const strona404: Podstrona = {
    slug: '404',
    tytul: 'Nie znaleziono strony',
    seo: { tytul: `Nie znaleziono strony – ${strona.firma.nazwa}` },
    sekcje: [],
  } as Podstrona;
  const k404 = kontekst(strona404, '/');
  const tresc404 =
    `<header class="naglowek-strony"><div class="kontener kontener-waski"><p class="nad">Błąd 404</p><h1>Nie znaleziono strony</h1>` +
    `<p class="lead">Ta strona nie istnieje albo zmieniła adres. Zacznij od strony głównej.</p><div class="akcje"><a class="btn btn-1" href="/">Wróć na stronę główną</a></div></div></header>`;
  k404.bylH1 = true;
  const html404 = dokument(k404, { glowa: ZNACZNIK_GLOWY, klasyHtml, artykul: false }, tresc404);

  const css = budujCss(s, bazaAbs ? baza : `../${baza}`);
  const js = budujSkrypt(s.js);

  const pliki: PlikStrony[] = [];
  for (const r of robocze) {
    const glowa = glowaHtml(r.k, {
      noindex,
      css: `${r.k.prefix}assets/styl.css`,
      js: js ? `${r.k.prefix}assets/kreator.js` : null,
      preload: bazaAbs ? `${baza}/${plikNaglowka}` : `${r.k.prefix}${baza}/${plikNaglowka}`,
      artykul: r.artykul,
    });
    pliki.push({ sciezka: r.p.slug ? `${r.p.slug}/index.html` : 'index.html', tresc: r.html.replace(ZNACZNIK_GLOWY, glowa), typ: 'text/html; charset=utf-8' });
  }
  const glowa404 = glowaHtml(k404, {
    noindex: true,
    css: '/assets/styl.css',
    js: js ? '/assets/kreator.js' : null,
    preload: bazaAbs ? `${baza}/${plikNaglowka}` : `/${baza}/${plikNaglowka}`,
    artykul: false,
    bezAdresu: true,
  });
  pliki.push({ sciezka: '404.html', tresc: html404.replace(ZNACZNIK_GLOWY, glowa404), typ: 'text/html; charset=utf-8' });
  pliki.push({ sciezka: 'assets/styl.css', tresc: css, typ: 'text/css; charset=utf-8' });
  if (js) pliki.push({ sciezka: 'assets/kreator.js', tresc: js, typ: 'text/javascript; charset=utf-8' });
  pliki.push({ sciezka: 'sitemap.xml', tresc: sitemap(s, noindex ? [] : strony), typ: 'application/xml; charset=utf-8' });
  pliki.push({ sciezka: 'robots.txt', tresc: robots(s, noindex), typ: 'text/plain; charset=utf-8' });

  return {
    pliki,
    fonty: s.fonty.potrzebne.map((f) => ({ rodzina: f.rodzina, wagi: [...f.wagi], kursywa: f.kursywa })),
    ostrzezenia: [...new Set(ostrzezenia)],
  };
}
