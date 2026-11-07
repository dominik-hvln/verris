import type { Firma } from '../model.ts';
import { esc } from './esc.ts';
import { ikona } from './ikony.ts';
import { telHref } from './linki.ts';

type Dzien = 'pn' | 'wt' | 'sr' | 'cz' | 'pt' | 'so' | 'nd';
export const DNI: Dzien[] = ['pn', 'wt', 'sr', 'cz', 'pt', 'so', 'nd'];
const PELNE: Record<Dzien, string> = { pn: 'Poniedziałek', wt: 'Wtorek', sr: 'Środa', cz: 'Czwartek', pt: 'Piątek', so: 'Sobota', nd: 'Niedziela' };
const MALE: Record<Dzien, string> = { pn: 'poniedziałek', wt: 'wtorek', sr: 'środa', cz: 'czwartek', pt: 'piątek', so: 'sobota', nd: 'niedziela' };
export const SCHEMA_DNI: Record<Dzien, string> = { pn: 'Monday', wt: 'Tuesday', sr: 'Wednesday', cz: 'Thursday', pt: 'Friday', so: 'Saturday', nd: 'Sunday' };

/** ['pn','wt','sr'] → „Poniedziałek–środa”; ['pn','sr'] → „Poniedziałek, środa”. */
export function opisDni(dni: Dzien[]): string {
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
    if (g.length === 1) return MALE[a];
    if (g.length === 2) return `${MALE[a]}, ${MALE[b]}`;
    return `${MALE[a]}–${MALE[b]}`;
  });
  const tekst = czesci.join(', ');
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

export const godzina = (g: string) => g.replace(/^0(\d)/, '$1');

/** Godziny otwarcia z dniami zamkniętymi (gdy klient podał jakiekolwiek godziny). */
export function wierszeGodzin(f: Firma): { dni: string; czas: string }[] {
  if (!f.godziny.length) return [];
  const wiersze = f.godziny.map((g) => ({ dni: opisDni(g.dni), czas: `${godzina(g.od)}–${godzina(g.do)}` }));
  const otwarte = new Set(f.godziny.flatMap((g) => g.dni));
  const zamkniete = DNI.filter((d) => !otwarte.has(d));
  if (zamkniete.length) wiersze.push({ dni: zamkniete.length === 1 ? PELNE[zamkniete[0]!] : opisDni(zamkniete), czas: 'nieczynne' });
  return wiersze;
}

export function listaGodzin(f: Firma, klasa = 'godziny-lista'): string {
  const w = wierszeGodzin(f);
  if (!w.length) return '';
  return `<dl class="${klasa}">${w.map((x) => `<div><dt>${esc(x.dni)}</dt><dd>${esc(x.czas)}</dd></div>`).join('')}</dl>`;
}

export function adresTekst(f: Firma): string {
  return f.adres ? `${f.adres.ulica}, ${f.adres.kod} ${f.adres.miasto}` : '';
}

export function adresHtml(f: Firma): string {
  if (!f.adres) return '';
  return `<address>${esc(f.adres.ulica)}<br>${esc(f.adres.kod)} ${esc(f.adres.miasto)}</address>`;
}

export function telefonLink(f: Firma, klasa = ''): string {
  return f.telefon ? `<a${klasa ? ` class="${klasa}"` : ''} href="${esc(telHref(f.telefon))}">${esc(f.telefon)}</a>` : '';
}

export function emailLink(f: Firma, klasa = ''): string {
  return f.email ? `<a${klasa ? ` class="${klasa}"` : ''} href="mailto:${esc(f.email)}">${esc(f.email)}</a>` : '';
}

/** Lista danych kontaktowych z ikonami (sekcja kontakt). */
export function daneKontaktowe(f: Firma): string {
  const w: string[] = [];
  if (f.adres) w.push(`<li>${ikona('pin')}<div><span class="et">Adres</span>${adresHtml(f)}</div></li>`);
  if (f.telefon) w.push(`<li>${ikona('telefon')}<div><span class="et">Telefon</span>${telefonLink(f)}</div></li>`);
  if (f.email) w.push(`<li>${ikona('mail')}<div><span class="et">E-mail</span>${emailLink(f)}</div></li>`);
  if (f.godziny.length) w.push(`<li>${ikona('zegar')}<div><span class="et">Godziny otwarcia</span>${listaGodzin(f)}</div></li>`);
  if (f.obszar) w.push(`<li>${ikona('pin')}<div><span class="et">Obszar działania</span><p>${esc(f.obszar)}</p></div></li>`);
  return w.length ? `<ul class="dane-kontaktowe">${w.join('')}</ul>` : '';
}

/** Link do map – bez osadzania (żadnych iframe ani skryptów map przed kliknięciem). */
export function linkMapy(f: Firma): string | null {
  if (!f.adres) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${f.nazwa}, ${adresTekst(f)}`)}`;
}
