import type { MailMessage } from '../mailer.interface.js';
import { renderEmailShell, escapeMarkdown } from './_layouts/email-shell.js';

export interface WelcomeContext {
  to: string;
  firstName: string | null;
  panelUrl: string;
}

export function welcomeTemplate(ctx: WelcomeContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
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
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
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

export interface PasswordResetHeldContext {
  to: string;
  firstName: string | null;
  hours: number;
  panelUrl: string;
}

/**
 * Przegląd poprawek audytu Fal 2 — formularz „Nie pamiętam hasła” w ciągu doby od zmiany adresu e-mail przez obsługę:
 * linku nie wysyłamy (inaczej pracownik zmieniłby adres na swój i sam ustawił hasło), tylko mówimy, co dalej.
 */
export function passwordResetHeldTemplate(ctx: PasswordResetHeldContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'Reset hasła wstrzymany',
    preheader: 'Adres e-mail konta zmieniła niedawno obsługa Verris.',
    bodyMarkdown: [
      greeting,
      ``,
      `Otrzymaliśmy prośbę o **reset hasła** do konta Verris. Adres e-mail tego konta zmieniła niedawno obsługa Verris, dlatego przez ${ctx.hours} h od tej zmiany link do ustawienia hasła wysyła tylko obsługa.`,
      ``,
      `Jeśli to Ty — napisz do nas: ${escapeMarkdown('support@verris.pl')}. Jeśli **nie** prosiłeś o reset — zignoruj ten mail, hasło pozostanie bez zmian.`,
    ].join('\n'),
    footnote: 'Ze względów bezpieczeństwa nigdy nie podawaj hasła mailem ani przez support.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'auth.password-reset-held', subject: 'Reset hasła — Verris', text, html };
}

export interface AccountCreatedByOperatorContext {
  to: string;
  firstName: string | null;
  setPasswordUrl: string;
  expiresHours: number;
  panelUrl: string;
}

/** A-24 — konto założone przez operatora; klient sam ustawia hasło. */
export function accountCreatedByOperatorTemplate(ctx: AccountCreatedByOperatorContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'Twoje konto w Verris',
    preheader: 'Ustaw hasło, żeby zalogować się do panelu.',
    bodyMarkdown: [
      greeting,
      ``,
      `na Twoją prośbę założyliśmy konto w **Verris** na ten adres e-mail. Ustaw hasło przyciskiem poniżej — przy pierwszym logowaniu poprosimy o akceptację regulaminu.`,
      ``,
      `Link jest ważny **${ctx.expiresHours} godziny**. Później poproś o nowy w formularzu „Nie pamiętasz hasła?”.`,
      ``,
      `Jeśli nie prosiłeś o konto — zignoruj ten mail. Bez ustawienia hasła nikt się na nie nie zaloguje.`,
    ].join('\n'),
    cta: { label: 'Ustaw hasło', url: ctx.setPasswordUrl },
    footnote: 'Nigdy nie prosimy o hasło mailem ani telefonicznie.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return {
    to: ctx.to,
    tag: 'auth.account-created-by-operator',
    subject: 'Konto w Verris — ustaw hasło',
    text,
    html,
  };
}

export interface PasswordResetByOperatorContext {
  to: string;
  firstName: string | null;
  resetUrl: string;
  expiresHours: number;
  /** Klient miał 2FA — reset je wyłączył; mail mówi, żeby włączyć ponownie. */
  twoFactorCleared: boolean;
  panelUrl: string;
}

/** D9/D3 (10.10) — reset hasła przez Obsługę Verris: klient sam ustawia nowe hasło z linku, operator go nie zna. */
export function passwordResetByOperatorTemplate(ctx: PasswordResetByOperatorContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'Ustaw nowe hasło',
    preheader: 'Obsługa Verris zresetowała hasło do Twojego konta.',
    bodyMarkdown: [
      greeting,
      ``,
      `Obsługa Verris zresetowała hasło do Twojego konta. Dotychczasowe hasło już nie działa — ustaw nowe przyciskiem poniżej.`,
      ``,
      `Link jest ważny **${ctx.expiresHours} godziny**. Później poproś o nowy w formularzu „Nie pamiętasz hasła?”.`,
      ...(ctx.twoFactorCleared
        ? [``, `Weryfikacja dwuetapowa została wyłączona. Po zalogowaniu włącz ją ponownie w ustawieniach konta.`]
        : []),
      ``,
      `Jeśli nie kontaktowałeś się z nami w tej sprawie — od razu skontaktuj się z Obsługą Verris.`,
    ].join('\n'),
    cta: { label: 'Ustaw nowe hasło', url: ctx.resetUrl },
    footnote: 'Nigdy nie prosimy o hasło mailem ani telefonicznie.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return {
    to: ctx.to,
    tag: 'auth.password-reset-by-operator',
    subject: 'Ustaw nowe hasło — Verris',
    text,
    html,
  };
}

export interface EmailVerifyContext {
  to: string;
  firstName: string | null;
  verifyUrl: string;
  expiresHours: number;
  panelUrl: string;
}

export function emailVerifyTemplate(ctx: EmailVerifyContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'Potwierdź adres e-mail',
    preheader: 'Aktywuj konto Verris — jeden klik.',
    bodyMarkdown: [
      greeting,
      ``,
      `Dziękujemy za rejestrację w **Verris**. Aby zalogować się do panelu, **potwierdź adres e-mail** przyciskiem poniżej.`,
      ``,
      `Link jest ważny **${ctx.expiresHours} godzin**. Po potwierdzeniu możesz się zalogować hasłem ustawionym przy rejestracji.`,
      ``,
      `Jeśli to nie Ty zakładałeś konto — zignoruj ten mail.`,
    ].join('\n'),
    cta: { label: 'Potwierdź e-mail', url: ctx.verifyUrl },
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'auth.email-verify',
    subject: 'Potwierdź adres e-mail — Verris',
    text,
    html,
  };
}

export interface EmailVerifiedOkContext {
  to: string;
  firstName: string | null;
  panelUrl: string;
}

export function emailVerifiedOkTemplate(ctx: EmailVerifiedOkContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'E-mail potwierdzony',
    preheader: 'Konto aktywne — możesz się zalogować.',
    bodyMarkdown: [
      greeting,
      ``,
      `Twój adres e-mail został **potwierdzony**. Konto jest aktywne — zaloguj się do panelu i rozpocznij konfigurację usług.`,
    ].join('\n'),
    cta: { label: 'Zaloguj się do panelu', url: `${ctx.panelUrl}/login` },
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'auth.email-verified',
    subject: 'E-mail potwierdzony — Verris',
    text,
    html,
  };
}
