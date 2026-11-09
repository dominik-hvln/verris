import { JEZYKI, MAKS_POL_FORMULARZA, NAZWY_JEZYKOW_PL, type Jezyk } from '@verris/kreator';

/**
 * Formularz kontaktowy opublikowanych stron z kreatora – czyste funkcje (odczyt pól, ocena spamu, adres powrotu,
 * treść maila). Serwis: formularz.service.ts. Markup formularza: libs/kreator/src/render/sekcje/wspolne.ts.
 */

export const POLA_TRESCI = ['imie', 'email', 'telefon', 'firma', 'termin', 'usluga', 'wiadomosc'] as const;
export type PoleTresci = (typeof POLA_TRESCI)[number];

const ETYKIETY: Record<PoleTresci, string> = {
  imie: 'Imię',
  email: 'E-mail',
  telefon: 'Telefon',
  firma: 'Firma',
  termin: 'Preferowany termin',
  usluga: 'Usługa',
  wiadomosc: 'Wiadomość',
};

/** Pola techniczne formularza (ukryte, honeypot, zgoda) – też z limitem długości. */
const MAKS_TECHNICZNYCH: Record<string, number> = { formularz: 60, powrot: 2048, czas: 20, strona_www: 500, zgoda: 10, jezyk: 5 };

/** Wysyłka szybsza niż tyle od załadowania strony (czas mierzy skrypt strony) = bot. */
export const MIN_CZAS_MS = 3000;

export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const SEKCJA_RE = /^[a-z][a-z0-9-]{0,59}$/;
const LINK_RE = /https?:\/\/|www\.|\[url|<a\s/i;

export interface DaneFormularza {
  pola: Partial<Record<PoleTresci, string>>;
  /** Id sekcji z formularzem (kotwica po powrocie) albo null. */
  sekcja: string | null;
  powrot: string;
  /** Czas od załadowania strony do wysyłki (ms, z przeglądarki) albo null, gdy skrypt go nie wpisał. */
  czas: number | null;
  honeypot: string;
  /** Paczka 124 – język podstrony z formularzem (ukryte pole `jezyk`); brak albo nieznany = null (strona sprzed wersji językowych). */
  jezyk: Jezyk | null;
}

export type OdczytFormularza = { ok: true; dane: DaneFormularza } | { ok: false; powod: string };

/** Znaki sterujące (poza nową linią) i znaki zmiany kierunku tekstu – usuwane z treści maila. */
 
const STERUJACE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

function czysc(v: string, wielowierszowe: boolean): string {
  const t = v.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(STERUJACE, '');
  return (wielowierszowe ? t.replace(/\n{3,}/g, '\n\n') : t.replace(/\n+/g, ' ')).trim();
}

/**
 * Treść POST (application/x-www-form-urlencoded) → pola. Każda wartość musi być tekstem w limicie długości
 * (tablice z `a[]=` i obiekty odrzucane); wymagane: zgoda, imię i e-mail albo telefon; e-mail – poprawny.
 */
export function odczytajFormularz(body: unknown): OdczytFormularza {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, powod: 'brak-tresci' };
  const b = body as Record<string, unknown>;
  const tekst = (nazwa: string, maks: number): string | null | false => {
    const v = b[nazwa];
    if (v === undefined) return null;
    if (typeof v !== 'string') return false;
    return v.replace(/\r\n?/g, '\n').length > maks ? false : v;
  };
  const pola: Partial<Record<PoleTresci, string>> = {};
  for (const p of POLA_TRESCI) {
    const v = tekst(p, MAKS_POL_FORMULARZA[p] ?? 200);
    if (v === false) return { ok: false, powod: `pole-${p}` };
    if (v !== null) {
      const c = czysc(v, p === 'wiadomosc');
      if (c) pola[p] = c;
    }
  }
  const tech: Record<string, string> = {};
  for (const [n, maks] of Object.entries(MAKS_TECHNICZNYCH)) {
    const v = tekst(n, maks);
    if (v === false) return { ok: false, powod: `pole-${n}` };
    tech[n] = v ?? '';
  }
  if (tech.zgoda !== 'tak') return { ok: false, powod: 'zgoda' };
  if (!pola.imie) return { ok: false, powod: 'imie' };
  if (!pola.email && !pola.telefon) return { ok: false, powod: 'kontakt' };
  if (pola.email && !EMAIL_RE.test(pola.email)) return { ok: false, powod: 'email' };
  const czas = /^\d{1,9}$/.test(tech.czas.trim()) ? Number(tech.czas.trim()) : null;
  return {
    ok: true,
    dane: {
      pola,
      sekcja: SEKCJA_RE.test(tech.formularz) ? tech.formularz : null,
      powrot: tech.powrot.trim(),
      czas,
      honeypot: tech.strona_www.trim(),
      jezyk: (JEZYKI as readonly string[]).includes(tech.jezyk.trim()) ? (tech.jezyk.trim() as Jezyk) : null,
    },
  };
}

/** Host adresu (Origin/Referer/powrót) to domena strony albo jej www. */
export function hostDomeny(adres: string | undefined | null, domena: string): boolean {
  if (!adres || !URL.canParse(adres)) return false;
  const u = new URL(adres);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  return u.host === domena || u.host === `www.${domena}`;
}

/**
 * Ocena spamu.
 * - `pulapka` – wypełnione pole-pułapka (honeypot): ludzie go nie widzą (aria-hidden, poza ekranem, tabindex -1).
 * - `za-szybko` – skrypt strony zmierzył mniej niż 3 s od załadowania do wysyłki.
 * - `podejrzane` – brak pomiaru czasu (bez JS albo bot, który nie wykonuje skryptów) RAZEM z innym sygnałem: żądanie
 *   nie przyszło ze strony tej domeny (Origin i Referer nie wskazują domeny publikacji) albo treść zawiera linki.
 *   Sam brak pomiaru nie odrzuca – formularz ma działać także bez JavaScriptu.
 * Decyzja: strona jest statyczna, więc znacznika czasu nie da się podpisać przy renderze (stały czas pliku); czas
 * mierzy przeglądarka (różnica dwóch odczytów zegara klienta – odporna na przesunięcie zegara). Bot może go podać
 * sam, dlatego to tylko jedna z warstw obok honeypota, limitów per IP i per strona.
 */
export type OcenaSpamu = 'ok' | 'pulapka' | 'za-szybko' | 'podejrzane';

export function ocenSpam(d: DaneFormularza, z: { origin?: string; referer?: string; domena: string }): OcenaSpamu {
  if (d.honeypot) return 'pulapka';
  if (d.czas !== null) return d.czas < MIN_CZAS_MS ? 'za-szybko' : 'ok';
  const zDomeny = hostDomeny(z.origin, z.domena) || hostDomeny(z.referer, z.domena);
  const linki = Object.values(d.pola).some((v) => LINK_RE.test(v ?? ''));
  return !zDomeny || linki ? 'podejrzane' : 'ok';
}

/**
 * Adres powrotu po wysyłce (303): podany `powrot`, gdy jego host to domena publikacji (albo www.), inaczej strona
 * główna domeny. Zawsze bez zapytania i fragmentu z wejścia; dopisane `?formularz=<wynik>#<id sekcji>`.
 */
export function adresPowrotu(powrot: string, domena: string, sekcja: string | null, wynik: 'wyslano' | 'blad'): string {
  let baza = `https://${domena}/`;
  if (hostDomeny(powrot, domena)) {
    const u = new URL(powrot);
    baza = `${u.origin}${u.pathname}`;
  }
  return `${baza}?formularz=${wynik}${sekcja && SEKCJA_RE.test(sekcja) ? `#${sekcja}` : ''}`;
}

/** Mail do właściciela strony: tylko tekst (bez części HTML), wartości pól oczyszczone z sterujących znaków. */
export function mailFormularza(d: DaneFormularza, o: { domena: string; adresStrony: string }): { subject: string; text: string; replyTo?: string } {
  const linie: string[] = [`Nowa wiadomość z formularza kontaktowego na stronie ${o.adresStrony}`, ''];
  // Mail do firmy zawsze po polsku; przy wersji językowej strony – informacja, w jakim języku pisał nadawca.
  if (d.jezyk && d.jezyk !== 'pl') linie.push(`Język strony: ${NAZWY_JEZYKOW_PL[d.jezyk]} (${d.jezyk.toUpperCase()}) – nadawca korzystał z tej wersji strony, odpowiedz najlepiej w tym języku.`, '');
  for (const p of POLA_TRESCI) {
    const v = d.pola[p];
    if (!v || p === 'wiadomosc') continue;
    linie.push(`${ETYKIETY[p]}: ${v}`);
  }
  if (d.pola.wiadomosc) linie.push('', `${ETYKIETY.wiadomosc}:`, d.pola.wiadomosc);
  linie.push('', 'Nadawca zaznaczył zgodę na przetwarzanie podanych danych w celu odpowiedzi na wiadomość.');
  const replyTo = d.pola.email && EMAIL_RE.test(d.pola.email) ? d.pola.email : undefined;
  linie.push(replyTo ? 'Żeby odpowiedzieć, użyj „Odpowiedz” w programie pocztowym – odpowiedź trafi na adres nadawcy.' : 'Nadawca nie podał adresu e-mail – odpowiedz telefonicznie.');
  linie.push('', '--', 'Wiadomość wysłana formularzem strony zbudowanej w Verris Kreator.');
  return { subject: `Wiadomość ze strony ${o.domena}`, text: `${linie.join('\n')}\n`, ...(replyTo ? { replyTo } : {}) };
}
