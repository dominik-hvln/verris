import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

export interface WelcomeContext {
  to: string;
  firstName: string | null;
  panelUrl: string;
}

export function welcomeTemplate(ctx: WelcomeContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'Witaj w Verris',
    preheader: 'Twoje konto jest gotowe — zaloguj się do panelu.',
    bodyMarkdown: [
      greeting,
      ``,
      `Dziękujemy za rejestrację w **Verris**. Możesz od razu:`,
      ``,
      `- doładować portfel i opłacać usługi,`,
      `- zaprosić współpracowników (subkonta IAM),`,
      `- skontaktować się z supportem w panelu.`,
      ``,
      `Gdy podłączysz hosting, provisioning uruchomimy automatycznie po opłaceniu planu.`,
    ].join('\n'),
    cta: { label: 'Przejdź do panelu', url: ctx.panelUrl },
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'auth.welcome',
    subject: 'Witaj w Verris — konto gotowe',
    text,
    html,
  };
}

export interface PasswordResetRequestContext {
  to: string;
  firstName: string | null;
  resetUrl: string;
  expiresMinutes: number;
  panelUrl: string;
}

export function passwordResetRequestTemplate(ctx: PasswordResetRequestContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'Reset hasła',
    preheader: 'Link do ustawienia nowego hasła (ważny krótko).',
    bodyMarkdown: [
      greeting,
      ``,
      `Otrzymaliśmy prośbę o **reset hasła** do konta Verris. Jeśli to Ty — użyj przycisku poniżej.`,
      ``,
      `Link jest ważny **${ctx.expiresMinutes} minut**. Po upływie czasu wygeneruj nowy z formularza „Nie pamiętasz hasła?”.`,
      ``,
      `Jeśli **nie** prosiłeś o reset — zignoruj ten mail. Hasło pozostanie bez zmian.`,
    ].join('\n'),
    cta: { label: 'Ustaw nowe hasło', url: ctx.resetUrl },
    footnote: 'Ze względów bezpieczeństwa nigdy nie podawaj hasła mailem ani przez support.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'auth.password-reset-request',
    subject: 'Reset hasła — Verris',
    text,
    html,
  };
}
