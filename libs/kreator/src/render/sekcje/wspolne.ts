import { KATALOG_WARIANTOW, SEKCJE_PRO } from '../../katalog.ts';
import { podstronyWJezyku, type Jezyk } from '../../jezyki.ts';
import type { Sekcja } from '../../model.ts';
import { kwota, wstaw } from '../teksty.ts';
import { esc } from '../esc.ts';
import type { KontekstPodstrony } from '../kontekst.ts';
import { edytowalne } from '../edycja.ts';
import { atrLinku, hrefCelu } from '../linki.ts';

export type Tlo = Sekcja['tlo'];

/** Kwota w złotych: po polsku „1 299 zł”, „306,27 zł” (twarde spacje); w innych językach „PLN” (teksty.ts: `kwota`). */
export function zl(wartosc: number, jezyk: Jezyk = 'pl'): string {
  return kwota(wartosc, jezyk);
}

/** Nagłówek z wyróżnionym fragmentem (kursywa w szeryfach, marker w bezszeryfowych). */
export function zWyroznieniem(tekst: string, wyroznienie?: string): string {
  if (!wyroznienie || !tekst.includes(wyroznienie)) return esc(tekst);
  const i = tekst.indexOf(wyroznienie);
  return `${esc(tekst.slice(0, i))}<em class="wyr">${esc(wyroznienie)}</em>${esc(tekst.slice(i + wyroznienie.length))}`;
}

/**
 * Polska typografia: jednoliterowe spójniki i przyimki (a, i, o, u, w, z) nie zostają na końcu wiersza –
 * twarda spacja wiąże je z następnym słowem. Na tekście przed `esc()`; nagłówki, leady i wstępy.
 */
export function sierotki(tekst: string): string {
  return tekst.replace(/(?<=^|[\s„(])([aiouwzAIOUWZ])[ \t]+/g, '$1\u00a0');
}

export function czyPro(sek: Sekcja): boolean {
  if (SEKCJE_PRO.includes(sek.typ)) return true;
  return KATALOG_WARIANTOW[sek.typ].some((w) => w.id === sek.wariant && w.pro);
}

export interface OpcjeSekcji {
  /** Tło wymuszone przez wariant, gdy sekcja ma domyślne. */
  tloWariantu?: Tlo;
  /** Tło narzucone przez wariant niezależnie od modelu (np. hero pełnoekranowy zawsze ciemne). */
  tloStale?: Tlo;
  klasa?: string;
  /** Sekcja bez nagłówka h2 (np. pasek CTA ma h2, taśma nie) – wtedy bez aria-labelledby. */
  bezEtykiety?: boolean;
}

export function tloSekcji(sek: Sekcja, o: OpcjeSekcji = {}): Tlo {
  if (o.tloStale) return o.tloStale;
  return sek.tlo === 'domyslne' && o.tloWariantu ? o.tloWariantu : sek.tlo;
}

/** Otwarcie sekcji: id (kotwica), klasy typu/wariantu/tła, aria-labelledby, wstęga „Pro” w podglądzie. */
export function sekcja(k: KontekstPodstrony, sek: Sekcja, srodek: string, o: OpcjeSekcji = {}): string {
  const tlo = tloSekcji(sek, o);
  k.s.css.add(`typ:${sek.typ}`);
  k.s.css.add(`w:${sek.wariant}`);
  const pro = k.s.wstegaPro && czyPro(sek);
  const klasy = ['sek', `sek-${sek.typ}`, sek.wariant, `tlo-${tlo}`, o.klasa ?? '', pro ? 'jest-pro' : ''].filter(Boolean).join(' ');
  const etykieta = o.bezEtykiety ? '' : ` aria-labelledby="${esc(sek.id)}-tytul"`;
  const wstega = pro ? '<span class="wstega-pro" title="Element Kreatora Pro – widoczny po włączeniu Pro">Pro</span>' : '';
  const edycja = k.s.edycja ? ` data-k-sekcja="${esc(sek.id)}"` : '';
  return `<section id="${esc(sek.id)}" class="${klasy}"${etykieta}${edycja}>${wstega}${srodek}</section>`;
}

export function klasaPojawiania(k: KontekstPodstrony): string {
  if (!k.s.efekty.has('pojawianie') || k.s.strona.motyw.animacje === 'brak') return '';
  k.s.js.add('pojawianie');
  k.s.css.add('ef:pojawianie');
  return ' pojaw';
}

export interface Glowa {
  naglowek: string;
  wstep?: string;
  /** Nadtytuł; domyślnie etykieta sekcji w menu. */
  nad?: string;
  klasa?: string;
  /** Treść dodatkowa pod wstępem (np. link). */
  dodatek?: string;
}

/**
 * Głowa sekcji. Z `k` w trybie edycji: nadtytuł (etykieta w menu), nagłówek i wstęp dostają ścieżki pól
 * (`naglowek` i `wstep` to zawsze `dane.naglowek` / `dane.wstep` sekcji).
 */
export function glowa(sek: Sekcja, g: Glowa, k?: KontekstPodstrony): string {
  const nad = g.nad ?? sek.wMenu;
  const ak = k ? edytowalne(k, sek) : () => '';
  return (
    `<header class="glowa${g.klasa ? ' ' + g.klasa : ''}">` +
    (nad ? `<p class="nad"${nad === sek.wMenu ? ak('wMenu') : ''}>${esc(nad)}</p>` : '') +
    `<h2 id="${esc(sek.id)}-tytul"${ak('dane.naglowek')}>${esc(sierotki(g.naglowek))}</h2>` +
    (g.wstep ? `<p class="wstep"${ak('dane.wstep')}>${esc(sierotki(g.wstep))}</p>` : '') +
    (g.dodatek ?? '') +
    `</header>`
  );
}

/** Lista pozycji oferty ze strony (w języku podstrony) – do pola „Usługa” w formularzu i taśmy haseł. */
export function pozycjeOferty(k: KontekstPodstrony): string[] {
  const s = podstronyWJezyku(k.s.strona, k.jezyk)
    .flatMap((p) => p.sekcje)
    .find((x) => x.typ === 'oferta');
  return s && s.typ === 'oferta' ? s.dane.pozycje.map((p) => p.tytul) : [];
}

type KluczPola = 'imie' | 'email' | 'telefon' | 'firma' | 'termin' | 'usluga' | 'wiadomosc';
const POLA: Record<string, { etykieta: KluczPola; typ: string; auto?: string; tryb?: string; podpowiedz?: 'terminPodpowiedz' }> = {
  imie: { etykieta: 'imie', typ: 'text', auto: 'name' },
  email: { etykieta: 'email', typ: 'email', auto: 'email' },
  telefon: { etykieta: 'telefon', typ: 'tel', auto: 'tel', tryb: 'tel' },
  firma: { etykieta: 'firma', typ: 'text', auto: 'organization' },
  termin: { etykieta: 'termin', typ: 'text', podpowiedz: 'terminPodpowiedz' },
  usluga: { etykieta: 'usluga', typ: 'select' },
  wiadomosc: { etykieta: 'wiadomosc', typ: 'textarea' },
};

/** Limity długości pól (te same sprawdza API – apps/api/src/kreator/formularz.ts). */
export const MAKS_POL_FORMULARZA: Record<string, number> = { imie: 120, email: 254, telefon: 40, firma: 160, termin: 120, usluga: 160, wiadomosc: 5000 };

export interface OpcjeFormularza {
  pola: string[];
  przycisk: string;
  /** 'karta' – pola w ramkach; 'linia' – pola z dolną linią (styl edytorski). */
  styl?: 'karta' | 'linia';
}

/** Adres bieżącej podstrony (pole „powrot” formularza) – z adresu strony; bez niego uzupełnia go skrypt. */
function adresPodstrony(k: KontekstPodstrony): string {
  if (!k.s.adres) return '';
  return `${k.s.adres}/${k.podstrona.slug ? `${k.podstrona.slug}/` : ''}`;
}

/**
 * Formularz kontaktowy. Etykiety przy każdym polu, honeypot, zgoda RODO z linkiem do polityki prywatności.
 *
 * Z `opcje.adresFormularza` (publikacja na domenę, ZIP opublikowanej strony): zwykły POST bez JS na adres API
 * (POST /kreator/formularz/<token>), ukryte pola: id sekcji, adres powrotu, czas wypełniania (uzupełnia go skrypt
 * – bez JS pole zostaje puste i API traktuje to jako sygnał pomocniczy, nie powód odrzucenia). Po powrocie
 * (`?formularz=wyslano|blad#<id sekcji>`) skrypt wpisuje komunikat do `.form-status` (role="status").
 * Bez adresu (podgląd edytora, link próbny) – formularz wyłączony: bez action, przycisk nieaktywny, informacja.
 */
export function formularz(k: KontekstPodstrony, sek: Sekcja, o: OpcjeFormularza): string {
  const pid = sek.id;
  const pola = [...new Set(o.pola.filter((p) => p in POLA))];
  if (!pola.includes('imie')) pola.unshift('imie');
  if (!pola.includes('email') && !pola.includes('telefon')) pola.splice(1, 0, 'email');
  const wymagany = pola.includes('email') ? 'email' : 'telefon';
  const uslugi = pozycjeOferty(k);
  const t = k.t;
  const html = pola.map((nazwa) => {
    const p = POLA[nazwa]!;
    const id = `${pid}-${nazwa}`;
    const req = nazwa === 'imie' || nazwa === wymagany ? ' required' : '';
    const etykieta = `<label for="${id}">${esc(t[p.etykieta])}${req ? '' : ` <span class="opc">${esc(t.opcjonalnie)}</span>`}</label>`;
    const max = ` maxlength="${MAKS_POL_FORMULARZA[nazwa] ?? 200}"`;
    if (p.typ === 'textarea') return `<div class="pole pole-pelne">${etykieta}<textarea id="${id}" name="${nazwa}" rows="4"${max}${req}></textarea></div>`;
    if (p.typ === 'select' && uslugi.length) {
      const opcje = [`<option value="">${esc(t.wybierzUsluge)}</option>`, ...uslugi.map((u) => `<option>${esc(u)}</option>`), `<option>${esc(t.innaUsluga)}</option>`].join('');
      return `<div class="pole">${etykieta}<select id="${id}" name="${nazwa}">${opcje}</select></div>`;
    }
    const typ = p.typ === 'select' ? 'text' : p.typ;
    return `<div class="pole">${etykieta}<input id="${id}" name="${nazwa}" type="${typ}"${p.auto ? ` autocomplete="${p.auto}"` : ''}${p.tryb ? ` inputmode="${p.tryb}"` : ''}${p.podpowiedz ? ` placeholder="${esc(t[p.podpowiedz])}"` : ''}${max}${req}></div>`;
  });
  const polityka = k.s.strona.stopka.politykaPrywatnosci;
  if (!polityka) k.s.ostrzezenia.push('Formularz bez linku do polityki prywatności – dodaj politykę w ustawieniach stopki.');
  const linkPolityki = polityka ? ` ${wstaw(esc(t.szczegolyPolityki), { link: `<a ${atrLinku(hrefCelu(k, polityka))}>${esc(t.politykiLink)}</a>` })}` : '';
  const zgoda =
    `<div class="zgoda"><input id="${pid}-zgoda" name="zgoda" type="checkbox" value="tak" required>` +
    `<label for="${pid}-zgoda">${wstaw(esc(t.zgoda), { firma: esc(k.s.strona.firma.nazwa) })}${linkPolityki}</label></div>`;
  const hp = `<div class="hp" aria-hidden="true"><label for="${pid}-www">${esc(t.zostawPuste)}</label><input id="${pid}-www" name="strona_www" type="text" tabindex="-1" autocomplete="off"></div>`;
  const klasa = `formularz form-${o.styl ?? 'karta'}`;
  const adres = k.s.opcje.adresFormularza?.trim();
  if (!adres) {
    return (
      `<form class="${klasa} form-wylaczony" aria-describedby="${esc(pid)}-info">` +
      `<div class="pola">${html.join('')}</div>${hp}${zgoda}` +
      `<button class="btn btn-1" type="submit" disabled>${esc(o.przycisk)}</button>` +
      `<p class="form-info" id="${esc(pid)}-info">${esc(t.formPoPublikacji)}</p>` +
      `</form>`
    );
  }
  k.s.js.add('formularz');
  return (
    `<form class="${klasa}" action="${esc(adres)}" method="post" accept-charset="utf-8" data-formularz data-ok="${esc(t.formOk)}" data-blad="${esc(t.formBlad)}">` +
    `<p class="form-status" role="status" tabindex="-1"></p>` +
    `<input type="hidden" name="formularz" value="${esc(pid)}">` +
    `<input type="hidden" name="jezyk" value="${k.jezyk}">` +
    `<input type="hidden" name="powrot" value="${esc(adresPodstrony(k))}">` +
    `<input type="hidden" name="czas" value="">` +
    `<div class="pola">${html.join('')}</div>${hp}${zgoda}` +
    `<button class="btn btn-1" type="submit">${esc(o.przycisk)}</button>` +
    `</form>`
  );
}
