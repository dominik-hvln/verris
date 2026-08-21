import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

export interface IamInviteContext {
  to: string;
  ownerEmail: string;
  inviteUrl: string;
  expiresDays: number;
  label: string | null;
  panelUrl: string;
}

export function iamSubaccountInviteTemplate(ctx: IamInviteContext): MailMessage {
  const roleLine = ctx.label
    ? `Etykieta dostępu: **${escapeHtml(ctx.label)}**`
    : 'Otrzymujesz dostęp do konta właściciela zgodnie z nadanymi uprawnieniami.';
  const { html, text } = renderEmailShell({
    title: 'Zaproszenie do konta Verris',
    preheader: 'Aktywuj subkonto — link ważny kilka dni.',
    bodyMarkdown: [
      'Cześć!',
      ``,
      `**${escapeHtml(ctx.ownerEmail)}** zaprasza Cię do współpracy w panelu Verris jako subkonto.`,
      ``,
      roleLine,
      ``,
      `Kliknij poniżej, aby ustawić hasło i wejść do panelu. Link wygasa po **${ctx.expiresDays} dniach**.`,
    ].join('\n'),
    cta: { label: 'Aktywuj subkonto', url: ctx.inviteUrl },
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'iam.subaccount-invite',
    subject: 'Zaproszenie do konta Verris',
    text,
    html,
  };
}
