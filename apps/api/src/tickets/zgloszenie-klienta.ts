import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

const ID_ZGLOSZENIA = /^#?([0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?)$/i;

/**
 * Zgłoszenie podane przez operatora (D2): pełne id albo skrót z panelu („#ab12cd34”). Musi być zgłoszeniem tego
 * klienta — cudzego numeru nie przyjmujemy (klient zobaczy go w swojej aktywności). Puste — null.
 * Wspólne dla akcji na usłudze (zawieszenie-operatora.service.ts) i na domenie (domeny-operatora.service.ts).
 */
export async function zgloszenieKlienta(prisma: PrismaService, klientId: string, wpis: string | null | undefined): Promise<string | null> {
  const tekst = (wpis ?? '').trim();
  if (!tekst) return null;
  const m = ID_ZGLOSZENIA.exec(tekst);
  if (!m) throw new BadRequestException('Numer zgłoszenia ma postać #ab12cd34 (8 znaków z panelu obsługi).');
  const id = m[1]!.toLowerCase();
  const trafienia = await prisma.ticket.findMany({
    where: { userId: klientId, ...(id.length > 8 ? { id } : { id: { startsWith: id } }) },
    select: { id: true },
    take: 2,
  });
  if (trafienia.length === 0) throw new BadRequestException('Nie ma takiego zgłoszenia u tego klienta.');
  if (trafienia.length > 1) throw new BadRequestException('Numer pasuje do kilku zgłoszeń — wklej pełny identyfikator.');
  return trafienia[0]!.id;
}

/**
 * Audyt Fali 3 — źródło wiadomości zgłoszenia (Ticket.zrodlo, TicketReply.zrodlo). Dowodem klienta jest tylko PANEL:
 * klient zalogowany w panelu, bez podglądu konta przez obsługę. EMAIL — import poczty: adres nadawcy nie jest
 * uwierzytelniony (konfiguracja Rspamd w repo nie dopisuje Authentication-Results, nagłówek z maila mógł podać
 * nadawca); OBSLUGA — zgłoszenie w imieniu klienta albo przypisane z „Poczty bez klienta”; IMPERSONACJA — operator
 * „jako klient”; SYSTEM — automat (dodatek, migracja). Domyślnie (bez wskazania) — SYSTEM, nie PANEL.
 */
export const ZRODLA_WIADOMOSCI = ['PANEL', 'EMAIL', 'OBSLUGA', 'IMPERSONACJA', 'SYSTEM'] as const;
export type ZrodloWiadomosci = (typeof ZRODLA_WIADOMOSCI)[number];

/** Źródło wiadomości klienta z żądania panelu: podgląd konta przez obsługę (impersonacja) nie jest klientem. */
export const zrodloZPanelu = (u: { impersonatedBy?: string | null }): ZrodloWiadomosci => (u.impersonatedBy ? 'IMPERSONACJA' : 'PANEL');

/** Warunek Prismy: odpowiedź napisana przez klienta w panelu (nie obsługa, nie notatka, nie automat, nie e-mail). */
export const ODPOWIEDZ_KLIENTA_Z_PANELU = { isStaff: false, internal: false, automatic: null, zrodlo: 'PANEL' } as const;

/** Treść zgłoszenia (Ticket.message) napisał klient w panelu. */
export const trescOdKlienta = (t: { zrodlo: string | null; openedByStaffId: string | null }) => t.zrodlo === 'PANEL' && !t.openedByStaffId;

/**
 * Audyt Fali 3 — operacja „na prośbę klienta” (dodatek z portfela, skrócenie okresu, cofnięcie rezygnacji) wymaga
 * zgłoszenia z co najmniej jedną wiadomością klienta z panelu. Zgłoszenie założone przez obsługę, z maila, z podglądu
 * konta albo przez automat nie jest zgodą klienta — inaczej pracownik sam „zamawiałby” w imieniu klienta (D2).
 */
export async function wymagajProsbyKlienta(
  prisma: { ticket: { findUnique(args: { where: { id: string }; select: object }): Promise<unknown> } },
  ticketId: string,
  operacja: string,
): Promise<void> {
  const t = (await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { zrodlo: true, openedByStaffId: true, replies: { where: ODPOWIEDZ_KLIENTA_Z_PANELU, select: { id: true }, take: 1 } },
  })) as { zrodlo: string | null; openedByStaffId: string | null; replies: unknown[] } | null;
  if (t && (trescOdKlienta(t) || t.replies.length > 0)) return;
  throw new ForbiddenException(
    `${operacja} tylko na prośbę klienta z panelu — zgłoszenie #${ticketId.slice(0, 8)} nie ma wiadomości klienta zalogowanego w panelu (założyła je obsługa, przyszło e-mailem albo powstało w podglądzie konta). Poproś klienta o odpowiedź w tym zgłoszeniu z panelu.`,
  );
}
