/**
 * Otwarte testy przed startem (PB-26) — stałe i logika formularza zgłoszeń z verris.pl/beta.
 * Bez 'use client' / 'use server': moduł używa i strona (serwer), i formularz (przeglądarka), a testy jest
 * sprawdzają go bez DOM.
 */
import { plForm } from './pl';

/** Termin otwartej bety na węźle produkcyjnym (BETA_TESTY.md, harmonogram wariant A: 7–20.12.2026). */
export const BETA_TERMIN = '7–20 grudnia 2026';
export const BETA_MIESIAC = 'grudzień 2026';

/**
 * Musi być zgodne z apps/api/src/beta/beta.service.ts (KREDYT_TESTOW = 150, WAZNOSC_DNI = 14):
 * zaproszenie = imienny kod FIXED_CREDIT na 150 K, jedno użycie, ważny 14 dni od wysłania.
 */
export const KREDYT_TESTOW = 150;
export const WAZNOSC_KODU_DNI = 14;

/** Na ile pełnych miesięcy hostingu (cena miesięczna brutto z API) wystarcza kredyt testera. */
export function miesiaceZKredytu(cenaMiesieczna: number): string {
  const n = cenaMiesieczna > 0 ? Math.floor(KREDYT_TESTOW / cenaMiesieczna) : 0;
  if (n < 1) return 'pierwszy miesiąc hostingu';
  return `ok. ${n} ${plForm(n, 'miesiąc', 'miesiące', 'miesięcy')} hostingu`;
}

export type ZakresTestu = 'WORDPRESS' | 'SKLEP' | 'STRONY_DLA_KLIENTOW' | 'POCZTA' | 'INNE';

export const ZAKRESY: { id: ZakresTestu; label: string }[] = [
  { id: 'WORDPRESS', label: 'WordPress' },
  { id: 'SKLEP', label: 'Sklep' },
  { id: 'STRONY_DLA_KLIENTOW', label: 'Strony dla klientów' },
  { id: 'POCZTA', label: 'Tylko poczta' },
  { id: 'INNE', label: 'Coś innego' },
];

/** Treść zgody przy checkboxie — ta sama trafia do API jako `zgodaTekst` (dowód RODO). */
export const ZGODA_BETA =
  'Chcę dostać zaproszenie do testów i wiadomości z nimi związane. Administratorem danych jest HVLN Dominik Kowalski; szczegóły w polityce prywatności.';

export type Utm = Partial<Record<'source' | 'medium' | 'campaign' | 'content' | 'term', string>>;

const UTM_KLUCZE = ['source', 'medium', 'campaign', 'content', 'term'] as const;
const UTM_STORAGE = 'verris-beta-utm';

/** utm_* z adresu strony (każda wartość przycięta do 100 znaków); `undefined`, gdy nie ma żadnego. */
export function utmZAdresu(search: string): Utm | undefined {
  const p = new URLSearchParams(search);
  const utm: Utm = {};
  for (const k of UTM_KLUCZE) {
    const v = p.get(`utm_${k}`)?.trim();
    if (v) utm[k] = v.slice(0, 100);
  }
  return Object.keys(utm).length ? utm : undefined;
}

type Magazyn = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * UTM z wejścia na stronę: z adresu (i zapamiętane w sessionStorage), a gdy adres ich nie ma — z sessionStorage
 * (użytkownik przeszedł po stronie przed wysłaniem). Storage może rzucić (tryb prywatny, blokada) — wtedy tylko adres.
 */
export function zapamietajUtm(search: string, magazyn?: Magazyn | null): Utm | undefined {
  const zAdresu = utmZAdresu(search);
  try {
    if (zAdresu) {
      magazyn?.setItem(UTM_STORAGE, JSON.stringify(zAdresu));
      return zAdresu;
    }
    const zapis = magazyn?.getItem(UTM_STORAGE);
    if (!zapis) return undefined;
    const dane = JSON.parse(zapis) as Record<string, unknown>;
    const utm: Utm = {};
    for (const k of UTM_KLUCZE) if (typeof dane[k] === 'string' && dane[k]) utm[k] = (dane[k] as string).slice(0, 100);
    return Object.keys(utm).length ? utm : undefined;
  } catch {
    return zAdresu;
  }
}

export type DaneFormularza = {
  imie: string;
  email: string;
  zakres: ZakresTestu[];
  strona: string;
  obecnyHosting: string;
  uwagi: string;
  zgoda: boolean;
  /** Honeypot — ukryte pole; człowiek go nie wypełni. */
  firma: string;
};

export type ZgloszenieBeta = {
  imie: string;
  email: string;
  zakres: ZakresTestu[];
  strona?: string;
  obecnyHosting?: string;
  uwagi?: string;
  zgoda: true;
  zgodaTekst: string;
  utm?: Utm;
  page?: string;
  firma: string;
  captchaToken?: string;
};

const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$/;

/** Błędy walidacji po stronie przeglądarki (pole → komunikat). Pusty obiekt = można wysłać. */
export function walidujZgloszenie(d: DaneFormularza): Partial<Record<'imie' | 'email' | 'zakres' | 'strona' | 'zgoda', string>> {
  const bledy: Partial<Record<'imie' | 'email' | 'zakres' | 'strona' | 'zgoda', string>> = {};
  if (!d.imie.trim()) bledy.imie = 'Wpisz imię.';
  if (!EMAIL_RE.test(d.email.trim())) bledy.email = 'Wpisz poprawny adres e-mail.';
  if (d.zakres.length === 0) bledy.zakres = 'Wybierz co najmniej jedną rzecz do przetestowania.';
  const strona = d.strona.trim();
  if (strona) {
    let ok = false;
    try {
      const u = new URL(strona);
      ok = (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
    } catch {
      ok = false;
    }
    if (!ok) bledy.strona = 'Adres strony zaczyna się od https:// albo http://.';
  }
  if (!d.zgoda) bledy.zgoda = 'Zaznacz zgodę, żebyśmy mogli wysłać zaproszenie.';
  return bledy;
}

/** Treść żądania POST /public/beta/zgloszenia (puste pola opcjonalne pomijane). */
export function budujZgloszenie(d: DaneFormularza, ctx: { utm?: Utm; page?: string; captchaToken?: string }): ZgloszenieBeta {
  const opc = (v: string, max: number) => (v.trim() ? v.trim().slice(0, max) : undefined);
  return {
    imie: d.imie.trim().slice(0, 100),
    email: d.email.trim().toLowerCase(),
    zakres: ZAKRESY.map((z) => z.id).filter((id) => d.zakres.includes(id)),
    strona: opc(d.strona, 2048),
    obecnyHosting: opc(d.obecnyHosting, 100),
    uwagi: opc(d.uwagi, 2000),
    zgoda: true,
    zgodaTekst: ZGODA_BETA,
    utm: ctx.utm,
    page: ctx.page,
    firma: d.firma,
    captchaToken: ctx.captchaToken,
  };
}

/** Komunikat dla użytkownika po nieudanej wysyłce; `kontakt` = pokaż link do /kontakt. */
export function komunikatBledu(status?: number): { tekst: string; kontakt: boolean } {
  if (status === 429) return { tekst: 'Za dużo prób z tego adresu, spróbuj za godzinę.', kontakt: false };
  if (status === 400) return { tekst: 'Sprawdź pola formularza i spróbuj ponownie.', kontakt: false };
  return { tekst: 'Nie udało się wysłać zgłoszenia. Spróbuj ponownie za chwilę albo napisz do nas.', kontakt: true };
}

export type WynikWysylki = { ok: boolean; status?: number };

/**
 * Wysyłka zgłoszenia: walidacja → żądanie → zdarzenie leada WYŁĄCZNIE po przyjęciu przez API.
 * `onLead` to `events.generateLead('beta_signup')` — tagi GA4/Meta odpalają się i tak tylko po zgodzie cookies.
 */
export async function wyslijZgloszenie(
  d: DaneFormularza,
  ctx: { utm?: Utm; page?: string; captchaToken?: string },
  deps: { submit: (z: ZgloszenieBeta) => Promise<WynikWysylki>; onLead: () => void },
): Promise<
  | { stan: 'bledy'; bledy: ReturnType<typeof walidujZgloszenie> }
  | { stan: 'wyslane' }
  | { stan: 'blad'; tekst: string; kontakt: boolean }
> {
  const bledy = walidujZgloszenie(d);
  if (Object.keys(bledy).length) return { stan: 'bledy', bledy };
  const res = await deps.submit(budujZgloszenie(d, ctx));
  if (!res.ok) return { stan: 'blad', ...komunikatBledu(res.status) };
  deps.onLead();
  return { stan: 'wyslane' };
}
