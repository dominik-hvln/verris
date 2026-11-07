import { KATALOG_WARIANTOW, SEKCJE_PRO } from '../../katalog.ts';
import type { Sekcja } from '../../model.ts';
import { wszystkieSekcje } from '../../model.ts';
import { esc } from '../esc.ts';
import type { KontekstPodstrony } from '../kontekst.ts';
import { atrLinku, hrefCelu } from '../linki.ts';

export type Tlo = Sekcja['tlo'];

/** Kwota w złotych po polsku: „1 299 zł”, „306,27 zł” (twarde spacje). */
export function zl(kwota: number): string {
  const [c, g] = kwota.toFixed(2).split('.') as [string, string];
  const calk = c.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return g === '00' ? `${calk}\u00a0zł` : `${calk},${g}\u00a0zł`;
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
  return `<section id="${esc(sek.id)}" class="${klasy}"${etykieta}>${wstega}${srodek}</section>`;
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

export function glowa(sek: Sekcja, g: Glowa): string {
  const nad = g.nad ?? sek.wMenu;
  return (
    `<header class="glowa${g.klasa ? ' ' + g.klasa : ''}">` +
    (nad ? `<p class="nad">${esc(nad)}</p>` : '') +
    `<h2 id="${esc(sek.id)}-tytul">${esc(sierotki(g.naglowek))}</h2>` +
    (g.wstep ? `<p class="wstep">${esc(sierotki(g.wstep))}</p>` : '') +
    (g.dodatek ?? '') +
    `</header>`
  );
}

/** Lista pozycji oferty z całej strony – do pola „Usługa” w formularzu i taśmy haseł. */
export function pozycjeOferty(k: KontekstPodstrony): string[] {
  const s = wszystkieSekcje(k.s.strona).find((x) => x.typ === 'oferta');
  return s && s.typ === 'oferta' ? s.dane.pozycje.map((p) => p.tytul) : [];
}

const POLA: Record<string, { etykieta: string; typ: string; auto?: string; tryb?: string; podpowiedz?: string }> = {
  imie: { etykieta: 'Imię', typ: 'text', auto: 'name' },
  email: { etykieta: 'E-mail', typ: 'email', auto: 'email' },
  telefon: { etykieta: 'Telefon', typ: 'tel', auto: 'tel', tryb: 'tel' },
  firma: { etykieta: 'Firma', typ: 'text', auto: 'organization' },
  termin: { etykieta: 'Preferowany termin', typ: 'text', podpowiedz: 'np. czwartek po 16:00' },
  usluga: { etykieta: 'Usługa', typ: 'select' },
  wiadomosc: { etykieta: 'Wiadomość', typ: 'textarea' },
};

export interface OpcjeFormularza {
  pola: string[];
  przycisk: string;
  /** 'karta' – pola w ramkach; 'linia' – pola z dolną linią (styl edytorski). */
  styl?: 'karta' | 'linia';
}

/**
 * Formularz kontaktowy (tylko markup – obsługę POST /kontakt.php dostarcza osobna paczka).
 * Etykiety przy każdym polu, honeypot, zgoda RODO z linkiem do polityki prywatności.
 */
export function formularz(k: KontekstPodstrony, sek: Sekcja, o: OpcjeFormularza): string {
  const pid = sek.id;
  const pola = [...new Set(o.pola.filter((p) => p in POLA))];
  if (!pola.includes('imie')) pola.unshift('imie');
  if (!pola.includes('email') && !pola.includes('telefon')) pola.splice(1, 0, 'email');
  const wymagany = pola.includes('email') ? 'email' : 'telefon';
  const uslugi = pozycjeOferty(k);
  const html = pola.map((nazwa) => {
    const p = POLA[nazwa]!;
    const id = `${pid}-${nazwa}`;
    const req = nazwa === 'imie' || nazwa === wymagany ? ' required' : '';
    const etykieta = `<label for="${id}">${p.etykieta}${req ? '' : ' <span class="opc">(opcjonalnie)</span>'}</label>`;
    if (p.typ === 'textarea') return `<div class="pole pole-pelne">${etykieta}<textarea id="${id}" name="${nazwa}" rows="4"${req}></textarea></div>`;
    if (p.typ === 'select' && uslugi.length) {
      const opcje = ['<option value="">Wybierz usługę</option>', ...uslugi.map((u) => `<option>${esc(u)}</option>`), '<option>Inna / jeszcze nie wiem</option>'].join('');
      return `<div class="pole">${etykieta}<select id="${id}" name="${nazwa}">${opcje}</select></div>`;
    }
    const typ = p.typ === 'select' ? 'text' : p.typ;
    return `<div class="pole">${etykieta}<input id="${id}" name="${nazwa}" type="${typ}"${p.auto ? ` autocomplete="${p.auto}"` : ''}${p.tryb ? ` inputmode="${p.tryb}"` : ''}${p.podpowiedz ? ` placeholder="${esc(p.podpowiedz)}"` : ''}${req}></div>`;
  });
  const polityka = k.s.strona.stopka.politykaPrywatnosci;
  if (!polityka) k.s.ostrzezenia.push('Formularz bez linku do polityki prywatności – dodaj politykę w ustawieniach stopki.');
  const linkPolityki = polityka ? ` Szczegóły w <a ${atrLinku(hrefCelu(k, polityka))}>polityce prywatności</a>.` : '';
  const zgoda =
    `<div class="zgoda"><input id="${pid}-zgoda" name="zgoda" type="checkbox" value="tak" required>` +
    `<label for="${pid}-zgoda">Wyrażam zgodę na przetwarzanie podanych danych w celu odpowiedzi na moją wiadomość. Administratorem danych jest ${esc(k.s.strona.firma.nazwa)}.${linkPolityki}</label></div>`;
  const hp = `<div class="hp" aria-hidden="true"><label for="${pid}-www">Zostaw to pole puste</label><input id="${pid}-www" name="strona_www" type="text" tabindex="-1" autocomplete="off"></div>`;
  return (
    `<form class="formularz form-${o.styl ?? 'karta'}" action="/kontakt.php" method="post">` +
    `<input type="hidden" name="formularz" value="${esc(pid)}">` +
    `<div class="pola">${html.join('')}</div>${hp}${zgoda}` +
    `<button class="btn btn-1" type="submit">${esc(o.przycisk)}</button>` +
    `</form>`
  );
}
