/** Ogólny komunikat zamiast surowych błędów API / panelu hostingowego. */
export const HOSTING_FETCH_UNAVAILABLE =
  'Chwilowo nie możemy pobrać danych. Odśwież stronę lub skontaktuj się z pomocą techniczną.';

export function hostingFetchErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return HOSTING_FETCH_UNAVAILABLE;
}
