import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

export interface AdminCreditContext {
  customerEmail: string;
  customerFirstName: string | null;
  amount: string;
  reason: string | null;
  newBalance: string;
  panelUrl: string;
}

/**
 * E-mail wysyłany do klienta, gdy admin Verris ręcznie przyznaje kredyty na
 * portfel. Najczęstsze powody: rekompensata za awarię, bonus za rejestrację,
 * referral, testowe doładowanie. Powód (`reason`) klient widzi w mailu i w
 * historii transakcji w panelu — daje to transparentność operacyjną.
 */
export function adminCreditNotificationTemplate(ctx: AdminCreditContext): MailMessage {
  const greeting = ctx.customerFirstName ? `Cześć **${escapeHtml(ctx.customerFirstName)}**!` : 'Cześć!';
  const reasonLine = ctx.reason
    ? `**Powód:** ${escapeHtml(ctx.reason)}`
    : '**Powód:** Uznanie od Zespołu Verris.';

  const { html, text } = renderEmailShell({
    title: `Przyznaliśmy Ci ${ctx.amount} K na portfel`,
    preheader: `Twoje saldo zostało zwiększone o ${ctx.amount} kredytów Verris.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Właśnie zasililiśmy Twój portfel kwotą **${escapeHtml(ctx.amount)} K** (kredyty Verris, 1 zł = 1 K).`,
      ``,
      reasonLine,
      ``,
      `## Aktualne saldo`,
      ``,
      `${escapeHtml(ctx.newBalance)} K`,
      ``,
      `Środki są dostępne natychmiast — możesz wykorzystać je na opłacenie subskrypcji, autoskalowanie lub inne usługi w panelu.`,
    ].join('\n'),
    cta: {
      label: 'Otwórz portfel',
      url: `${ctx.panelUrl}/dashboard/billing`,
    },
    footnote: 'Pełną historię operacji znajdziesz w sekcji "Portfel i płatności" w panelu klienta.',
    recipientEmail: ctx.customerEmail,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.customerEmail,
    tag: 'wallet.admin-credit',
    subject: `Otrzymałeś ${ctx.amount} K od Verris`,
    text,
    html,
  };
}
