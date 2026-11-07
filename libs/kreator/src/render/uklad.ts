import type { Podstrona, Sekcja } from '../model.ts';
import { adresHtml, emailLink, listaGodzin, telefonLink } from './dane.ts';
import { esc } from './esc.ts';
import { ikona, NAZWY_SOCIAL } from './ikony.ts';
import type { KontekstPodstrony } from './kontekst.ts';
import { czyCiemny } from './kolor.ts';
import { atrLinku, celDostepny, hrefCelu, hrefPodstrony, telHref } from './linki.ts';
import { czyWidoczna, renderSekcji } from './sekcje/index.ts';
import { dataPl } from './sekcje/kontakt.ts';
import { pozycjeOferty, sierotki } from './sekcje/wspolne.ts';
import { wpisDlaPodstrony } from './seo.ts';
import { znakKreatora } from './znak.ts';

export interface PozycjaMenu {
  etykieta: string;
  href: string;
  biezaca: boolean;
}

/** Menu: kotwice sekcji strony głównej z `wMenu` + podstrony najwyższego poziomu (bez wpisów bloga). */
export function menu(k: KontekstPodstrony): PozycjaMenu[] {
  const s = k.s;
  const glowna = s.strona.strony.find((p) => p.slug === '');
  const pozycje: PozycjaMenu[] = [];
  for (const sek of glowna?.sekcje ?? []) {
    if (sek.wMenu && czyWidoczna(s, sek)) pozycje.push({ etykieta: sek.wMenu, href: hrefCelu(k, `#${sek.id}`), biezaca: false });
  }
  for (const p of s.strona.strony) {
    if (!p.slug || p.slug.includes('/')) continue;
    pozycje.push({ etykieta: p.tytul, href: hrefPodstrony(k, p.slug), biezaca: p.slug === k.podstrona.slug || k.podstrona.slug.startsWith(p.slug + '/') });
  }
  return pozycje;
}

function logo(k: KontekstPodstrony): string {
  const nazwa = k.s.strona.firma.nazwa;
  const inicjal = (nazwa.trim().match(/\p{L}|\p{N}/u)?.[0] ?? '').toUpperCase();
  return `<a class="logo" href="${esc(hrefPodstrony(k, ''))}"><span class="logo-znak" aria-hidden="true">${esc(inicjal)}</span><span class="logo-nazwa">${esc(nazwa)}</span></a>`;
}

/** Główny CTA nagłówka: pierwszy główny przycisk z hero albo kotwica sekcji kontakt. */
function ctaNaglowka(k: KontekstPodstrony): { etykieta: string; cel: string } | null {
  const glowna = k.s.strona.strony.find((p) => p.slug === '');
  for (const sek of glowna?.sekcje ?? []) {
    if (sek.typ === 'hero' && czyWidoczna(k.s, sek)) {
      const p = sek.dane.przyciski.find((x) => x.styl === 'glowny');
      if (p && p.cel.startsWith('#') && celDostepny(k, p.cel)) return { etykieta: p.etykieta, cel: p.cel };
    }
  }
  const kontakt = glowna?.sekcje.find((x) => x.typ === 'kontakt' && czyWidoczna(k.s, x));
  return kontakt ? { etykieta: 'Kontakt', cel: `#${kontakt.id}` } : null;
}

export function naglowekStrony(k: KontekstPodstrony): string {
  const s = k.s;
  const pozycje = menu(k);
  const f = s.strona.firma;
  const cta = ctaNaglowka(k);
  const przyklejony = s.efekty.has('przyklejony-naglowek');
  if (przyklejony) s.js.add('naglowek');
  const lista = pozycje.map((p) => `<li><a href="${esc(p.href)}"${p.biezaca ? ' aria-current="page"' : ''}>${esc(p.etykieta)}</a></li>`).join('');
  const nav = pozycje.length
    ? `<button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu-glowne"><span class="sr">Menu</span>${ikona('menu')}</button>` +
      `<nav class="nav" id="menu-glowne" aria-label="Główna"><ul>${lista}</ul></nav>`
    : '';
  if (pozycje.length) s.js.add('menu');
  const prawa =
    (f.telefon ? `<a class="nag-tel" href="${esc(telHref(f.telefon))}">${ikona('telefon')}<span>${esc(f.telefon)}</span></a>` : '') +
    (cta ? `<a class="btn btn-1 btn-maly nag-cta" href="${esc(hrefCelu(k, cta.cel))}">${esc(cta.etykieta)}</a>` : '');
  return `<header class="naglowek${przyklejony ? ' przyklejony' : ''}"><div class="kontener naglowek-wnetrze">${logo(k)}${nav}<div class="nag-prawa">${prawa}</div></div></header>`;
}

export function stopka(k: KontekstPodstrony): string {
  const s = k.s;
  const f = s.strona.firma;
  const st = s.strona.stopka;
  const pozycje = menu(k);
  const kol: string[] = [];
  kol.push(`<div class="stopka-firma">${logo(k)}<p>${esc(st.tekst ?? f.opisKrotki)}</p></div>`);
  const kontakt = [adresHtml(f), telefonLink(f) ? `<p>${telefonLink(f)}</p>` : '', emailLink(f) ? `<p>${emailLink(f)}</p>` : ''].join('');
  if (kontakt) kol.push(`<div><h2 class="stopka-tytul">Kontakt</h2>${kontakt}</div>`);
  const godziny = listaGodzin(f, 'godziny-lista godziny-stopka');
  if (godziny) kol.push(`<div><h2 class="stopka-tytul">Godziny</h2>${godziny}</div>`);
  if (pozycje.length) kol.push(`<nav aria-label="Stopka"><h2 class="stopka-tytul">Na skróty</h2><ul>${pozycje.map((p) => `<li><a href="${esc(p.href)}">${esc(p.etykieta)}</a></li>`).join('')}</ul></nav>`);
  const social = f.social.length
    ? `<ul class="social">${f.social.map((x) => `<li><a ${atrLinku(x.url)} aria-label="${esc(NAZWY_SOCIAL[x.typ] ?? x.typ)}">${ikona(x.typ)}</a></li>`).join('')}</ul>`
    : '';
  const prawne = [
    st.politykaPrywatnosci ? `<a ${atrLinku(hrefCelu(k, st.politykaPrywatnosci))}>Polityka prywatności</a>` : '',
    st.regulamin ? `<a ${atrLinku(hrefCelu(k, st.regulamin))}>Regulamin</a>` : '',
  ]
    .filter(Boolean)
    .join('');
  const ciemne = czyCiemny(s.kolory.konteksty.ciemne.tlo);
  return (
    `<footer class="stopka tlo-ciemne"><div class="kontener">` +
    `<div class="stopka-siatka">${kol.join('')}</div>` +
    `<div class="stopka-dol"><p class="stopka-prawa">© ${s.rok} ${esc(f.nazwa)}${f.nip ? ` · NIP ${esc(f.nip)}` : ''}</p>${prawne ? `<p class="stopka-linki">${prawne}</p>` : ''}${social}${znakKreatora(st.znakKreatora, ciemne)}</div>` +
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
    `<div class="pasek-cta" role="group" aria-label="Szybki kontakt">` +
    (f.telefon ? `<a class="btn btn-2" href="${esc(telHref(f.telefon))}">${ikona('telefon')}Zadzwoń</a>` : '') +
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
    const meta = wpis ? `<p class="wpis-meta"><time datetime="${esc(wpis.data)}">${dataPl(wpis.data)}</time>${wpis.czasCzytania ? ` · ${wpis.czasCzytania} min czytania` : ''}</p>` : '';
    const lead = wpis ? `<p class="lead">${esc(sierotki(wpis.lead))}</p>` : '';
    const okruszki = p.slug
      ? `<nav class="okruszki" aria-label="Okruszki"><ol><li><a href="${esc(hrefPodstrony(k, ''))}">${esc(s.strona.strony.find((x) => x.slug === '')?.tytul ?? 'Start')}</a></li><li aria-current="page">${esc(p.tytul)}</li></ol></nav>`
      : '';
    czesci.push(`<header class="naglowek-strony"><div class="kontener kontener-waski">${okruszki}${meta}<h1>${esc(sierotki(p.tytul))}</h1>${lead}</div></header>`);
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
  return (
    `<!doctype html>\n<html lang="${s.strona.jezyk}" class="${d.klasyHtml}">\n<head>\n${d.glowa}\n</head>\n<body${pasek ? ' class="z-paskiem"' : ''}>\n` +
    `<a class="skip" href="#tresc">Przejdź do treści</a>\n${postep}${naglowekStrony(k)}\n${main}\n${stopka(k)}\n${pasek}\n</body>\n</html>\n`
  );
}
