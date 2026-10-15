/**
 * Decyzja 15.10 (#14) — poczta do zgłoszeń nie uwierzytelnia nadawcy (adres „Od” można podrobić; odrzucamy tylko
 * jawne DMARC=fail). Zgłoszenie i odpowiedzi z maila oznaczamy w panelu obsługi jako „niezweryfikowany nadawca”:
 * przed operacjami na koncie (zmiana e-maila, hasła, dane do faktur, wydanie danych) obsługa potwierdza tożsamość
 * w panelu klienta. API: Ticket.zrodlo / TicketReply.zrodlo = 'EMAIL' i tag „e-mail-niezweryfikowany”.
 */
export const TAG_EMAIL_NIEZWERYFIKOWANY = "e-mail-niezweryfikowany";

export function zgloszenieZMaila(t: { zrodlo?: string | null; tags?: string[] | null }): boolean {
  return t.zrodlo === "EMAIL" || (t.tags ?? []).includes(TAG_EMAIL_NIEZWERYFIKOWANY);
}

export function wiadomoscZMaila(r: { zrodlo?: string | null; isStaff?: boolean }): boolean {
  return !r.isStaff && r.zrodlo === "EMAIL";
}

export const OSTRZEZENIE_NADAWCY =
  "Niezweryfikowany nadawca — ta wiadomość przyszła mailem, a adresu „Od” nie da się potwierdzić (możliwe podszycie). Przed zmianą danych konta, hasła, adresu e-mail albo wydaniem danych poproś klienta o potwierdzenie w panelu klienta.";
