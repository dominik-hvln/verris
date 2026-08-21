/** Mapowanie surowych błędów API / DirectAdmin na przyjazne komunikaty PL. */

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
    test: /quota|disk.*full|exceeg|limit reached|out of space/i,
    message: 'Przekroczono limit (miejsce na dysku lub liczba elementów w planie).',
  },
  {
    test: /password|hasł/i,
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
    test: /timeout|timed out|ETIMEDOUT|ECONNREFUSED|ECONNRESET|network|socket hang up|503|502|gateway/i,
    message: 'Serwer hostingowy jest chwilowo niedostępny. Spróbuj ponownie za chwilę.',
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
      // Pusty message = pokaż oryginał (czytelne walidacje), obcięty do 200 zn.
      return rule.message || text.slice(0, 200);
    }
  }
  // Krótkie, czytelne komunikaty po polsku przepuszczamy; długie/techniczne → generyk.
  if (text.length <= 140 && !/CMD_API|DirectAdmin|axios|stack|at \w+\./i.test(text)) {
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
