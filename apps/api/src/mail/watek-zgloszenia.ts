import { randomBytes } from 'node:crypto';

/**
 * F3.7 (OE-19) — wątek maili zgłoszenia. Maile do klienta w sprawie zgłoszenia mają Message-ID z id zgłoszenia
 * (`<zgl.<uuid>.<losowe>@domena>`) oraz In-Reply-To / References wskazujące wspólny korzeń `<zgl.<uuid>@domena>`
 * i maile klienta z tego wątku — klient pocztowy skleja je w jedną rozmowę, a odpowiedź klienta (In-Reply-To /
 * References, RFC 5322 §3.6.4 https://www.rfc-editor.org/rfc/rfc5322#section-3.6.4) wraca do właściwego zgłoszenia.
 * Zapasowo temat z „[#xxxxxxxx]” (pierwsze 8 znaków id), jak we wszystkich mailach zgłoszeń.
 */

/** msg-id bez komentarzy i białych znaków — tylko takie trafiają do nagłówków (bez wstrzyknięcia CR/LF). */
const MSG_ID = /^<[\x21-\x3b\x3d\x3f-\x7e]{1,250}@[\x21-\x3b\x3d\x3f-\x7e]{1,250}>$/;
const ZGL = /^<zgl\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[0-9a-f]{1,32})?@([^>]+)>$/i;
/** Najwyżej tyle id w References (korzeń + ostatnie maile klienta) — nagłówek nie rośnie bez końca. */
export const MAX_REFERENCES = 10;

export function poprawnyMessageId(id: string | null | undefined): id is string {
  return typeof id === 'string' && MSG_ID.test(id);
}

/** Wszystkie `<…>` z nagłówka In-Reply-To / References (kolejność zachowana, bez duplikatów). */
export function idyZNaglowka(wartosc: string | null | undefined): string[] {
  if (!wartosc) return [];
  const out: string[] = [];
  for (const m of wartosc.matchAll(/<[^<>\s]+>/g)) if (poprawnyMessageId(m[0]) && !out.includes(m[0])) out.push(m[0]);
  return out;
}

export const idKorzenia = (ticketId: string, domena: string) => `<zgl.${ticketId}@${domena}>`;

export const nowyIdWiadomosci = (ticketId: string, domena: string) => `<zgl.${ticketId}.${randomBytes(8).toString('hex')}@${domena}>`;

/** Id zgłoszenia z naszego Message-ID w nagłówkach odpowiedzi — tylko z naszej domeny. Najnowszy wygrywa. */
export function zgloszenieZNaglowkow(idy: readonly string[], domena: string): string | null {
  for (let i = idy.length - 1; i >= 0; i--) {
    const m = ZGL.exec(idy[i]);
    if (m && m[2].toLowerCase() === domena.toLowerCase()) return m[1].toLowerCase();
  }
  return null;
}

/** „[#1a2b3c4d]” z tematu (pierwsze 8 znaków id zgłoszenia). */
export function krotkieIdZTematu(temat: string | null | undefined): string | null {
  const m = /\[#([0-9a-f]{8})\]/i.exec(temat ?? '');
  return m ? m[1].toLowerCase() : null;
}

/**
 * Nagłówki maila w wątku zgłoszenia. `odKlienta` — Message-ID maili klienta w tym zgłoszeniu (od najstarszego);
 * In-Reply-To = ostatni z nich (odpowiadamy na jego wiadomość), inaczej korzeń.
 */
export function naglowkiWatku(
  ticketId: string,
  domena: string,
  odKlienta: readonly string[] = [],
): { messageId: string; inReplyTo: string; references: string[] } {
  const korzen = idKorzenia(ticketId, domena);
  const klienta = odKlienta.filter(poprawnyMessageId).slice(-(MAX_REFERENCES - 1));
  return {
    messageId: nowyIdWiadomosci(ticketId, domena),
    inReplyTo: klienta[klienta.length - 1] ?? korzen,
    references: [korzen, ...klienta],
  };
}
