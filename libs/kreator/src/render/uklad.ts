import { jezykiStrony, NAZWY_JEZYKOW, podstronyWJezyku, SKROTY_JEZYKOW, slugBezJezyka, slugGlownej, wersjeJezykowe, type Jezyk } from '../jezyki.ts';
import type { Podstrona, Sekcja } from '../model.ts';
import { adresHtml, emailLink, listaGodzin, telefonLink } from './dane.ts';
import { atrFirmy, atrTekstu, sciezkaMenu, sciezkaPodstrony } from './edycja.ts';
import { esc } from './esc.ts';
import { ikona, NAZWY_SOCIAL } from './ikony.ts';
import type { KontekstPodstrony } from './kontekst.ts';
import { czyCiemny } from './kolor.ts';
import { atrLinku, celDostepny, hrefCelu, hrefPodstrony, telHref } from './linki.ts';
import { czyWidoczna, renderSekcji } from './sekcje/index.ts';
import { dataWJezyku } from './teksty.ts';
import { pozycjeOferty, sierotki } from './sekcje/wspolne.ts';
import { wpisDlaPodstrony } from './seo.ts';
import { znakKreatora } from './znak.ts';

export interface PozycjaMenu {
  etykieta: string;
  href: string;
  biezaca: boolean;
  /** Paczka 123 – ścieżka etykiety w modelu (edycja na stronie); null poza edycją. */
  sciezka: string | null;
}

/**
 * Menu: kotwice sekcji strony głównej (w języku podstrony) z `wMenu` + podstrony najwyższego poziomu tego języka
 * (bez wpisów bloga). Paczka 124: angielska podstrona dostaje menu z angielskiej wersji strony.
 */
export function menu(k: KontekstPodstrony): PozycjaMenu[] {
  const s = k.s;
  const strona = s.strona;
  const glowna = strona.strony.find((p) => p.slug === k.glowna);
  const pozycje: PozycjaMenu[] = [];
  for (const sek of glowna?.sekcje ?? []) {
    if (sek.wMenu && czyWidoczna(s, sek)) pozycje.push({ etykieta: sek.wMenu, href: hrefCelu(k, `#${sek.id}`), biezaca: false, sciezka: sciezkaMenu(k, { sekcja: sek.id }) });
  }
  for (const p of podstronyWJezyku(strona, k.jezyk)) {
    const wzgl = slugBezJezyka(strona, p);
    if (!wzgl || wzgl.includes('/')) continue;
    pozycje.push({
      etykieta: p.tytul,
      href: hrefPodstrony(k, p.slug),
      biezaca: p.slug === k.podstrona.slug || k.podstrona.slug.startsWith(p.slug + '/'),
      sciezka: sciezkaMenu(k, { podstrona: p.slug }),
    });
  }
  return pozycje;
}

export interface PozycjaJezyka {
  jezyk: Jezyk;
  href: string;
  biezacy: boolean;
}

/**
 * Przełącznik języka: dla każdego języka strony – ta sama podstrona w tym języku (wspólny klucz), a gdy jej nie ma,
 * strona główna tego języka. Pusta lista, gdy strona ma jeden język.
 */
export function jezykiPrzelacznika(k: KontekstPodstrony): PozycjaJezyka[] {
  const strona = k.s.strona;
  const jezyki = jezykiStrony(strona).filter((j) => strona.strony.some((p) => p.slug === slugGlownej(strona, j)));
  if (jezyki.length < 2 || !k.podstrona.sekcje.length) return [];
  const wersje = new Map(wersjeJezykowe(strona, k.podstrona).map((w) => [w.jezyk, w.podstrona.slug] as const));
  return jezyki.map((j) => ({ jezyk: j, href: hrefPodstrony(k, wersje.get(j) ?? slugGlownej(strona, j)), biezacy: j === k.jezyk }));
}

function linkJezyka(p: PozycjaJezyka, tresc: string): string {
  return `<a href="${esc(p.href)}" lang="${p.jezyk}" hreflang="${p.jezyk}"${p.biezacy ? ' aria-current="true"' : ''}>${tresc}</a>`;
}

/** Przełącznik w nagłówku: skróty (PL, EN) z pełną nazwą dla czytnika; na telefonie z menu – pełne nazwy w menu. */
function przelacznikJezyka(k: KontekstPodstrony, lista: PozycjaJezyka[]): string {
  if (!lista.length) return '';
  k.s.css.add('jezyki');
  const el = lista.map((p) => `<li>${linkJezyka(p, `<span class="jez-skrot">${SKROTY_JEZYKOW[p.jezyk]}</span><span class="sr"> – ${esc(NAZWY_JEZYKOW[p.jezyk])}</span>`)}</li>`).join('');
  return `<ul class="jez-nag" aria-label="${esc(k.t.jezyk)}">${el}</ul>`;
}

function jezykiWMenu(k: KontekstPodstrony, lista: PozycjaJezyka[]): string {
  if (!lista.length) return '';
  return `<ul class="jez-menu" aria-label="${esc(k.t.jezyk)}">${lista.map((p) => `<li>${linkJezyka(p, esc(NAZWY_JEZYKOW[p.jezyk]))}</li>`).join('')}</ul>`;
}

function logo(k: KontekstPodstrony): string {
  const nazwa = k.s.strona.firma.nazwa;
  const inicjal = (nazwa.trim().match(/\p{L}|\p{N}/u)?.[0] ?? '').toUpperCase();
  const atr = atrTekstu(k, k.s.edycja ? 'firma.nazwa' : null);
  return `<a class="logo" href="${esc(hrefPodstrony(k, k.glowna))}"><span class="logo-znak" aria-hidden="true">${esc(inicjal)}</span><span class="logo-nazwa"${atr}>${esc(nazwa)}</span></a>`;
}

/** Główny CTA nagłówka: pierwszy główny przycisk z hero albo kotwica sekcji kontakt. */
function ctaNaglowka(k: KontekstPodstrony): { etykieta: string; cel: string } | null {
  const glowna = k.s.strona.strony.find((p) => p.slug === k.glowna);
  for (const sek of glowna?.sekcje ?? []) {
    if (sek.typ === 'hero' && czyWidoczna(k.s, sek)) {
      const p = sek.dane.przyciski.find((x) => x.styl === 'glowny');
      if (p && p.cel.startsWith('#') && celDostepny(k, p.cel)) return { etykieta: p.etykieta, cel: p.cel };
    }
  }
  const kontakt = glowna?.sekcje.find((x) => x.typ === 'kontakt' && czyWidoczna(k.s, x));
  return kontakt ? { etykieta: k.t.kontakt, cel: `#${kontakt.id}` } : null;
}

export function naglowekStrony(k: KontekstPodstrony): string {
  const s = k.s;
  const pozycje = menu(k);
  const f = s.strona.firma;
  const cta = ctaNaglowka(k);
  const przyklejony = s.efekty.has('przyklejony-naglowek');
  if (przyklejony) s.js.add('naglowek');
  // Edycja na stronie (paczka 123): etykieta pozycji menu pisana w miejscu (wMenu sekcji albo tytuł podstrony).
  const etykieta = (p: PozycjaMenu) => {
    const atr = atrTekstu(k, p.sciezka);
    return atr ? `<span${atr}>${esc(p.etykieta)}</span>` : esc(p.etykieta);
  };
  const lista = pozycje.map((p) => `<li><a href="${esc(p.href)}"${p.biezaca ? ' aria-current="page"' : ''}>${etykieta(p)}</a></li>`).join('');
  const jezyki = jezykiPrzelacznika(k);
  const nav = pozycje.length
    ? `<button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu-glowne"><span class="sr">${esc(k.t.menu)}</span>${ikona('menu')}</button>` +
      `<nav class="nav" id="menu-glowne" aria-label="${esc(k.t.nawGlowna)}"><ul>${lista}</ul>${jezykiWMenu(k, jezyki)}</nav>`
    : '';
  if (pozycje.length) s.js.add('menu');
  const prawa =
    (f.telefon ? `<a class="nag-tel" href="${esc(telHref(f.telefon))}"${atrFirmy(k, 'telefon')}>${ikona('telefon')}<span>${esc(f.telefon)}</span></a>` : '') +
    (cta ? `<a class="btn btn-1 btn-maly nag-cta" href="${esc(hrefCelu(k, cta.cel))}">${esc(cta.etykieta)}</a>` : '');
  const klasy = `naglowek${przyklejony ? ' przyklejony' : ''}${pozycje.length && jezyki.length ? ' z-menu' : ''}`;
  return `<header class="${klasy}"><div class="kontener naglowek-wnetrze">${logo(k)}${nav}${przelacznikJezyka(k, jezyki)}<div class="nag-prawa">${prawa}</div></div></header>`;
}

export function stopka(k: KontekstPodstrony): string {
  const s = k.s;
  const f = s.strona.firma;
  const st = s.strona.stopka;
  const pozycje = menu(k);
  const kol: string[] = [];
  // Wersja językowa (paczka 124): tekst stopki z `stopka.tlumaczenia.<język>`, bez niego – tekst główny.
  const tl = k.jezyk !== s.strona.jezyk ? st.tlumaczenia?.[k.jezyk as 'en' | 'de' | 'uk']?.tekst : undefined;
  const sciezkaOpisu = tl !== undefined ? `stopka.tlumaczenia.${k.jezyk}.tekst` : st.tekst !== undefined ? 'stopka.tekst' : 'firma.opisKrotki';
  const atrOpisu = atrTekstu(k, k.s.edycja ? sciezkaOpisu : null);
  kol.push(`<div class="stopka-firma">${logo(k)}<p${atrOpisu}>${esc(tl ?? st.tekst ?? f.opisKrotki)}</p></div>`);
  const af = (pole: 'telefon' | 'email' | 'adres.ulica') => atrFirmy(k, pole);
  const kontakt = [adresHtml(f, af), f.telefon ? `<p>${telefonLink(f, '', af)}</p>` : '', f.email ? `<p>${emailLink(f, '', af)}</p>` : ''].join('');
  if (kontakt) kol.push(`<div><h2 class="stopka-tytul">${esc(k.t.kontakt)}</h2>${kontakt}</div>`);
  const godziny = listaGodzin(f, 'godziny-lista godziny-stopka', k.jezyk);
  if (godziny) kol.push(`<div><h2 class="stopka-tytul">${esc(k.t.godziny)}</h2>${godziny}</div>`);
  if (pozycje.length) kol.push(`<nav aria-label="${esc(k.t.nawStopka)}"><h2 class="stopka-tytul">${esc(k.t.naSkroty)}</h2><ul>${pozycje.map((p) => `<li><a href="${esc(p.href)}">${esc(p.etykieta)}</a></li>`).join('')}</ul></nav>`);
  const social = f.social.length
    ? `<ul class="social">${f.social.map((x) => `<li><a ${atrLinku(x.url)} aria-label="${esc(NAZWY_SOCIAL[x.typ] ?? x.typ)}">${ikona(x.typ)}</a></li>`).join('')}</ul>`
    : '';
  const prawne = [
    st.politykaPrywatnosci ? `<a ${atrLinku(hrefCelu(k, st.politykaPrywatnosci))}>${esc(k.t.politykaPrywatnosci)}</a>` : '',
    st.regulamin ? `<a ${atrLinku(hrefCelu(k, st.regulamin))}>${esc(k.t.regulamin)}</a>` : '',
  ]
    .filter(Boolean)
    .join('');
  const ciemne = czyCiemny(s.kolory.konteksty.ciemne.tlo);
  return (
    `<footer class="stopka tlo-ciemne"><div class="kontener">` +
    `<div class="stopka-siatka">${kol.join('')}</div>` +
    `<div class="stopka-dol"><p class="stopka-prawa"${atrFirmy(k, 'nazwa')}>© ${s.rok} ${esc(f.nazwa)}${f.nip ? ` · NIP ${esc(f.nip)}` : ''}</p>${prawne ? `<p class="stopka-linki">${prawne}</p>` : ''}${social}${znakKreatora(st.znakKreatora, ciemne, k.t)}</div>` +
    `</div></footer>`
  );
}

/** Taśma haseł – pozycje oferty przesuwające się w pasie (efekt Pro, czysty CSS). */
export function tasma(k: KontekstPodstrony): string {
  const hasla = pozycjeOferty(k).slice(0, 10);
  if (hasla.length < 2) return '';
  k.s.css.add('ef:tasma');
  const jeden = hasla.map((h) => `<li>${esc(h)}</li>`).join('');
  return `<div class="tasma" aria-hidden="true"><ul class="tasma-tor">${jeden}${jeden}</ul></div>`;
}

export function paskCtaMobile(k: KontekstPodstrony): string {
  const f = k.s.strona.firma;
  const cta = ctaNaglowka(k);
  if (!f.telefon && !cta) return '';
  k.s.css.add('ef:pasek-cta-mobile');
  return (
    `<div class="pasek-cta" role="group" aria-label="${esc(k.t.szybkiKontakt)}">` +
    (f.telefon ? `<a class="btn btn-2" href="${esc(telHref(f.telefon))}">${ikona('telefon')}${esc(k.t.zadzwon)}</a>` : '') +
    (cta ? `<a class="btn btn-1" href="${esc(hrefCelu(k, cta.cel))}">${esc(cta.etykieta)}</a>` : '') +
    `</div>`
  );
}

/** Treść <main> podstrony. Bez sekcji hero – nagłówek strony z h1 (jeden h1 na stronę). */
export function trescStrony(k: KontekstPodstrony): string {
  const s = k.s;
  const p: Podstrona = k.podstrona;
  const sekcje = p.sekcje.filter((x: Sekcja) => czyWidoczna(s, x));
  const czesci: string[] = [];
  const wpis = wpisDlaPodstrony(s, p);
  const maHero = sekcje.some((x) => x.typ === 'hero');
  if (!maHero) {
    k.bylH1 = true;
    const meta = wpis ? `<p class="wpis-meta"><time datetime="${esc(wpis.data)}">${esc(dataWJezyku(wpis.data, k.jezyk))}</time>${wpis.czasCzytania ? ` · ${wpis.czasCzytania} ${esc(k.t.minCzytania)}` : ''}</p>` : '';
    const lead = wpis ? `<p class="lead">${esc(sierotki(wpis.lead))}</p>` : '';
    const okruszki = p.slug !== k.glowna
      ? `<nav class="okruszki" aria-label="${esc(k.t.okruszki)}"><ol><li><a href="${esc(hrefPodstrony(k, k.glowna))}">${esc(s.strona.strony.find((x) => x.slug === k.glowna)?.tytul ?? k.t.start)}</a></li><li aria-current="page">${esc(p.tytul)}</li></ol></nav>`
      : '';
    const sp = sciezkaPodstrony(k);
    czesci.push(`<header class="naglowek-strony"><div class="kontener kontener-waski">${okruszki}${meta}<h1${atrTekstu(k, sp && `${sp}.tytul`)}>${esc(sierotki(p.tytul))}</h1>${lead}</div></header>`);
  }
  sekcje.forEach((sek, i) => {
    czesci.push(renderSekcji(k, sek));
    if (i === 0 && sek.typ === 'hero' && s.efekty.has('tasma')) czesci.push(tasma(k));
  });
  return czesci.join('\n');
}

export interface Dokument {
  glowa: string;
  klasyHtml: string;
  artykul: boolean;
}

export function dokument(k: KontekstPodstrony, d: Dokument, tresc: string): string {
  const s = k.s;
  const pasek = s.efekty.has('pasek-cta-mobile') ? paskCtaMobile(k) : '';
  const postep = d.artykul && s.efekty.has('postep-czytania') ? '<div class="postep" aria-hidden="true"><span></span></div>' : '';
  if (postep) {
    s.js.add('postep');
    s.css.add('ef:postep-czytania');
  }
  const main = d.artykul ? `<main id="tresc"><article>${tresc}</article></main>` : `<main id="tresc">${tresc}</main>`;
  // Etykiety okna powiększonego zdjęcia w języku podstrony – skrypt strony (wspólny dla języków) czyta je z body.
  const lb = tresc.includes('class="lb"') ? ` data-lb="${esc([k.t.zamknij, k.t.poprzednieZdjecie, k.t.nastepneZdjecie, k.t.powiekszone].join('|'))}"` : '';
  return (
    `<!doctype html>\n<html lang="${k.jezyk}" class="${d.klasyHtml}">\n<head>\n${d.glowa}\n</head>\n<body${pasek ? ' class="z-paskiem"' : ''}${lb}>\n` +
    `<a class="skip" href="#tresc">${esc(k.t.przejdzDoTresci)}</a>\n${postep}${naglowekStrony(k)}\n${main}\n${stopka(k)}\n${pasek}\n</body>\n</html>\n`
  );
}
