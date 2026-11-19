import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Kreator marki (paczka 130) – stopka e-mail z marki dla skrzynek w domenie klienta.
 *
 * USTALENIA Z REPO (19.11.2026):
 * - Skrzynki klientów obsługuje webmail Roundcube budowany przez CustomBuild na każdym węźle hostingu
 *   (ops/scripts/node-hosting-profile.sh – blok „Webmail Verris”, plugin marki ops/roundcube/verris_marka). Panel
 *   łączy się z nim wyłącznie przez jednorazowe logowanie (DirectAdminService.createHostingWebmailLogin →
 *   CMD_WEBMAIL_LOGIN). SOGo (ops/docker-compose.sogo-mail.yml, control-plane-mail) to poczta zespołu Verris na
 *   control-plane, nie skrzynki klientów.
 * - W repo NIE MA toru, który zapisuje tożsamość (podpis) w Roundcube: ani API DirectAdmin do podpisów, ani skryptu
 *   węzła piszącego do bazy Roundcube (tabela `identities`, kolumny `signature` i `html_signature` [do weryfikacji
 *   z dokumentacją]), ani wtyczki Roundcube z takim hakiem. Zapis wprost do bazy webmaila wymagałby m.in. ustalenia
 *   bazy CustomBuild na węźle i istnienia wiersza `users` (Roundcube zakłada go przy pierwszym logowaniu
 *   [do weryfikacji z dokumentacją]) – to nie jest pewny mechanizm, więc go nie implementujemy.
 * Dlatego jedyna implementacja to „instrukcja + kopiuj HTML”: API zwraca sprawdzony kod HTML, wersję tekstową
 * i instrukcje dla programów pocztowych. Implementacja automatyczna (tryb 'automatycznie') może dojść później za tym
 * samym interfejsem – np. wtyczka Roundcube czytająca podpis z API Verris przy logowaniu przez SSO.
 */

export const USTAW_STOPKE_EMAIL = Symbol('USTAW_STOPKE_EMAIL');

export type ProgramPocztowy = 'webmail' | 'outlook' | 'gmail' | 'apple-mail' | 'thunderbird' | 'sogo';

export interface InstrukcjaStopki {
  program: ProgramPocztowy;
  nazwa: string;
  /** Co wkleić: kod HTML (pole źródła podpisu) albo skopiowany podgląd (program nie przyjmuje kodu). */
  wklej: 'kod-html' | 'podglad';
  kroki: string[];
  uwaga?: string;
  /** Ścieżki w menu spisane z wiedzy ogólnej – przed pokazaniem klientom sprawdzić w aktualnej wersji programu. */
  sprawdzone: boolean;
  /** Tylko dla zespołu Verris (SOGo na control-plane) – panel klienta tego wpisu nie pokazuje. */
  tylkoZespol?: boolean;
}

export interface WejscieStopki {
  userId: string;
  /** Skrzynka w domenie klienta, np. jan@firma.pl. */
  skrzynka: string;
  /** Stopka HTML z modułu marki (libs/kreator/src/marka/stopka-email.ts – tabele, style inline, logo PNG z https). */
  html: string;
}

export type WynikStopki =
  | { ustawiono: true; skrzynka: string }
  | { ustawiono: false; skrzynka: string; powod: string; html: string; tekst: string; instrukcje: InstrukcjaStopki[] };

/** Interfejs ustawiania stopki dla skrzynki – panel nie zależy od tego, czy ustawienie jest automatyczne. */
export interface UstawStopkeEmail {
  readonly tryb: 'automatycznie' | 'instrukcja';
  ustaw(wejscie: WejscieStopki): Promise<WynikStopki>;
}

/** Limit rozmiaru stopki: programy pocztowe przycinają długie podpisy (np. Gmail ok. 10 tys. znaków [do weryfikacji]). */
export const MAKS_STOPKI_BAJTY = 10_000;

const ZAKAZANE_ZNACZNIKI = /<\s*\/?\s*(script|iframe|frame|object|embed|form|input|button|textarea|select|link|meta|base|style|svg|math|video|audio)\b/i;
const ZDARZENIA = /\son[a-z]+\s*=/i;
const ADRES_W_ATRYBUCIE = /\b(src|href|background)\s*=\s*(["']?)\s*([^"'\s>]*)/gi;
const SKRZYNKA_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/**
 * Stopka do wklejenia w program pocztowy: bez skryptów, ramek, formularzy, SVG (programy pocztowe go nie pokazują),
 * zdarzeń `on*` i stylów blokowych; obrazy tylko z https (programy blokują `data:` i http), linki https, mailto, tel.
 * Zwraca opis błędu albo null.
 */
export function bladStopki(html: string): string | null {
  if (!html.trim()) return 'Stopka jest pusta.';
  if (Buffer.byteLength(html, 'utf8') > MAKS_STOPKI_BAJTY) return `Stopka jest za długa – najwyżej ${MAKS_STOPKI_BAJTY / 1000} kB kodu HTML.`;
  if (ZAKAZANE_ZNACZNIKI.test(html)) return 'Stopka zawiera niedozwolony element (skrypt, ramkę, formularz, SVG albo blok stylów).';
  if (ZDARZENIA.test(html)) return 'Stopka zawiera niedozwolony atrybut zdarzenia (on…).';
  for (const m of html.matchAll(ADRES_W_ATRYBUCIE)) {
    const atrybut = m[1]!.toLowerCase();
    const adres = m[3]!.trim();
    if (atrybut === 'src' || atrybut === 'background') {
      if (!/^https:\/\//i.test(adres)) return 'Obrazy w stopce muszą mieć adres https:// (np. logo z Twojego hostingu).';
    } else if (!/^(https:\/\/|mailto:|tel:)/i.test(adres)) {
      return 'Linki w stopce mogą prowadzić tylko do adresów https://, mailto: albo tel:.';
    }
  }
  if (/javascript:|vbscript:|expression\s*\(/i.test(html)) return 'Stopka zawiera niedozwolony kod.';
  return null;
}

/** Wersja tekstowa (programy bez HTML, podpis „tylko tekst”): bez znaczników i pustych wierszy, wiersze z <br>, <tr>, <p>, <div>. */
export function stopkaTekstowa(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|tr|h[1-6]|li)\s*>/gi, '\n')
    .replace(/<\/\s*td\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((w) => w.replace(/[ \t]+/g, ' ').trim())
    .filter((w) => w.length > 0)
    .join('\n')
    .trim();
}

/**
 * Instrukcje dla programów pocztowych. Ścieżki menu spisane z wiedzy ogólnej (stan do VI 2026) –
 * WSZYSTKIE [do weryfikacji z dokumentacją] producenta przed publikacją w panelu (`sprawdzone: false`).
 * Webmail Verris: Roundcube 1.6/1.7, skórka Elastic, edytor HTML podpisu (TinyMCE) z przyciskiem kodu źródłowego.
 */
export const INSTRUKCJE_STOPKI: InstrukcjaStopki[] = [
  {
    program: 'webmail',
    nazwa: 'Webmail Verris',
    wklej: 'kod-html',
    kroki: [
      'Zaloguj się do webmaila skrzynki (w panelu: Poczta → Webmail przy skrzynce).',
      'Wejdź w Ustawienia → Tożsamości i kliknij swoją tożsamość (adres skrzynki).',
      'W polu Podpis włącz edytor HTML, a potem otwórz widok kodu źródłowego (ikona <>).',
      'Wklej skopiowany kod HTML stopki, zatwierdź i kliknij Zapisz.',
      'Popraw imię, nazwisko i stanowisko – każda osoba w firmie ustawia stopkę w swojej skrzynce.',
    ],
    uwaga: 'Jeśli w ustawieniach nie widać edytora HTML, włącz tworzenie wiadomości w HTML: Ustawienia → Preferencje → Tworzenie wiadomości.',
    sprawdzone: false,
  },
  {
    program: 'outlook',
    nazwa: 'Outlook (nowy Outlook i Outlook w przeglądarce)',
    wklej: 'podglad',
    kroki: [
      'Kliknij „Kopiuj stopkę” (kopiuje podgląd, nie kod).',
      'W Outlooku otwórz Ustawienia → Konta → Podpisy.',
      'Dodaj nowy podpis, wklej skopiowaną stopkę (Ctrl+V, na Macu Cmd+V) i zapisz.',
      'Wybierz ten podpis dla nowych wiadomości i odpowiedzi.',
    ],
    uwaga: 'Outlook nie przyjmuje kodu HTML w polu podpisu – wklejasz gotowy podgląd.',
    sprawdzone: false,
  },
  {
    program: 'gmail',
    nazwa: 'Gmail',
    wklej: 'podglad',
    kroki: [
      'Kliknij „Kopiuj stopkę” (kopiuje podgląd, nie kod).',
      'W Gmailu otwórz Ustawienia (koło zębate) → Zobacz wszystkie ustawienia → karta Ogólne → Podpis.',
      'Utwórz nowy podpis, wklej skopiowaną stopkę i zapisz zmiany na dole strony.',
      'Jeśli wysyłasz z Gmaila jako adres w swojej domenie, przypisz podpis do tego adresu.',
    ],
    sprawdzone: false,
  },
  {
    program: 'apple-mail',
    nazwa: 'Apple Mail (Mac)',
    wklej: 'podglad',
    kroki: [
      'Kliknij „Kopiuj stopkę” (kopiuje podgląd, nie kod).',
      'W aplikacji Mail otwórz Mail → Ustawienia → Podpisy i wybierz konto.',
      'Kliknij +, odznacz „Zawsze dopasowuj do mojej domyślnej czcionki wiadomości” i wklej stopkę.',
    ],
    uwaga: 'Logo pokazuje się z Twojego hostingu – jeśli Mail pyta o wczytanie obrazów zdalnych, zezwól na nie.',
    sprawdzone: false,
  },
  {
    program: 'thunderbird',
    nazwa: 'Thunderbird',
    wklej: 'kod-html',
    kroki: [
      'Otwórz Ustawienia kont i wybierz skrzynkę.',
      'W polu „Tekst podpisu” zaznacz „Użyj HTML” i wklej kod HTML stopki.',
      'Zamknij ustawienia – zmiana zapisuje się sama.',
    ],
    sprawdzone: false,
  },
  {
    program: 'sogo',
    nazwa: 'Poczta zespołu Verris (SOGo)',
    wklej: 'podglad',
    kroki: ['Otwórz Preferencje → Poczta → Tożsamości, edytuj tożsamość i wklej stopkę w polu podpisu w trybie HTML.'],
    uwaga: 'Dotyczy tylko skrzynek zespołu Verris na control-plane, nie skrzynek klientów.',
    sprawdzone: false,
    tylkoZespol: true,
  },
];

export const POWOD_INSTRUKCJI =
  'Stopkę wklejasz sam w programie pocztowym – webmail nie pozwala nam jeszcze ustawić jej za Ciebie. Skopiuj stopkę i postępuj według instrukcji dla swojego programu.';

/** Jedyna implementacja w paczce 130: sprawdzony kod + wersja tekstowa + instrukcje (bez zapisu w webmailu). */
@Injectable()
export class StopkaEmailInstrukcja implements UstawStopkeEmail {
  readonly tryb = 'instrukcja' as const;

  async ustaw({ skrzynka, html }: WejscieStopki): Promise<WynikStopki> {
    const adres = skrzynka.trim().toLowerCase();
    if (!SKRZYNKA_RE.test(adres)) throw new BadRequestException('Podaj poprawny adres skrzynki.');
    const blad = bladStopki(html);
    if (blad) throw new BadRequestException(blad);
    return {
      ustawiono: false,
      skrzynka: adres,
      powod: POWOD_INSTRUKCJI,
      html,
      tekst: stopkaTekstowa(html),
      instrukcje: INSTRUKCJE_STOPKI.filter((i) => !i.tylkoZespol),
    };
  }
}
