import { randomInt } from 'node:crypto';

/**
 * Paczka 129 (feedback bety 19.11.2026) – adres techniczny usługi hostingowej: `<identyfikator>.<DOMENA_TECHNICZNA>`.
 *
 * DOMENA_TECHNICZNA (zmienna `HOSTING_TECH_DOMAIN`) MUSI BYĆ OSOBNĄ DOMENĄ REJESTROWALNĄ, nie poddomeną verris.pl
 * ani domeny paneli. Pod adresem technicznym działa treść klienta z jego skryptami (PHP, JS, ciasteczka). Panele
 * trzymają sesję w ciasteczkach domeny `.verris.pl` (AUTH_COOKIE_DOMAIN), a przeglądarka traktuje wszystkie
 * poddomeny jednej domeny rejestrowalnej jako „ten sam site” – strona klienta pod `x.verris.pl` mogłaby ustawiać
 * (cookie tossing) i w części odczytywać ciasteczka paneli. Dlatego GitHub trzyma strony użytkowników na github.io,
 * a nie na github.com. Ta sama zasada co przy domenie podglądu (PODGLAD_DOMENA, apps/api/src/podglad).
 */

/** Identyfikator: `v` + 7 znaków [a-z0-9] – krótki, bez danych osobowych, bez nazw węzłów i bez loginu konta. */
export const DLUGOSC_IDENTYFIKATORA = 8;
const ZNAKI = 'abcdefghijklmnopqrstuvwxyz0123456789';
const WZORZEC_DOMENY = /^(?=.{4,200}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const WZORZEC_IDENTYFIKATORA = /^v[a-z0-9]{7}$/;

export function losowyIdentyfikator(): string {
  let wynik = 'v';
  for (let i = 1; i < DLUGOSC_IDENTYFIKATORA; i++) wynik += ZNAKI[randomInt(ZNAKI.length)];
  return wynik;
}

/** Postać domeny do porównań: małe litery, bez kropek na brzegach i bez kropki wiodącej ciasteczka (`.verris.pl`). */
export function normalizujDomene(d: string | null | undefined): string {
  return (d ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
}

/** `a` to `b` albo jej poddomena. */
function wDomenie(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`);
}

/** Domena rodzica hosta panelu (`panel.verris.pl` → `verris.pl`); host z dwiema etykietami zostaje sobą. */
function domenaRodzica(host: string): string {
  const etykiety = host.split('.');
  return etykiety.length > 2 ? etykiety.slice(1).join('.') : host;
}

export type KonfiguracjaDomenyTechnicznej =
  | { domena: string; blad: null }
  | { domena: null; blad: string | null };

/**
 * Odczyt i walidacja `HOSTING_TECH_DOMAIN`. Pusta → funkcja wyłączona (bez błędu). Domena w domenie paneli
 * (verris.pl, rodzic hosta CLIENT/STAFF/ADMIN_PANEL_URL, AUTH_COOKIE_DOMAIN) albo odwrotnie → funkcja wyłączona
 * z błędem do logu przy starcie API (patrz opis pliku).
 */
export function konfiguracjaDomenyTechnicznej(env: {
  HOSTING_TECH_DOMAIN?: string;
  CLIENT_PANEL_URL?: string;
  STAFF_PANEL_URL?: string;
  ADMIN_PANEL_URL?: string;
  AUTH_COOKIE_DOMAIN?: string;
}): KonfiguracjaDomenyTechnicznej {
  const domena = normalizujDomene(env.HOSTING_TECH_DOMAIN);
  if (!domena) return { domena: null, blad: null };
  if (!WZORZEC_DOMENY.test(domena)) {
    return { domena: null, blad: `HOSTING_TECH_DOMAIN=${domena} nie jest poprawną domeną – zamówienia bez domeny wyłączone.` };
  }
  const panele = ['verris.pl', normalizujDomene(env.AUTH_COOKIE_DOMAIN)];
  for (const url of [env.CLIENT_PANEL_URL, env.STAFF_PANEL_URL, env.ADMIN_PANEL_URL]) {
    try {
      const host = url ? new URL(url).hostname.toLowerCase() : '';
      if (host && host !== 'localhost' && host.includes('.')) panele.push(domenaRodzica(host));
    } catch {
      /* zły adres panelu wyłapuje inna walidacja */
    }
  }
  const konflikt = panele.filter(Boolean).find((p) => wDomenie(domena, p) || wDomenie(p, domena));
  if (konflikt) {
    return {
      domena: null,
      blad:
        `HOSTING_TECH_DOMAIN=${domena} leży w domenie paneli (${konflikt}) – treść klientów dzieliłaby ciasteczka z panelami. ` +
        'Użyj osobnej domeny (jak github.io przy github.com). Zamówienia bez domeny wyłączone.',
    };
  }
  return { domena, blad: null };
}

/** Pełny adres techniczny z identyfikatora. */
export function adresTechniczny(identyfikator: string, domena: string): string {
  return `${identyfikator}.${domena}`;
}

/** Etykieta rekordu w strefie domeny technicznej (`v7k2m9qx.verris-host.pl` → `v7k2m9qx`), null gdy spoza strefy. */
export function etykietaWStrefie(adres: string, domena: string): string | null {
  const a = normalizujDomene(adres);
  const d = normalizujDomene(domena);
  if (!a.endsWith(`.${d}`)) return null;
  const etykieta = a.slice(0, -(d.length + 1));
  return WZORZEC_IDENTYFIKATORA.test(etykieta) ? etykieta : null;
}

/** Domena podana przez klienta leży w domenie technicznej (zarezerwowanej na adresy usług). */
export function wDomenieTechnicznej(domenaKlienta: string, domenaTechniczna: string | null): boolean {
  if (!domenaTechniczna) return false;
  return wDomenie(normalizujDomene(domenaKlienta), domenaTechniczna);
}

export const KOMUNIKAT_DOMENY_TECHNICZNEJ =
  'Ten adres jest zarezerwowany na adresy techniczne usług Verris. Podaj własną domenę.';
export const KOMUNIKAT_BEZ_DOMENY_NIEDOSTEPNE =
  'Zamówienie bez domeny jest chwilowo niedostępne – podaj domenę.';
