import type { MailMessage } from '../mailer.interface.js';
import { renderEmailShell, escapeMarkdown } from './_layouts/email-shell.js';

export interface IamInviteContext {
  to: string;
  ownerEmail: string;
  inviteUrl: string;
  expiresDays: number;
  label: string | null;
  panelUrl: string;
  /** PB-20 — adres ma już konto Verris: przyjmuje się z własnego konta, bez nowego loginu. */
  maKonto?: boolean;
  /** PB-20 — nazwy udostępnionych usług; `null` = całe konto. */
  uslugi?: string[] | null;
}

export function iamSubaccountInviteTemplate(ctx: IamInviteContext): MailMessage {
  const roleLine = ctx.label
    ? `Etykieta dostępu: **${escapeMarkdown(ctx.label)}**`
    : 'Otrzymujesz dostęp do konta właściciela zgodnie z nadanymi uprawnieniami.';
  const zakres = ctx.uslugi?.length
    ? `Dostęp obejmuje tylko te usługi: **${ctx.uslugi.map(escapeMarkdown).join(', ')}**.`
    : 'Dostęp obejmuje całe konto (w granicach nadanych uprawnień).';
  const { html, text } = renderEmailShell({
    title: 'Zaproszenie do konta Verris',
    preheader: 'Aktywuj subkonto — link ważny kilka dni.',
    bodyMarkdown: [
      'Cześć!',
      ``,
      ctx.maKonto
        ? `**${escapeMarkdown(ctx.ownerEmail)}** udostępnia Ci swoje konto w panelu Verris. Masz już konto Verris — przyjmiesz zaproszenie ze swojego konta i będziesz przełączać się między kontami bez nowego loginu.`
        : `**${escapeMarkdown(ctx.ownerEmail)}** zaprasza Cię do współpracy w panelu Verris jako subkonto.`,
      ``,
      zakres,
      ``,
      roleLine,
      ``,
      ctx.maKonto
        ? `Kliknij poniżej i zaloguj się swoim kontem. Link wygasa po **${ctx.expiresDays} dniach**.`
        : `Kliknij poniżej, aby ustawić hasło i wejść do panelu. Link wygasa po **${ctx.expiresDays} dniach**.`,
    ].join('\n'),
    cta: { label: ctx.maKonto ? 'Przyjmij zaproszenie' : 'Aktywuj subkonto', url: ctx.inviteUrl },
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
