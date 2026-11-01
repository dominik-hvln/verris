/**
 * Asystent AI na verris.pl — logika widgetu bez Reacta (testowalna w jest/node). Projekt: claude/asystent-ai-www.md,
 * plansza „Asystent AI” w makiecie 1.11. API: POST /public/asystent (apps/api/src/ai/asystent-www).
 */

export interface ZrodloAsystenta {
  id: string;
  tytul: string;
  url: string | null;
}

export interface OdpowiedzAsystenta {
  rozmowaId: string;
  odpowiedz: string;
  zrodla: ZrodloAsystenta[];
  nieWiem: boolean;
}

/** Kody błędów z API (pole `kod`). */
export type KodAsystenta = 'NIEDOSTEPNY' | 'BRAK_KONFIGURACJI' | 'CAPTCHA_WYMAGANA' | 'LIMIT_ROZMOWY' | 'LIMIT_DOBOWY';

export type WynikAsystenta =
  | { ok: true; dane: OdpowiedzAsystenta }
  | { ok: false; status: number; kod?: KodAsystenta; komunikat?: string };

export interface WiadomoscCzatu {
  rola: 'ja' | 'asystent';
  tresc: string;
  zrodla?: ZrodloAsystenta[];
  /** Asystent nie wiedział albo API odmówiło — pod wiadomością karta „Poproś o telefon”. */
  przekaz?: boolean;
  /** Komunikat systemowy (błąd, limit) — inny wygląd, nie trafia do historii API. */
  systemowa?: boolean;
}

export const MAKS_ZNAKOW = 1000;
export const CAPTCHA_OD_WIADOMOSCI = 4;

export const POWITANIE =
  'Cześć! Odpowiem na pytania o hosting, przeniesienie strony, pocztę i ceny. Każdą odpowiedź podam ze źródłem.';
export const UWAGA_AI = 'Rozmawiasz z asystentem AI. Nie podawaj haseł ani danych do płatności.';
export const STOPKA_AI = 'Odpowiedzi mogą zawierać błędy. Wiążące są regulamin i cennik.';
export const PODPOWIEDZI = ['Ile kosztuje hosting?', 'Przenieście moją stronę', 'Poczta bez hostingu'] as const;

/** Czy widget jest włączony (flaga budowania; domyślnie wyłączony). */
export function asystentWlaczony(flaga: string | undefined): boolean {
  return flaga === '1' || flaga === 'true';
}

/** Treść błędu z odpowiedzi Nest (`message` bywa tablicą przy walidacji DTO). */
export function odczytajBlad(status: number, cialo: unknown): { ok: false; status: number; kod?: KodAsystenta; komunikat?: string } {
  const b = (cialo && typeof cialo === 'object' ? cialo : {}) as { kod?: unknown; message?: unknown };
  const kody: KodAsystenta[] = ['NIEDOSTEPNY', 'BRAK_KONFIGURACJI', 'CAPTCHA_WYMAGANA', 'LIMIT_ROZMOWY', 'LIMIT_DOBOWY'];
  const kod = kody.find((k) => k === b.kod);
  const m = Array.isArray(b.message) ? b.message[0] : b.message;
  return { ok: false, status, ...(kod ? { kod } : {}), ...(typeof m === 'string' && m ? { komunikat: m } : {}) };
}

/** Sprawdza kształt odpowiedzi API — widget nie pokazuje niczego spoza kontraktu. */
export function odczytajOdpowiedz(cialo: unknown): OdpowiedzAsystenta | null {
  const b = cialo as Partial<OdpowiedzAsystenta> | null;
  if (!b || typeof b.rozmowaId !== 'string' || typeof b.odpowiedz !== 'string' || !Array.isArray(b.zrodla)) return null;
  const zrodla = b.zrodla
    .filter((z): z is ZrodloAsystenta => !!z && typeof z.id === 'string' && typeof z.tytul === 'string')
    .map((z) => ({ id: z.id, tytul: z.tytul, url: bezpiecznyUrl(z.url) }));
  return { rozmowaId: b.rozmowaId, odpowiedz: b.odpowiedz, zrodla, nieWiem: b.nieWiem === true };
}

/** Linki źródeł tylko do verris.pl i jego subdomen (https) — reszta bez linku. */
export function bezpiecznyUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && (x.hostname === 'verris.pl' || x.hostname.endsWith('.verris.pl')) ? x.toString() : null;
  } catch {
    return null;
  }
}

/** Co pokazać po błędzie API. `przekaz` = karta „Poproś o telefon”; `captcha` = pokaż test i wyślij ponownie. */
export function reakcjaNaBlad(w: { status: number; kod?: KodAsystenta; komunikat?: string }): {
  tresc: string;
  przekaz: boolean;
  captcha: boolean;
  nowaRozmowa: boolean;
} {
  switch (w.kod) {
    case 'CAPTCHA_WYMAGANA':
      return { tresc: 'Potwierdź, że nie jesteś botem, i wyślij pytanie jeszcze raz.', przekaz: false, captcha: true, nowaRozmowa: false };
    case 'LIMIT_ROZMOWY':
      return {
        tresc: 'Ta rozmowa jest już długa. Zacznij nową albo zostaw numer — przekażemy ją człowiekowi.',
        przekaz: true,
        captcha: false,
        nowaRozmowa: true,
      };
    case 'LIMIT_DOBOWY':
      return { tresc: w.komunikat ?? 'Na dziś to już wszystkie pytania. Wróć jutro albo zostaw numer.', przekaz: true, captcha: false, nowaRozmowa: false };
    case 'NIEDOSTEPNY':
    case 'BRAK_KONFIGURACJI':
      return { tresc: 'Asystent jest chwilowo niedostępny. Zostaw numer — oddzwonimy w dni robocze 9–17.', przekaz: true, captcha: false, nowaRozmowa: false };
  }
  if (w.status === 429) {
    return { tresc: 'Za dużo pytań w krótkim czasie. Spróbuj za kilka minut albo zostaw numer.', przekaz: true, captcha: false, nowaRozmowa: false };
  }
  if (w.status === 400 && w.komunikat) return { tresc: w.komunikat, przekaz: false, captcha: false, nowaRozmowa: false };
  if (w.status === 503) {
    return { tresc: 'Asystent jest chwilowo niedostępny. Zostaw numer — oddzwonimy w dni robocze 9–17.', przekaz: true, captcha: false, nowaRozmowa: false };
  }
  return { tresc: 'Nie udało się połączyć z asystentem. Spróbuj ponownie za chwilę.', przekaz: false, captcha: false, nowaRozmowa: false };
}

/** Pamięć karty (sessionStorage, nie cookie): id rozmowy i jej przebieg — przetrwa przejście na inną stronę verris.pl. */
export const KLUCZ_SESJI = 'verris:asystent';

export interface StanSesji {
  rozmowaId: string | null;
  wiadomosci: WiadomoscCzatu[];
  wymiany: number;
}

export function wczytajSesje(magazyn: Pick<Storage, 'getItem'> | undefined): StanSesji {
  const pusty: StanSesji = { rozmowaId: null, wiadomosci: [], wymiany: 0 };
  try {
    const s = magazyn?.getItem(KLUCZ_SESJI);
    if (!s) return pusty;
    const v = JSON.parse(s) as Partial<StanSesji>;
    return {
      rozmowaId: typeof v.rozmowaId === 'string' ? v.rozmowaId : null,
      wiadomosci: Array.isArray(v.wiadomosci) ? v.wiadomosci.filter((w) => w && typeof w.tresc === 'string').slice(-40) : [],
      wymiany: typeof v.wymiany === 'number' ? v.wymiany : 0,
    };
  } catch {
    return pusty;
  }
}

export function zapiszSesje(magazyn: Pick<Storage, 'setItem'> | undefined, stan: StanSesji): void {
  try {
    magazyn?.setItem(KLUCZ_SESJI, JSON.stringify({ ...stan, wiadomosci: stan.wiadomosci.slice(-40) }));
  } catch {
    /* prywatne okno albo pełna pamięć — rozmowa zostaje tylko w tej karcie */
  }
}

/** Akapity odpowiedzi (model pisze zwykły tekst; pusta linia = nowy akapit). */
export function akapity(t: string): string[] {
  return t
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}
