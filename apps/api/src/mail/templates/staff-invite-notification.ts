import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

export interface StaffInviteContext {
  to: string;
  firstName: string | null;
  roleName: string | null;
  temporaryPassword: string;
  adminPanelUrl: string;
}

/** RBAC — zaproszenie nowego operatora (STAFF) z hasłem tymczasowym. */
export function staffInviteTemplate(ctx: StaffInviteContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'Dostęp do panelu Verris (zespół)',
    preheader: 'Twoje konto operatora zostało utworzone.',
    bodyMarkdown: [
      greeting,
      ``,
      `Utworzono dla Ciebie konto operatora w panelu Verris${ctx.roleName ? ` w dziale **${escapeHtml(ctx.roleName)}**` : ''}.`,
      ``,
      `- **Login (e-mail):** ${escapeHtml(ctx.to)}`,
      `- **Hasło tymczasowe:** \`${escapeHtml(ctx.temporaryPassword)}\``,
      ``,
      `## Pierwsze logowanie`,
      ``,
      `1. Zaloguj się hasłem tymczasowym w panelu administratora.`,
      `2. System poprosi o ustawienie klucza dostępu (passkey) — to Twoje docelowe, bezpieczne logowanie.`,
      `3. Zakres tego, co widzisz i możesz zrobić, wynika z przypisanego działu.`,
      ``,
      `Jeśli to pomyłka — zignoruj tę wiadomość i poinformuj administratora.`,
    ].join('\n'),
    cta: { label: 'Otwórz panel', url: ctx.adminPanelUrl },
    footnote: 'Hasło tymczasowe zmień przy pierwszym logowaniu. Nie udostępniaj go nikomu.',
    recipientEmail: ctx.to,
    panelUrl: ctx.adminPanelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'staff.invite', subject: '[Verris] Dostęp do panelu zespołu', text, html };
}
