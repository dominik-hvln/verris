import type { Jezyk } from '../jezyki.ts';
import type { Firma } from '../model.ts';
import { esc } from './esc.ts';
import { ikona } from './ikony.ts';
import { telHref } from './linki.ts';
import { teksty } from './teksty.ts';

type Dzien = 'pn' | 'wt' | 'sr' | 'cz' | 'pt' | 'so' | 'nd';
export const DNI: Dzien[] = ['pn', 'wt', 'sr', 'cz', 'pt', 'so', 'nd'];
export const SCHEMA_DNI: Record<Dzien, string> = { pn: 'Monday', wt: 'Tuesday', sr: 'Wednesday', cz: 'Thursday', pt: 'Friday', so: 'Saturday', nd: 'Sunday' };

/** ['pn','wt','sr'] → „Poniedziałek–środa”; ['pn','sr'] → „Poniedziałek, środa”. */
export function opisDni(dni: Dzien[], jezyk: Jezyk = 'pl'): string {
  const MALE = (d: Dzien) => teksty(jezyk).dniMale[DNI.indexOf(d)]!;
  const idx = [...new Set(dni)].map((d) => DNI.indexOf(d)).sort((a, b) => a - b);
  const grupy: number[][] = [];
  for (const i of idx) {
    const g = grupy[grupy.length - 1];
    if (g && g[g.length - 1] === i - 1) g.push(i);
    else grupy.push([i]);
  }
  const czesci = grupy.map((g) => {
    const a = DNI[g[0]!]!;
    const b = DNI[g[g.length - 1]!]!;
    if (g.length === 1) return MALE(a);
    if (g.length === 2) return `${MALE(a)}, ${MALE(b)}`;
    return `${MALE(a)}–${MALE(b)}`;
  });
  const tekst = czesci.join(', ');
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

export const godzina = (g: string) => g.replace(/^0(\d)/, '$1');

/** Godziny otwarcia z dniami zamkniętymi (gdy klient podał jakiekolwiek godziny). */
export function wierszeGodzin(f: Firma, jezyk: Jezyk = 'pl'): { dni: string; czas: string }[] {
  if (!f.godziny.length) return [];
  const t = teksty(jezyk);
  const wiersze = f.godziny.map((g) => ({ dni: opisDni(g.dni, jezyk), czas: `${godzina(g.od)}–${godzina(g.do)}` }));
  const otwarte = new Set(f.godziny.flatMap((g) => g.dni));
  const zamkniete = DNI.filter((d) => !otwarte.has(d));
  if (zamkniete.length) wiersze.push({ dni: zamkniete.length === 1 ? t.dniPelne[DNI.indexOf(zamkniete[0]!)]! : opisDni(zamkniete, jezyk), czas: t.nieczynne });
  return wiersze;
}

export function listaGodzin(f: Firma, klasa = 'godziny-lista', jezyk: Jezyk = 'pl'): string {
  const w = wierszeGodzin(f, jezyk);
  if (!w.length) return '';
  return `<dl class="${klasa}">${w.map((x) => `<div><dt>${esc(x.dni)}</dt><dd>${esc(x.czas)}</dd></div>`).join('')}</dl>`;
}

export function adresTekst(f: Firma): string {
  return f.adres ? `${f.adres.ulica}, ${f.adres.kod} ${f.adres.miasto}` : '';
}

/**
 * Atrybuty edycji na stronie dla danych firmy (paczka 123: `atrFirmy` z edycja.ts – klik otwiera pole w formularzu
 * „Firma i SEO”); poza edycją pusta funkcja.
 */
export type AtrDanych = (pole: 'telefon' | 'email' | 'adres.ulica') => string;
const bezAtr: AtrDanych = () => '';

export function adresHtml(f: Firma, atr: AtrDanych = bezAtr): string {
  if (!f.adres) return '';
  return `<address${atr('adres.ulica')}>${esc(f.adres.ulica)}<br>${esc(f.adres.kod)} ${esc(f.adres.miasto)}</address>`;
}

export function telefonLink(f: Firma, klasa = '', atr: AtrDanych = bezAtr): string {
  return f.telefon ? `<a${klasa ? ` class="${klasa}"` : ''} href="${esc(telHref(f.telefon))}"${atr('telefon')}>${esc(f.telefon)}</a>` : '';
}

export function emailLink(f: Firma, klasa = '', atr: AtrDanych = bezAtr): string {
  return f.email ? `<a${klasa ? ` class="${klasa}"` : ''} href="mailto:${esc(f.email)}"${atr('email')}>${esc(f.email)}</a>` : '';
}

/** Lista danych kontaktowych z ikonami (sekcja kontakt). */
export function daneKontaktowe(f: Firma, atr: AtrDanych = bezAtr, jezyk: Jezyk = 'pl'): string {
  const w: string[] = [];
  const t = teksty(jezyk);
  if (f.adres) w.push(`<li>${ikona('pin')}<div><span class="et">${esc(t.adres)}</span>${adresHtml(f, atr)}</div></li>`);
  if (f.telefon) w.push(`<li>${ikona('telefon')}<div><span class="et">${esc(t.telefonEt)}</span>${telefonLink(f, '', atr)}</div></li>`);
  if (f.email) w.push(`<li>${ikona('mail')}<div><span class="et">${esc(t.emailEt)}</span>${emailLink(f, '', atr)}</div></li>`);
  if (f.godziny.length) w.push(`<li>${ikona('zegar')}<div><span class="et">${esc(t.godzinyOtwarcia)}</span>${listaGodzin(f, 'godziny-lista', jezyk)}</div></li>`);
  if (f.obszar) w.push(`<li>${ikona('pin')}<div><span class="et">${esc(t.obszar)}</span><p>${esc(f.obszar)}</p></div></li>`);
  return w.length ? `<ul class="dane-kontaktowe">${w.join('')}</ul>` : '';
}

/** Link do map – bez osadzania (żadnych iframe ani skryptów map przed kliknięciem). */
export function linkMapy(f: Firma): string | null {
  if (!f.adres) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${f.nazwa}, ${adresTekst(f)}`)}`;
}
