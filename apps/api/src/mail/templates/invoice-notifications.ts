import type { MailMessage } from '../mailer.interface.js';
import { renderEmailShell, escapeMarkdown } from './_layouts/email-shell.js';

const PLN_FORMATTER = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DATE_FORMATTER = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatMoney(amount: string, currency: string): string {
  if (currency === 'PLN') {
    const n = Number.parseFloat(amount);
    if (Number.isFinite(n)) return PLN_FORMATTER.format(n);
  }
  return `${amount} ${currency}`;
}

function formatDate(d: Date): string {
  return DATE_FORMATTER.format(d);
}

export interface InvoiceIssuedContext {
  to: string;
  firstName: string | null;
  /** Faktyczny numer wewnętrzny Verris, np. "VFV/2026/05/0042". */
  number: string;
  /** Kwota brutto (z VAT). */
  amount: string;
  currency: string;
  issuedAt: Date;
  /** Data zapłaty. Null gdy faktura jeszcze nieopłacona. */
  paidAt: Date | null;
  panelUrl: string;
  /** Link do panelu z fakturą — wymaga zalogowania. */
  invoiceUrl: string;
  /**
   * FAK-01 — dokument rozliczeniowy zamiast faktury VAT. Mail nie może
   * twierdzić „wystawiliśmy fakturę VAT", skoro fakturę wystawia program
   * księgowy. Brak pola = faktura VAT (zachowanie sprzed FAK-01).
   */
  rozliczeniowy?: boolean;
}

/**
 * Email wysyłany po wystawieniu i opłaceniu faktury VAT (Sprint 2.2).
 *
 * Świadomie **nie załączamy PDF do maila** — zamiast tego dajemy link do
 * panelu z autentykacją, bo:
 *   - PDF-y faktur są długo retencjonowane (5 lat), załącznik mailem
 *     osłabia ten kontrakt (kopia w skrzynce klienta to nie nasz audit
 *     log),
 *   - załączniki PDF czasem są kasowane przez filtry antyspamowe,
 *   - wymóg uwierzytelnienia daje dodatkową warstwę: tylko zalogowany
 *     właściciel pobiera fakturę. Stripe robi tak samo z ich Hosted
 *     Invoice URL.
 */
export function invoiceIssuedTemplate(ctx: InvoiceIssuedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const paidLine = ctx.paidAt
    ? `**Status:** Zapłacono ${escapeMarkdown(formatDate(ctx.paidAt))}`
    : '**Status:** Faktura w trakcie opłacania.';

  const nazwa = ctx.rozliczeniowy ? 'Dokument rozliczeniowy' : 'Faktura';
  const { html, text } = renderEmailShell({
    title: `${nazwa} ${ctx.number} ${ctx.rozliczeniowy ? 'jest gotowy' : 'jest gotowa'}`,
    preheader: `${formatMoney(ctx.amount, ctx.currency)} — pobierz w panelu klienta.`,
    bodyMarkdown: [
      greeting,
      ``,
      ctx.rozliczeniowy
        ? `Rozliczyliśmy płatność za usługi Verris. Ten dokument potwierdza rozliczenie i nie jest fakturą VAT — fakturę VAT wystawimy odrębnie i udostępnimy w panelu klienta.`
        : `Wystawiliśmy fakturę VAT za usługi Verris.`,
      ``,
      `## Szczegóły`,
      ``,
      `- **Numer:** ${escapeMarkdown(ctx.number)}`,
      `- **Kwota brutto:** ${escapeMarkdown(formatMoney(ctx.amount, ctx.currency))}`,
      `- **Data wystawienia:** ${escapeMarkdown(formatDate(ctx.issuedAt))}`,
      paidLine,
      ``,
      `Plik PDF jest dostępny w sekcji **Portfel → Faktury** w panelu klienta. Wszystkie faktury archiwizujemy przez 5 lat — wymóg ustawy o rachunkowości.`,
    ].join('\n'),
    cta: {
      label: ctx.rozliczeniowy ? 'Pobierz dokument' : 'Pobierz fakturę',
      url: ctx.invoiceUrl,
    },
    footnote:
      'Aby pobrać PDF musisz być zalogowany — tak chronimy Twoje dane finansowe. W razie problemów: kontakt@verris.pl.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'invoice.issued',
    subject: `[Verris] ${nazwa} ${ctx.number} — ${formatMoney(ctx.amount, ctx.currency)}`,
    text,
    html,
  };
}

export interface ProformaWystawionaContext {
  to: string;
  firstName: string | null;
  /** Numer proformy, np. "PRO/2026/10/0001". */
  number: string;
  amount: string;
  currency: string;
  dueAt: Date;
  /** Link do panelu (Płatności) z przyciskiem „Zapłać” — wymaga zalogowania. */
  payUrl: string;
  panelUrl: string;
}

/**
 * K4 — proforma wystawiona przez obsługę: link do panelu z „Zapłać” (płatność online), bez załącznika i bez linku
 * bezpośrednio do operatora płatności — zlecenie płatności powstaje dopiero po kliknięciu zalogowanego klienta.
 */
export function proformaWystawionaTemplate(ctx: ProformaWystawionaContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: `Proforma ${ctx.number} do zapłaty`,
    preheader: `${formatMoney(ctx.amount, ctx.currency)} — zapłać w panelu klienta do ${formatDate(ctx.dueAt)}.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Wystawiliśmy dla Ciebie proformę. Możesz ją opłacić online w panelu klienta (BLIK, przelew online, karta) albo zwykłym przelewem z numerem proformy w tytule.`,
      ``,
      `## Szczegóły`,
      ``,
      `- **Numer:** ${escapeMarkdown(ctx.number)}`,
      `- **Do zapłaty:** ${escapeMarkdown(formatMoney(ctx.amount, ctx.currency))}`,
      `- **Termin płatności:** ${escapeMarkdown(formatDate(ctx.dueAt))}`,
      ``,
      `Proforma nie jest fakturą VAT. Po zaksięgowaniu wpłaty środki trafią do Twojego portfela, a dokument za wpłatę znajdziesz w sekcji **Płatności → Faktury**.`,
    ].join('\n'),
    cta: { label: 'Zobacz i zapłać', url: ctx.payUrl },
    footnote: 'Aby zapłacić, musisz być zalogowany — tak chronimy Twoje dane finansowe. W razie pytań: kontakt@verris.pl.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return {
    to: ctx.to,
    tag: 'proforma.issued',
    subject: `[Verris] Proforma ${ctx.number} — ${formatMoney(ctx.amount, ctx.currency)}`,
    text,
    html,
  };
}

/** K4 — obsługa anulowała proformę: nie płać jej (link w panelu przestaje działać). */
export function proformaAnulowanaTemplate(ctx: { to: string; firstName: string | null; number: string; panelUrl: string }): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: `Proforma ${ctx.number} anulowana`,
    preheader: 'Tej proformy nie trzeba już płacić.',
    bodyMarkdown: [
      greeting,
      ``,
      `Anulowaliśmy proformę **${escapeMarkdown(ctx.number)}** — nie trzeba jej płacić. Jeśli wpłata była już w drodze, trafi do Twojego portfela i możesz ją wykorzystać na usługi albo poprosić nas o zwrot.`,
    ].join('\n'),
    cta: { label: 'Przejdź do płatności', url: `${ctx.panelUrl}/dashboard/billing` },
    footnote: 'W razie pytań: kontakt@verris.pl.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'proforma.cancelled', subject: `[Verris] Proforma ${ctx.number} anulowana`, text, html };
}
