import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

const DATE_FORMATTER = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatDate(d: Date): string {
  return DATE_FORMATTER.format(d);
}

// ---------------------------------------------------------------------------
// 1. account-provisioned — DA account created successfully
// ---------------------------------------------------------------------------

export interface AccountProvisionedContext {
  to: string;
  firstName: string | null;
  planName: string;
  /** Primary domain bound to the new DA account. */
  domain: string;
  /** Login to the DirectAdmin control panel for this account. */
  daUsername: string;
  // Audit F-15: the DA password is intentionally NOT part of this e-mail.
  // The customer retrieves credentials via the client panel ("Magic Login"),
  // which is authenticated — e-mail is plaintext at rest on foreign servers.
  panelUrl: string;
}

export function accountProvisionedTemplate(ctx: AccountProvisionedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';

  const { html, text } = renderEmailShell({
    title: 'Twoje konto hostingowe jest gotowe!',
    preheader: `Plan ${escapeHtml(ctx.planName)} — strona ${escapeHtml(ctx.domain)} aktywna.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Twoje konto hostingowe Verris zostało **uruchomione i jest gotowe do pracy**. Możesz już wgrywać pliki, konfigurować bazę danych i kierować ruch ze swojej domeny.`,
      ``,
      `## Szczegóły konta`,
      ``,
      `- **Plan:** ${escapeHtml(ctx.planName)}`,
      `- **Domena główna:** ${escapeHtml(ctx.domain)}`,
      `- **Login do DirectAdmin:** \`${escapeHtml(ctx.daUsername)}\``,
      `- **Hasło:** dostępne w panelu klienta — usługa → **Magic Login** (nie wysyłamy haseł e-mailem)`,
      ``,
      `**Pierwsze kroki:**`,
      ``,
      `1. Zaloguj się do DirectAdmin przez **Magic Login** w panelu klienta (Subskrypcje → Twoja usługa).`,
      `2. Skonfiguruj rekordy DNS swojej domeny — albo skieruj nameservery na nasze, albo ustaw rekordy A/AAAA wskazujące na adres serwera podany w panelu Verris.`,
      `3. Zainstaluj certyfikat SSL (Let's Encrypt — jednym kliknięciem w DA) lub wgraj własny.`,
      `4. Wgraj swoje pliki przez **File Manager** lub FTP/SFTP.`,
      ``,
      `Jeśli przenosisz stronę z innego hostingu — w panelu klienta znajdziesz **kreator migracji** (Subskrypcje → Twoja usługa → "Przenieś stronę").`,
    ].join('\n'),
    cta: {
      label: 'Otwórz panel klienta',
      url: `${ctx.panelUrl}/dashboard/subscriptions`,
    },
    footnote:
      'Ze względów bezpieczeństwa nie wysyłamy haseł e-mailem (audit F-15). Dane logowania znajdziesz w panelu klienta — sekcja Magic Login przy Twojej usłudze.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'hosting.account-provisioned',
    subject: `[Verris] ${ctx.domain} — hosting aktywny, witamy!`,
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 2. account-suspended-payment — DA account suspended after grace expired
//    (different from subscription-suspended, which is the wider notification
//    covering the subscription as a whole)
// ---------------------------------------------------------------------------

export interface AccountSuspendedPaymentContext {
  to: string;
  firstName: string | null;
  domain: string;
  suspendedAt: Date;
  /** When DA account will be deleted permanently (typically suspendedAt + 30d). */
  hardDeleteAt: Date;
  panelUrl: string;
}

export function accountSuspendedPaymentTemplate(
  ctx: AccountSuspendedPaymentContext,
): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';

  const { html, text } = renderEmailShell({
    title: `Konto ${ctx.domain} zostało zawieszone`,
    preheader: `Brak płatności — masz czas do ${escapeHtml(formatDate(ctx.hardDeleteAt))}.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Z przykrością informujemy, że Twoje **konto hostingowe ${escapeHtml(
        ctx.domain,
      )}** zostało zawieszone z powodu nieuregulowanej płatności.`,
      ``,
      `## Co teraz`,
      ``,
      `- **Strona internetowa nie działa** — odwiedzający widzą stronę zastępczą,`,
      `- **e-maile na tej domenie nie są dostarczane** (wszystkie wysłane do Ciebie odbijają się),`,
      `- **dane są jednak zachowane** (pliki, bazy, e-maile) — w naszych backupach i na serwerze,`,
      `- masz czas do **${escapeHtml(
        formatDate(ctx.hardDeleteAt),
      )}** (30 dni) na uregulowanie płatności i wznowienie usługi,`,
      `- po tym terminie konto zostanie **trwale usunięte** wraz ze wszystkimi danymi.`,
      ``,
      `## Jak wznowić`,
      ``,
      `1. Zaloguj się do panelu klienta,`,
      `2. Wybierz "Wznów subskrypcję" w sekcji Subskrypcje,`,
      `3. Po pomyślnej płatności **strona wraca w ciągu kilkunastu minut** — bez utraty danych.`,
    ].join('\n'),
    cta: {
      label: 'Wznów subskrypcję',
      url: `${ctx.panelUrl}/dashboard/billing`,
    },
    footnote:
      'Jeśli to świadoma decyzja (rezygnacja) — nie musisz nic robić. Po 30 dniach automatycznie usuniemy dane zgodnie z RODO.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'hosting.account-suspended-payment',
    subject: `[Verris] ${ctx.domain} — konto zawieszone, wznów do ${formatDate(ctx.hardDeleteAt)}`,
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 3. domain-expiry-reminder (T-30 / T-7 / T-1)
// ---------------------------------------------------------------------------

export type DomainExpiryWindow = 'T_MINUS_30' | 'T_MINUS_7' | 'T_MINUS_1';

export interface DomainExpiryReminderContext {
  to: string;
  firstName: string | null;
  domain: string;
  expiresAt: Date;
  window: DomainExpiryWindow;
  /** Pre-formatted price (e.g. "59.00 zł / rok") for the renewal offer. */
  renewalPrice: string;
  panelUrl: string;
}

const DOMAIN_WINDOW_LABEL: Record<DomainExpiryWindow, string> = {
  T_MINUS_30: 'za 30 dni',
  T_MINUS_7: 'za 7 dni',
  T_MINUS_1: 'jutro',
};

export function domainExpiryReminderTemplate(
  ctx: DomainExpiryReminderContext,
): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const when = DOMAIN_WINDOW_LABEL[ctx.window];

  const urgencyLine =
    ctx.window === 'T_MINUS_1'
      ? '⚠️ **Ostatnia chwila** — jutro domena wygaśnie i może zostać przejęta przez kogoś innego.'
      : ctx.window === 'T_MINUS_7'
        ? 'Zostało już niewiele czasu — zalecamy odnowienie w ciągu kilku dni.'
        : 'Masz jeszcze sporo czasu, ale przypominamy z wyprzedzeniem, żebyś mógł zaplanować odnowienie spokojnie.';

  const { html, text } = renderEmailShell({
    title: `Domena ${ctx.domain} wygasa ${when}`,
    preheader: `${escapeHtml(ctx.domain)} — odnów do ${escapeHtml(formatDate(ctx.expiresAt))}.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Twoja domena **${escapeHtml(ctx.domain)}** wygasa **${when}** (${escapeHtml(formatDate(ctx.expiresAt))}).`,
      ``,
      urgencyLine,
      ``,
      `## Odnowienie`,
      ``,
      `- **Cena:** ${escapeHtml(ctx.renewalPrice)}`,
      `- **Bez przerwy w działaniu** — odnowienie przed datą wygaśnięcia gwarantuje, że strona i e-maile cały czas działają,`,
      `- **Po wygaśnięciu** rozpoczyna się okres karencji (zwykle 30-45 dni dla domen .pl/.eu, krócej dla niektórych innych) — domena nadal jest Twoja, ale strona nie działa,`,
      `- **Po karencji** domena trafia do puli wolnych — kto pierwszy, ten lepszy.`,
    ].join('\n'),
    cta: {
      label: 'Odnów domenę',
      url: `${ctx.panelUrl}/dashboard/domains`,
    },
    footnote:
      'Możesz włączyć **automatyczne odnawianie** w ustawieniach domeny — wtedy nie będziesz musiał o tym pamiętać. Pobranie nastąpi z portfela albo karty.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  const tagSuffix =
    ctx.window === 'T_MINUS_30' ? 't30' : ctx.window === 'T_MINUS_7' ? 't7' : 't1';
  return {
    to: ctx.to,
    tag: `hosting.domain-expiry-reminder.${tagSuffix}`,
    subject: `[Verris] Domena ${ctx.domain} wygasa ${when}`,
    text,
    html,
  };
}
