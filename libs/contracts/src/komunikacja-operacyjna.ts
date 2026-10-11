import { fragmentInfrastruktury } from './komunikaty-hostingu.ts';
/**
 * F3.8 — komunikacja operacyjna: mail do klienta z szablonu (karta klienta) i komunikat serwisowy do klientów węzła albo
 * planu (incydent, prace). Oba to poczta SERWISOWA (dotyczy działania usługi): wychodzi bez zgody marketingowej, więc nie
 * może mieć treści promocyjnych (PKE) — pilnuje tego trescPromocyjna() w API i w panelu. Klient widzi „obsługa Verris”,
 * bez nazwiska (D3), i żadnych nazw infrastruktury (white label).
 */

export interface SzablonMailaObslugi {
  id: string;
  nazwa: string;
  temat: string;
  /** Zwykły tekst, akapity oddzielone pustą linią. Pola: {domena}, {imie}. */
  tresc: string;
}

export const SZABLONY_MAILI_OBSLUGI: readonly SzablonMailaObslugi[] = [
  {
    id: 'kontakt',
    nazwa: 'Prośba o kontakt',
    temat: 'Prosimy o kontakt w sprawie usługi {domena}',
    tresc: 'Dzień dobry{imie},\n\npiszemy w sprawie usługi {domena}. Prosimy o odpowiedź na tę wiadomość albo kontakt przez zgłoszenie w panelu klienta.\n\nPozdrawiamy,\nzespół obsługi Verris',
  },
  {
    id: 'problem',
    nazwa: 'Wykryliśmy problem z usługą',
    temat: 'Usługa {domena} — wykryliśmy problem i nad nim pracujemy',
    tresc: 'Dzień dobry{imie},\n\nwykryliśmy problem, który dotyczy usługi {domena}. Pracujemy nad nim i napiszemy, gdy wszystko wróci do normy.\n\nNie musisz nic robić.\n\nPozdrawiamy,\nzespół obsługi Verris',
  },
  {
    id: 'naprawione',
    nazwa: 'Usługa działa ponownie',
    temat: 'Usługa {domena} działa ponownie',
    tresc: 'Dzień dobry{imie},\n\nusługa {domena} działa już normalnie. Przepraszamy za utrudnienia.\n\nJeśli zauważysz coś niepokojącego, odpowiedz na tę wiadomość.\n\nPozdrawiamy,\nzespół obsługi Verris',
  },
  {
    id: 'dzialanie-klienta',
    nazwa: 'Potrzebne działanie klienta',
    temat: 'Usługa {domena} — potrzebujemy Twojego działania',
    tresc: 'Dzień dobry{imie},\n\nżeby usługa {domena} działała bezpiecznie, potrzebne jest działanie po Twojej stronie:\n\n(opisz, co klient ma zrobić)\n\nW razie pytań odpowiedz na tę wiadomość.\n\nPozdrawiamy,\nzespół obsługi Verris',
  },
  {
    id: 'prace',
    nazwa: 'Zaplanowane prace serwisowe',
    temat: 'Prace serwisowe — usługa {domena}',
    tresc: 'Dzień dobry{imie},\n\nplanujemy prace serwisowe, które mogą na chwilę wpłynąć na usługę {domena}:\n\n(termin i zakres prac)\n\nPozdrawiamy,\nzespół obsługi Verris',
  },
];

export function szablonMailaObslugi(id: string | null | undefined): SzablonMailaObslugi | null {
  return SZABLONY_MAILI_OBSLUGI.find((s) => s.id === id) ?? null;
}

/** Wstawia pola szablonu; {imie} → „ Anna” (z przecinkiem w „Dzień dobry, Anna” nie zgadujemy — tylko spacja). */
export function wypelnijSzablon(tekst: string, pola: { domena?: string | null; imie?: string | null }): string {
  return tekst.replace(/\{domena\}/g, pola.domena?.trim() || 'Twoja usługa').replace(/\{imie\}/g, pola.imie?.trim() ? ` ${pola.imie.trim()}` : '');
}

export const MAIL_OBSLUGI_TEMAT_MAX = 200;
export const MAIL_OBSLUGI_TRESC_MAX = 5000;

/**
 * Treść promocyjna w poczcie serwisowej (PKE: bez zgody nie wolno). Zwraca pierwsze dopasowane wyrażenie albo null.
 * Lista celowo szeroka — przy fałszywym trafieniu operator przeformułuje zdanie.
 */
const PROMOCYJNE: readonly RegExp[] = [
  /promocj\w*/i,
  /rabat\w*/i,
  /zni[żz]k\w*/i,
  /kod\w*\s+(rabatow|promocyj)\w*/i,
  /oferta\s+specjaln\w*/i,
  /\boferty?\b/i,
  /newsletter\w*/i,
  /kup\s+teraz/i,
  /tylko\s+(dzi[śs]|teraz)/i,
  /wyprzeda[żz]\w*/i,
  /black\s*friday/i,
  /\bgratis\w*/i,
  /\bza\s+darmo\b/i,
  /polec\s+znajom\w*/i,
  /program\s+partnersk\w*/i,
  /\d+\s*%\s*(taniej|zni[żz]k|rabat)/i,
];

export function trescPromocyjna(tekst: string | null | undefined): string | null {
  const t = tekst ?? '';
  for (const r of PROMOCYJNE) {
    const m = r.exec(t);
    if (m) return m[0];
  }
  return null;
}

/**
 * White label: nazwy infrastruktury i adresy, których klient nie może zobaczyć (CLAUDE.md, D3). Audyt Fali 3 — ten sam
 * filtr co raport pomigracyjny i eksport RODO (`fragmentInfrastruktury`, komunikaty-hostingu.ts); wcześniej osobna
 * lista rozjechała się z nim (lvectl, CMD_API, ścieżki, adresy IP, ModSecurity przechodziły). Panel nie zna węzłów —
 * adresy węzłów z bazy sprawdza API (sprawdzTrescSerwisowa). `adresyIp: false` — mail do jednego klienta (jego IP).
 */
export function nazwaInfrastruktury(tekst: string | null | undefined, opcje: { adresyIp?: boolean } = {}): string | null {
  return fragmentInfrastruktury(tekst, [], opcje);
}

/** Komunikat serwisowy do klientów węzła albo planu (incydent, prace) — wysyłka kolejką z limitem. */
export type ZakresKomunikatu = 'WEZEL' | 'PLAN';
/** Ile maili na minutę wysyła kolejka komunikatów (wspólny limit dla wszystkich komunikatów). */
export const KOMUNIKAT_LIMIT_NA_MINUTE = 60;
/** Ilu odbiorców najwyżej w jednym komunikacie (powyżej — podziel zakres). */
export const KOMUNIKAT_ODBIORCY_MAX = 5000;
