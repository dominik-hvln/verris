import type { SekcjaTypu } from '../../model.ts';
import { adresHtml, daneKontaktowe, emailLink, linkMapy, listaGodzin, telefonLink } from '../dane.ts';
import { esc } from '../esc.ts';
import type { KontekstPodstrony } from '../kontekst.ts';
import { atrLinku, celDostepny, hrefPodstrony, przycisk } from '../linki.ts';
import { obraz } from '../obraz.ts';
import { atrFirmy, atrFormularza, edytowalne, zeSciezkaObrazu } from '../edycja.ts';
import { formularz, glowa, klasaPojawiania, sekcja, zl } from './wspolne.ts';

type Kontakt = SekcjaTypu<'kontakt'>;

/** Mapa jako statyczny rysunek w kolorach palety + link do map (żadnych iframe/trackerów). */
function mapa(k: KontekstPodstrony): string {
  const f = k.s.strona.firma;
  const href = linkMapy(f);
  if (!href) return '';
  return (
    `<div class="mapa"><div class="mapa-rys" aria-hidden="true"><span class="mapa-ulica"></span><span class="mapa-ulica mapa-ulica-2"></span><span class="mapa-park"></span><span class="mapa-pin"></span><span class="mapa-etykieta">${esc(f.nazwa)}</span></div>` +
    `<a class="mapa-link" ${atrLinku(href)}>Otwórz w mapach<span class="sr"> (${esc(f.adres?.ulica ?? '')})</span></a></div>`
  );
}

function przyciskFormularza(sek: Kontakt): string {
  return sek.dane.pola.includes('termin') ? 'Wyślij prośbę o termin' : 'Wyślij wiadomość';
}

export function renderKontakt(k: KontekstPodstrony, sek: Kontakt): string {
  const d = sek.dane;
  const f = k.s.strona.firma;
  const poj = klasaPojawiania(k);
  const form = (styl: 'karta' | 'linia' = 'karta') => (d.formularz ? formularz(k, sek, { pola: d.pola, przycisk: przyciskFormularza(sek), styl }) : '');
  const g = glowa(sek, { naglowek: d.naglowek, wstep: d.wstep }, k);
  // Dane firmy w edycji na stronie otwierają pole w formularzu „Firma i SEO” (paczka 123).
  const af = (pole: 'telefon' | 'email' | 'adres.ulica') => atrFirmy(k, pole);

  if (sek.wariant === 'kontakt-minimalny') {
    const duze = [f.email ? emailLink(f, 'duzy-link', af) : '', f.telefon ? telefonLink(f, 'duzy-link', af) : ''].filter(Boolean).join('');
    const male = [f.adres ? `<div><p class="et">Adres</p>${adresHtml(f, af)}</div>` : '', f.godziny.length ? `<div><p class="et">Godziny</p>${listaGodzin(f)}</div>` : '']
      .filter(Boolean)
      .join('');
    const href = linkMapy(f);
    return sekcja(
      k,
      sek,
      `<div class="kontener kontakt-min${poj}"><div class="kontakt-min-lewa">${g}${duze ? `<div class="duze-linki">${duze}</div>` : ''}${male ? `<div class="kontakt-male">${male}${href && d.mapa ? `<div><p class="et">Dojazd</p><a ${atrLinku(href)}>Otwórz w mapach</a></div>` : ''}</div>` : ''}</div>` +
        (d.formularz ? `<div class="kontakt-min-prawa">${form('linia')}</div>` : '') +
        `</div>`,
    );
  }
  if (sek.wariant === 'kontakt-karta') {
    return sekcja(
      k,
      sek,
      `<div class="kontener kontakt-siatka${poj}"><div class="kontakt-lewa">${g}${daneKontaktowe(f, af)}</div>` +
        (d.formularz ? `<div class="karta-form tlo-domyslne"><p class="karta-tytul">Napisz do nas</p>${form()}</div>` : d.mapa ? mapa(k) : '') +
        `</div>`,
      { tloWariantu: 'akcent' },
    );
  }
  // kontakt-podzielony
  return sekcja(
    k,
    sek,
    `<div class="kontener kontakt-siatka${poj}"><div class="kontakt-lewa">${g}${d.mapa ? mapa(k) : ''}${daneKontaktowe(f, af)}</div>` +
      (d.formularz ? `<div class="karta-form"><p class="karta-tytul">Napisz do nas</p><p class="karta-opis">Odpowiemy najszybciej, jak to możliwe.</p>${form()}</div>` : '') +
      `</div>`,
  );
}

const DOSTEPNOSC: Record<string, string> = { dostepny: 'Dostępny', ostatnie: 'Ostatnie sztuki', niedostepny: 'Chwilowo niedostępny', 'na-zamowienie': 'Na zamówienie' };

function celZamowienia(k: KontekstPodstrony, nazwa: string): string {
  const kontakt = [...k.podstrona.sekcje, ...(k.s.strona.strony.find((p) => p.slug === '')?.sekcje ?? [])].find((s) => s.typ === 'kontakt' && celDostepny(k, `#${s.id}`));
  if (kontakt) return `#${kontakt.id}`;
  const e = k.s.strona.firma.email;
  return e ? `mailto:${e}?subject=${encodeURIComponent(`Zamówienie: ${nazwa}`)}` : '';
}

export function renderProdukty(k: KontekstPodstrony, sek: SekcjaTypu<'produkty'>): string {
  const d = sek.dane;
  const poj = klasaPojawiania(k);
  const g = glowa(sek, { naglowek: d.naglowek, wstep: d.wstep, klasa: 'glowa-rzad' }, k);
  const lista = sek.wariant === 'produkty-lista';
  const ak = edytowalne(k, sek);
  const el = d.produkty
    .map((p, i) => {
      const ob = obraz(
        k,
        p.obraz ?? { alt: p.nazwa, zrodlo: 'placeholder', proporcje: lista ? '4:3' : '4:3', podpis: `Zdjęcie produktu: ${p.nazwa}` },
        zeSciezkaObrazu(k, sek, `dane.produkty.${i}.obraz`, { klasa: 'produkt-ob' }),
      );
      const odznaka = p.dostepnosc !== 'dostepny' ? `<span class="odznaka odznaka-${p.dostepnosc}">${DOSTEPNOSC[p.dostepnosc]}</span>` : '';
      const cel = celZamowienia(k, p.nazwa);
      const btn = cel && p.dostepnosc !== 'niedostepny' ? przycisk(k, { etykieta: 'Zamów', cel, styl: 'drugi' }) : '';
      return (
        `<li class="produkt"${p.sku ? ` data-sku="${esc(p.sku)}"` : ''}><div class="produkt-media">${ob}${odznaka}</div>` +
        `<div class="produkt-tekst"><div class="produkt-glowa"><h3${ak(`dane.produkty.${i}.nazwa`)}>${esc(p.nazwa)}</h3><p class="produkt-cena"${atrFormularza(k, sek, `dane.produkty.${i}.cenaBrutto`)}>${zl(p.cenaBrutto)}</p></div>${p.opis ? `<p class="produkt-opis"${ak(`dane.produkty.${i}.opis`)}>${esc(p.opis)}</p>` : ''}${btn}</div></li>`
      );
    })
    .join('');
  const tor = !lista && k.s.efekty.has('karuzela') ? ' mob-tor' : '';
  return sekcja(k, sek, `<div class="kontener${poj}">${g}<ul class="${lista ? 'produkty-wiersze' : 'produkty-kafle'}${tor}">${el}</ul></div>`);
}

const MIESIACE = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
export function dataPl(iso: string): string {
  const [r, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${MIESIACE[m - 1] ?? ''} ${r}`;
}

export function metaWpisu(w: { data: string; czasCzytania?: number }): string {
  return `<p class="wpis-meta"><time datetime="${esc(w.data)}">${dataPl(w.data)}</time>${w.czasCzytania ? ` · ${w.czasCzytania} min czytania` : ''}</p>`;
}

export function renderBlog(k: KontekstPodstrony, sek: SekcjaTypu<'blog'>): string {
  const d = sek.dane;
  const poj = klasaPojawiania(k);
  const g = glowa(sek, { naglowek: d.naglowek, klasa: 'glowa-rzad' }, k);
  if (!d.wpisy.length) {
    return sekcja(k, sek, `<div class="kontener${poj}">${g}<div class="opinie-puste"><p class="opinie-puste-tytul">Tu pojawią się wpisy Twojego bloga</p><p>Dodaj pierwszy wpis w edytorze – zajawka pojawi się tu automatycznie.</p></div></div>`, { klasa: 'sek-podglad' });
  }
  const strony = new Set(k.s.strona.strony.map((p) => p.slug));
  const ak = edytowalne(k, sek);
  const wpisy = d.wpisy
    .map((w, i) => {
      const slug = `blog/${w.slug}`;
      const href = strony.has(slug) ? hrefPodstrony(k, slug) : null;
      const tytul = href ? `<a href="${esc(href)}">${esc(w.tytul)}</a>` : esc(w.tytul);
      const wiecej = href ? `<a class="wiecej" href="${esc(href)}" aria-hidden="true" tabindex="-1">Czytaj wpis</a>` : '';
      const ob =
        sek.wariant === 'blog-karty'
          ? obraz(k, w.obraz ?? { alt: w.tytul, zrodlo: 'placeholder', proporcje: '3:2', podpis: 'Zdjęcie do wpisu' }, zeSciezkaObrazu(k, sek, `dane.wpisy.${i}.obraz`, {}))
          : '';
      return `<li class="wpis">${ob}${metaWpisu(w)}<h3${ak(`dane.wpisy.${i}.tytul`)}>${tytul}</h3><p class="wpis-lead"${ak(`dane.wpisy.${i}.lead`)}>${esc(w.lead)}</p>${wiecej}</li>`;
    })
    .join('');
  const klasa = sek.wariant === 'blog-karty' ? 'wpisy-karty' : 'wpisy-edytorskie';
  return sekcja(k, sek, `<div class="kontener${poj}">${g}<ul class="${klasa}">${wpisy}</ul></div>`);
}
