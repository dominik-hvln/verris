/**
 * P5-01 — tłumaczenie błędów operacji na komunikaty po polsku, w wersji, którą wolno wysłać do przeglądarki.
 *
 * Reguły mapowania są wspólne dla API, serwera panelu i przeglądarki. Wzorzec white label (lista ukrywanych nazw
 * oprogramowania serwera) NIE mieszka tutaj — jest w `komunikaty-hostingu.ts`, który ładuje tylko kod serwerowy
 * (API, `apiFetch` panelu). Komunikat dociera do przeglądarki już po tym filtrze: API czyści `message` filtrem
 * wyjątków, a `apiFetch` tłumaczy odmowy serwera hostingu. Tu zostaje drugi, ogólny sito: ślady techniczne
 * (stos wywołań, adres IP, URL, host:port, ścieżka pliku, stała `WIELKIMI_LITERAMI`) zamieniamy na komunikat ogólny.
 */

export const HOSTING_FETCH_UNAVAILABLE =
  'Chwilowo nie możemy pobrać danych. Odśwież stronę lub spróbuj ponownie za chwilę.';

export const KOMUNIKAT_OPERACJI_OGOLNY =
  'Operacja nie powiodła się. Spróbuj ponownie lub skontaktuj się z pomocą techniczną.';

/** Reguły dopasowania — pierwszy trafiony wzorzec wygrywa. */
const RULES: { test: RegExp; message: string }[] = [
  {
    test: /could not execute your request/i,
    message:
      'Serwer hostingowy nie mógł wykonać tej operacji. Spróbuj ponownie za chwilę – jeśli problem wraca, napisz do pomocy.',
  },
  { test: /already exists|exists already|duplicate/i, message: 'Taki element już istnieje.' },
  {
    test: /(cannot|could not).*(delete|remove)|in use|is being used/i,
    message: 'Nie można usunąć – element jest w użyciu lub powiązany z inną usługą.',
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
    message: 'Problem konfiguracji adresu IP na serwerze – zgłoś to do pomocy technicznej.',
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

/** Ślady techniczne bez nazw oprogramowania: biblioteka HTTP, stos wywołań, IP, URL, host:port, ścieżka, stała. */
export function sladTechniczny(text: string): boolean {
  return (
    /axios|stack|at \w+\.|https?:\/\//i.test(text) ||
    /\b\d{1,3}(\.\d{1,3}){3}\b/.test(text) ||
    /\b[a-z][\w.-]*\.[a-z]{2,}:\d{2,5}\b/i.test(text) ||
    /(?:^|[\s("'])\/[\w.-]+\/[\w./-]+/.test(text) ||
    /\b[A-Z][A-Z0-9]*_[A-Z0-9_]{2,}\b/.test(text)
  );
}

/**
 * Przyjazny komunikat dla błędu operacji (mutacji). Nigdy nie zwraca pustego. `techniczny` decyduje, czy oryginał
 * wolno pokazać — serwer dokłada do niego filtr white label (`komunikaty-hostingu.ts`).
 */
export function przetlumaczBlad(raw: string | null | undefined, techniczny: (text: string) => boolean = sladTechniczny): string {
  const text = (raw ?? '').trim();
  if (!text) return KOMUNIKAT_OPERACJI_OGOLNY;
  for (const rule of RULES) {
    if (rule.test.test(text)) {
      // Pusty message = pokaż oryginał (czytelne walidacje), obcięty do 200 zn. — o ile nie jest techniczny.
      if (rule.message) return rule.message;
      return techniczny(text) ? KOMUNIKAT_OPERACJI_OGOLNY : text.slice(0, 200);
    }
  }
  // Krótkie, czytelne komunikaty po polsku przepuszczamy; długie/techniczne → generyk.
  if (text.length <= 140 && !techniczny(text)) return text;
  return KOMUNIKAT_OPERACJI_OGOLNY;
}

/** Wersja dla przeglądarki (drugie przejście po filtrze serwera). */
export function daErrorMessage(raw: string | null | undefined): string {
  return przetlumaczBlad(raw, sladTechniczny);
}

/** Wariant dla banera „nie udało się pobrać": null gdy brak błędu. */
export function hostingFetchErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const mapped = daErrorMessage(raw);
  return mapped === KOMUNIKAT_OPERACJI_OGOLNY ? HOSTING_FETCH_UNAVAILABLE : mapped;
}
