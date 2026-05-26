import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

export interface MailForwardConfirmContext {
  to: string;
  mailboxEmail: string;
  confirmUrl: string;
  expiresHours: number;
  panelUrl: string;
}

export function mailForwardConfirmTemplate(ctx: MailForwardConfirmContext): MailMessage {
  const { html, text } = renderEmailShell({
    title: 'Potwierdź przekierowanie poczty',
    preheader: `Prośba o przekazywanie skrzynki ${ctx.mailboxEmail}.`,
    bodyMarkdown: [
      `Administrator Verris skonfigurował **przekierowanie** wiadomości ze skrzynki:`,
      ``,
      `**${escapeHtml(ctx.mailboxEmail)}** → **${escapeHtml(ctx.to)}**`,
      ``,
      `Jeśli **zgadzasz się** otrzymywać kopie maili na ten adres — kliknij przycisk poniżej.`,
      `Jeśli **nie** prosiłeś o to — zignoruj ten mail; przekierowanie nie zostanie włączone.`,
      ``,
      `Link jest ważny **${ctx.expiresHours} godzin**.`,
    ].join('\n'),
    cta: { label: 'Potwierdź przekierowanie', url: ctx.confirmUrl },
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'mail.forward_confirm',
    subject: `Potwierdź przekierowanie poczty — ${ctx.mailboxEmail}`,
    text,
    html,
    fromRole: 'NOREPLY',
    category: 'TRANSACTIONAL',
  };
}
