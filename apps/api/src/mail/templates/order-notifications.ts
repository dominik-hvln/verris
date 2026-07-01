import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

/**
 * MAIL-W2 — potwierdzenie zamówienia („dziękujemy za zamówienie"), wysyłane
 * tuż po złożeniu zamówienia (przed/obok provisioningu). Odrębne od maila
 * „konto gotowe" (hosting.account-provisioned) i od faktury — to potwierdzenie
 * samej transakcji, którego wcześniej brakowało.
 */
export interface OrderReceivedContext {
  to: string;
  firstName: string | null;
  planName: string;
  serviceTag: string;
  /** Sformatowana kwota, np. „29,00 zł". */
  amountLabel: string;
  /** 'MONTH' | 'YEAR' — do etykiety okresu. */
  interval: 'MONTH' | 'YEAR';
  /** Domena/usługa (opcjonalnie — brak dla produktów aplikacyjnych). */
  domain?: string | null;
  /** Sposób płatności do krótkiej informacji. */
  paymentLabel: string;
  panelUrl: string;
}

export function orderReceivedTemplate(ctx: OrderReceivedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const period = ctx.interval === 'YEAR' ? 'rocznie' : 'miesięcznie';
  const lines = [
    greeting,
    ``,
    `Dziękujemy za zamówienie w Verris! Przyjęliśmy je do realizacji.`,
    ``,
    `## Podsumowanie`,
    ``,
    `- **Usługa:** ${escapeHtml(ctx.planName)}`,
    ctx.domain ? `- **Domena:** ${escapeHtml(ctx.domain)}` : null,
    `- **Identyfikator usługi:** \`${escapeHtml(ctx.serviceTag)}\``,
    `- **Kwota:** ${escapeHtml(ctx.amountLabel)} (${period})`,
    `- **Płatność:** ${escapeHtml(ctx.paymentLabel)}`,
    ``,
    `Gdy usługa będzie gotowa, wyślemy osobną wiadomość z danymi dostępowymi. Fakturę znajdziesz w panelu w zakładce Rozliczenia.`,
  ].filter((l): l is string => l !== null);

  const { html, text } = renderEmailShell({
    title: 'Dziękujemy za zamówienie',
    preheader: `Przyjęliśmy zamówienie: ${ctx.planName}.`,
    bodyMarkdown: lines.join('\n'),
    cta: { label: 'Otwórz panel', url: `${ctx.panelUrl}/dashboard` },
    footnote: 'To potwierdzenie zamówienia. Aktywacja usługi może potrwać chwilę.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'order.received', subject: `[Verris] Potwierdzenie zamówienia — ${ctx.planName}`, text, html };
}
