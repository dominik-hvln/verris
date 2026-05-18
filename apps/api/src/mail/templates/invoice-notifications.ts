import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

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
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const paidLine = ctx.paidAt
    ? `**Status:** Zapłacono ${escapeHtml(formatDate(ctx.paidAt))}`
    : '**Status:** Faktura w trakcie opłacania.';

  const { html, text } = renderEmailShell({
    title: `Faktura ${ctx.number} jest gotowa`,
    preheader: `${formatMoney(ctx.amount, ctx.currency)} — pobierz w panelu klienta.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Wystawiliśmy fakturę VAT za usługi Verris.`,
      ``,
      `## Szczegóły`,
      ``,
      `- **Numer:** ${escapeHtml(ctx.number)}`,
      `- **Kwota brutto:** ${escapeHtml(formatMoney(ctx.amount, ctx.currency))}`,
      `- **Data wystawienia:** ${escapeHtml(formatDate(ctx.issuedAt))}`,
      paidLine,
      ``,
      `Plik PDF jest dostępny w sekcji **Portfel → Faktury** w panelu klienta. Wszystkie faktury archiwizujemy przez 5 lat — wymóg ustawy o rachunkowości.`,
    ].join('\n'),
    cta: {
      label: 'Pobierz fakturę',
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
    subject: `[Verris] Faktura ${ctx.number} — ${formatMoney(ctx.amount, ctx.currency)}`,
    text,
    html,
  };
}
