/**
 * Kody statusów i błędów KSeF 2.0 → stan faktury w panelu i komunikat dla operatora po polsku.
 *
 * Źródło: oficjalny kontrakt API https://github.com/CIRFMF/ksef-docs/blob/main/open-api.json
 *  - `SessionInvoiceStatusResponse.status` (GET /sessions/{ref}/invoices/{invoiceRef}),
 *  - `AuthenticationOperationStatusResponse.status` (GET /auth/{ref}),
 *  - `ExceptionResponse.exception.exceptionDetailList[].exceptionCode` (odpowiedzi 400).
 * Duplikat (440) i jego rozszerzenia: https://github.com/CIRFMF/ksef-docs/blob/main/faktury/weryfikacja-faktury.md
 * („Unikalność faktury”). Bez pliku nie da się ocenić, czy kod jest odrzuceniem DOKUMENTU, czy problemem
 * po stronie KSeF albo konfiguracji — a od tego zależy, czy faktura wraca do kolejki, czy czeka na człowieka.
 */

/**
 * - `przyjeta` — numer KSeF nadany,
 * - `w-toku` — KSeF jeszcze przetwarza, pytamy w kolejnym cyklu,
 * - `odrzucona` — dokument niepoprawny; wysłanie tego samego pliku nic nie da (wymaga poprawy danych),
 * - `ponow` — problem po stronie KSeF/sesji/uprawnień, dokument może być poprawny: wysyłka jeszcze raz,
 * - `duplikat` — faktura o tym numerze już jest w KSeF (sprawdzamy, czy to ta sama — patrz serwis).
 */
export type StanStatusuFaktury = 'przyjeta' | 'w-toku' | 'odrzucona' | 'ponow' | 'duplikat';

export const KOD_DUPLIKAT_FAKTURY = 440;

const STATUSY_FAKTURY: Record<number, { stan: StanStatusuFaktury; komunikat: string }> = {
  100: { stan: 'w-toku', komunikat: 'Faktura przyjęta do dalszego przetwarzania.' },
  150: { stan: 'w-toku', komunikat: 'Trwa przetwarzanie.' },
  200: { stan: 'przyjeta', komunikat: 'Faktura przyjęta, numer KSeF nadany.' },
  405: { stan: 'ponow', komunikat: 'Przetwarzanie anulowane z powodu błędu sesji KSeF – wyślemy ponownie.' },
  410: { stan: 'ponow', komunikat: 'Nieprawidłowy zakres uprawnień – sprawdź uprawnienia tokenu/certyfikatu (InvoiceWrite) w KSeF; wyślemy ponownie.' },
  415: { stan: 'odrzucona', komunikat: 'Brak możliwości wysyłania faktury z załącznikiem.' },
  430: { stan: 'odrzucona', komunikat: 'Błąd weryfikacji pliku faktury (np. niezgodność ze schematem FA(3)).' },
  435: { stan: 'ponow', komunikat: 'KSeF nie odszyfrował pliku – wyślemy ponownie w nowej sesji.' },
  440: { stan: 'duplikat', komunikat: 'Duplikat faktury – faktura o tym numerze jest już w KSeF.' },
  450: { stan: 'odrzucona', komunikat: 'Błąd weryfikacji semantyki dokumentu faktury.' },
  500: { stan: 'ponow', komunikat: 'Nieznany błąd KSeF – wyślemy ponownie.' },
  550: { stan: 'ponow', komunikat: 'Operacja anulowana przez system KSeF – wyślemy ponownie.' },
};

export function statusFakturyKsef(kod: number | null | undefined, opis?: string | null): { stan: StanStatusuFaktury; komunikat: string } {
  if (kod == null) return { stan: 'w-toku', komunikat: 'Brak statusu z KSeF.' };
  const znany = STATUSY_FAKTURY[kod];
  if (znany) return znany;
  // Kod spoza dokumentacji: 2xx/1xx traktujemy jak „w toku” (numer i tak decyduje o przyjęciu),
  // 4xx jak odrzucenie dokumentu, pozostałe jak błąd po stronie KSeF.
  if (kod < 300) return { stan: 'w-toku', komunikat: opis ?? `Status ${kod}.` };
  if (kod < 500) return { stan: 'odrzucona', komunikat: opis ?? `Odrzucona (kod ${kod}).` };
  return { stan: 'ponow', komunikat: opis ?? `Błąd KSeF (kod ${kod}) – wyślemy ponownie.` };
}

/** Status operacji uwierzytelnienia (GET /auth/{ref}) — komunikat dla operatora. */
const STATUSY_UWIERZYTELNIENIA: Record<number, string> = {
  415: 'Brak przypisanych uprawnień w kontekście NIP – nadaj uprawnienie InvoiceWrite w KSeF.',
  425: 'Uwierzytelnienie unieważnione przez użytkownika.',
  450: 'Token KSeF odrzucony (nieprawidłowy, unieważniony, nieaktywny albo nie dla tego NIP) – wgraj nowy token albo przełącz na certyfikat.',
  460: 'Certyfikat odrzucony (nieważny, odwołany, zawieszony albo niezaufany łańcuch) – wgraj aktualny certyfikat KSeF.',
  470: 'Uwierzytelnianie zakończone niepowodzeniem.',
  480: 'Uwierzytelnienie zablokowane przez MF (podejrzenie incydentu) – kontakt z MF przez formularz zgłoszeniowy.',
  500: 'Nieznany błąd KSeF przy uwierzytelnianiu.',
  550: 'Uwierzytelnienie anulowane przez system KSeF – spróbujemy w kolejnym cyklu.',
};

export function komunikatUwierzytelnienia(kod: number, opis?: string | null): string {
  return STATUSY_UWIERZYTELNIENIA[kod] ?? opis ?? `Kod ${kod}.`;
}

/** Statusy uwierzytelnienia, które są problemem po stronie KSeF (spróbować później), nie naszych poświadczeń. */
export const STATUSY_UWIERZYTELNIENIA_PRZEJSCIOWE: readonly number[] = [500, 550];

/**
 * Kody wyjątków (HTTP 400) przy wysyłce faktury, po których trzeba porzucić sesję online i wysłać
 * w nowej: 21155 (limit faktur w sesji), 21173 (brak sesji), 21180 (status sesji), 21184 (sesja
 * tymczasowo niedostępna, API 2.8.0).
 */
export const KODY_NOWA_SESJA: readonly number[] = [21155, 21173, 21180, 21184];

/** Kody wyjątków przy uwierzytelnieniu XAdES (POST /auth/xades-signature, open-api.json) → komunikat. */
const WYJATKI_XADES: Record<number, string> = {
  21001: 'Nieczytelna treść żądania uwierzytelnienia.',
  21111: 'Nieprawidłowe wyzwanie autoryzacyjne.',
  21115: 'Nieprawidłowy certyfikat.',
  21117: 'Nieprawidłowy identyfikator podmiotu dla kontekstu NIP.',
  21401: 'Dokument uwierzytelnienia niezgodny ze schematem.',
  21406: 'Konflikt podpisu i typu uwierzytelnienia – sprawdź typ identyfikatora (podmiot/odcisk certyfikatu).',
  9101: 'Nieprawidłowy dokument.',
  9102: 'Brak podpisu.',
  9103: 'Przekroczona liczba dozwolonych podpisów.',
  9105: 'Nieprawidłowy podpis.',
};

export function komunikatWyjatkuXades(kody: number[]): string | null {
  const k = kody.find((x) => WYJATKI_XADES[x]);
  return k != null ? `${WYJATKI_XADES[k]} (kod ${k})` : null;
}
