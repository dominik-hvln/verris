/**
 * Mapowanie surowych błędów API / panelu serwera na przyjazne komunikaty PL.
 *
 * Mieszka w `libs/contracts`, bo korzystają z niego OBA końce: API czyści pola zwracane klientowi
 * w JSON-ie (`fetchError`, `error` zadań, `lastError` zamówień — filtr wyjątków ich nie widzi), a panel
 * — dla błędów z własnych akcji i sieci. White label: klient nie widzi nazwy DirectAdmin, portu 2222
 * ani adresów węzłów.
 */

/**
 * Nazwa panelu serwera (DirectAdmin/DA/CustomBuild), jego komendy (`CMD_API_*`), ścieżki, port 2222,
 * kolejka zadań DA i oprogramowanie węzła (CloudLinux, CageFS, LVE, narzędzia LiteSpeed). Nazwa wtyczki
 * „LiteSpeed Cache” zostaje (to wtyczka WordPressa). „DA” i „LVE” tylko wielkimi literami jako osobne
 * słowo — `/\bDA\b/i` łapał polskie „nie da się”.
 */
const PANEL_SERWERA =
  /DirectAdmin|CustomBuild|CMD_API|task\.queue|\/usr\/local\/|\/opt\/alt\/|:2222\b|\bpor(?:t\w*|cie) 2222\b|CloudLinux|CageFS|selectorctl|lswsctrl|LiteSpeed(?! Cache)/i;

export function zdradzaPanelSerwera(tekst: string): boolean {
  return PANEL_SERWERA.test(tekst) || /\bDA\b|\bLVE\b/.test(tekst);
}

/** Ślady techniczne poza panelem: biblioteka HTTP, stos wywołań, adres IP węzła, adres URL. */
function techniczny(text: string): boolean {
  return zdradzaPanelSerwera(text) || /axios|stack|at \w+\.|https?:\/\//i.test(text) || /\b\d{1,3}(\.\d{1,3}){3}\b/.test(text);
}

export const HOSTING_FETCH_UNAVAILABLE =
  'Chwilowo nie możemy pobrać danych. Odśwież stronę lub spróbuj ponownie za chwilę.';

const GENERIC_OP =
  'Operacja nie powiodła się. Spróbuj ponownie lub skontaktuj się z pomocą techniczną.';

/** Reguły dopasowania — pierwszy trafiony wzorzec wygrywa. */
const RULES: { test: RegExp; message: string }[] = [
  {
    test: /could not execute your request/i,
    message:
      'Serwer hostingowy nie mógł wykonać tej operacji. Spróbuj ponownie za chwilę — jeśli problem wraca, napisz do pomocy.',
  },
  { test: /already exists|exists already|duplicate/i, message: 'Taki element już istnieje.' },
  {
    test: /(cannot|could not).*(delete|remove)|in use|is being used/i,
    message: 'Nie można usunąć — element jest w użyciu lub powiązany z inną usługą.',
  },
  {
    // „exceeded” tylko przy limicie/quocie — gołe „exceed” złapałoby „timeout exceeded”.
    test: /quota|disk.*full|(quota|limit)\s+exceeded|exceeds?\s+(the\s+)?(quota|limit)|limit reached|out of space/i,
    message: 'Przekroczono limit (miejsce na dysku lub liczba elementów w planie).',
  },
  {
    // Tylko odrzucone hasło — samo słowo „password” (np. „brak zapisanego hasła konta”) to inny błąd.
    test: /password.{0,40}(too short|too weak|weak|invalid|requirement|must|at least)|(weak|invalid|short)\s+password|hasło.{0,40}(za krótkie|za słabe|musi mieć|nie spełnia)/i,
    message: 'Hasło nie spełnia wymagań (długość/znaki). Użyj silniejszego hasła.',
  },
  {
    test: /a valid ip was not provided|ip.*not.*(provided|found)/i,
    message: 'Problem konfiguracji adresu IP na serwerze — zgłoś to do pomocy technicznej.',
  },
  {
    test: /not configured|nie jest skonfigurowan|no hosting account|konto hostingowe nie/i,
    message: 'Konto hostingowe nie jest jeszcze w pełni gotowe. Spróbuj za kilka minut.',
  },
  {
    // Bez „hostingowy” — tę samą funkcję woła rejestrator domen.
    test: /timeout|timed out|ETIMEDOUT|ECONNREFUSED|ECONNRESET|network|socket hang up|503|502|gateway/i,
    message: 'Serwer jest chwilowo niedostępny. Spróbuj ponownie za chwilę.',
  },
  {
    test: /invalid|nieprawid|must be|wymag|1–16|co najmniej/i,
    // Walidacje są zwykle czytelne — pokaż oryginał (obcięty).
    message: '',
  },
];

/** Zwraca przyjazny komunikat dla błędu operacji (mutacji). Nigdy nie zwraca pustego. */
export function daErrorMessage(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  if (!text) return GENERIC_OP;
  for (const rule of RULES) {
    if (rule.test.test(text)) {
      // Pusty message = pokaż oryginał (czytelne walidacje), obcięty do 200 zn. — o ile nie zdradza serwera.
      if (rule.message) return rule.message;
      return techniczny(text) ? GENERIC_OP : text.slice(0, 200);
    }
  }
  // Krótkie, czytelne komunikaty po polsku przepuszczamy; długie/techniczne → generyk.
  if (text.length <= 140 && !techniczny(text)) {
    return text;
  }
  return GENERIC_OP;
}

/** Wariant dla banera „nie udało się pobrać": null gdy brak błędu. */
export function hostingFetchErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const mapped = daErrorMessage(raw);
  return mapped === GENERIC_OP ? HOSTING_FETCH_UNAVAILABLE : mapped;
}
