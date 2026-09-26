import type { MailMessage } from '../mailer.interface.js';
import { renderEmailShell, escapeMarkdown } from './_layouts/email-shell.js';

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
  /** Login konta hostingowego (DA) — w treści maila bez nazwy DirectAdmina (white label, 2026-09-24). */
  daUsername: string;
  // Audit F-15: the DA password is intentionally NOT part of this e-mail.
  // The customer retrieves credentials in the client panel (service card),
  // which is authenticated — e-mail is plaintext at rest on foreign servers.
  panelUrl: string;
}

export function accountProvisionedTemplate(ctx: AccountProvisionedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**!` : 'Cześć!';

  const { html, text } = renderEmailShell({
    title: 'Twoje konto hostingowe jest gotowe!',
    preheader: `Plan ${escapeMarkdown(ctx.planName)} — strona ${escapeMarkdown(ctx.domain)} aktywna.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Twoje konto hostingowe Verris zostało **uruchomione i jest gotowe do pracy**. Możesz już wgrywać pliki, konfigurować bazę danych i kierować ruch ze swojej domeny.`,
      ``,
      `## Szczegóły konta`,
      ``,
      `- **Plan:** ${escapeMarkdown(ctx.planName)}`,
      `- **Domena główna:** ${escapeMarkdown(ctx.domain)}`,
      `- **Login hostingowy:** \`${escapeMarkdown(ctx.daUsername)}\` (także login FTP i prefiks nazw baz danych)`,
      `- **Hasło:** w panelu klienta przy usłudze — nie wysyłamy haseł e-mailem`,
      ``,
      `**Pierwsze kroki:**`,
      ``,
      `1. Otwórz usługę w panelu klienta — znajdziesz tam dane logowania do panelu hostingowego i FTP.`,
      `2. Skieruj domenę na nasze serwery nazw albo ustaw rekordy A/AAAA na adres serwera podany przy usłudze.`,
      `3. Certyfikat SSL (Let's Encrypt) próbujemy wystawić od razu; jeśli domena jeszcze nie wskazuje na nasz serwer, wystawisz go jednym kliknięciem w zakładce SSL.`,
      `4. Wgraj pliki przez menedżer plików w panelu albo przez FTP/SFTP.`,
      ``,
      `Przenosisz stronę z innego hostingu? W panelu klienta jest **kreator migracji** — przeniesie pliki, bazy i pocztę.`,
    ].join('\n'),
    cta: {
      label: 'Otwórz panel klienta',
      url: `${ctx.panelUrl}/dashboard/services`,
    },
    footnote: 'Ze względów bezpieczeństwa nie wysyłamy haseł e-mailem. Dane logowania znajdziesz w panelu klienta przy usłudze.',
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
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';

  const { html, text } = renderEmailShell({
    title: `Konto ${ctx.domain} zostało zawieszone`,
    preheader: `Brak płatności — masz czas do ${escapeMarkdown(formatDate(ctx.hardDeleteAt))}.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Z przykrością informujemy, że Twoje **konto hostingowe ${escapeMarkdown(
        ctx.domain,
      )}** zostało zawieszone z powodu nieuregulowanej płatności.`,
      ``,
      `## Co teraz`,
      ``,
      `- **Strona internetowa nie działa** — odwiedzający widzą stronę zastępczą,`,
      `- **e-maile na tej domenie nie są dostarczane** (wszystkie wysłane do Ciebie odbijają się),`,
      `- **dane są jednak zachowane** (pliki, bazy, e-maile) — w naszych backupach i na serwerze,`,
      `- masz czas do **${escapeMarkdown(
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
// 3. domain-expiry-reminder (T-30 / T-14 / T-7 — tak jak obiecuje verris.pl)
// ---------------------------------------------------------------------------

export type DomainExpiryWindow = 'T_MINUS_30' | 'T_MINUS_14' | 'T_MINUS_7';

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
  T_MINUS_14: 'za 14 dni',
  T_MINUS_7: 'za 7 dni',
};

export function domainExpiryReminderTemplate(
  ctx: DomainExpiryReminderContext,
): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const when = DOMAIN_WINDOW_LABEL[ctx.window];

  const urgencyLine =
    ctx.window === 'T_MINUS_7'
      ? '⚠️ **Został tydzień** — po wygaśnięciu strona i poczta w tej domenie przestaną działać.'
      : ctx.window === 'T_MINUS_14'
        ? 'Zostały dwa tygodnie — zalecamy odnowienie w najbliższych dniach.'
        : 'Masz jeszcze sporo czasu, ale przypominamy z wyprzedzeniem, żebyś mógł zaplanować odnowienie spokojnie.';

  const { html, text } = renderEmailShell({
    title: `Domena ${ctx.domain} wygasa ${when}`,
    preheader: `${escapeMarkdown(ctx.domain)} — odnów do ${escapeMarkdown(formatDate(ctx.expiresAt))}.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Twoja domena **${escapeMarkdown(ctx.domain)}** wygasa **${when}** (${escapeMarkdown(formatDate(ctx.expiresAt))}).`,
      ``,
      urgencyLine,
      ``,
      `## Odnowienie`,
      ``,
      `- **Cena:** ${escapeMarkdown(ctx.renewalPrice)}`,
      `- **Bez przerwy w działaniu** — odnowienie przed datą wygaśnięcia gwarantuje, że strona i e-maile cały czas działają,`,
      `- **Po wygaśnięciu** rozpoczyna się okres karencji (zwykle 30-45 dni dla domen .pl/.eu, krócej dla niektórych innych) — domena nadal jest Twoja, ale strona nie działa,`,
      `- **Po karencji** domena trafia do puli wolnych — kto pierwszy, ten lepszy.`,
    ].join('\n'),
    cta: {
      label: 'Odnów domenę',
      url: `${ctx.panelUrl}/dashboard/domains`,
    },
    footnote:
      'Domen nie odnawiamy automatycznie — o odnowieniu zawsze decydujesz Ty. Przypomnimy jeszcze na 14 i 7 dni przed terminem.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  const tagSuffix =
    ctx.window === 'T_MINUS_30' ? 't30' : ctx.window === 'T_MINUS_14' ? 't14' : 't7';
  return {
    to: ctx.to,
    tag: `hosting.domain-expiry-reminder.${tagSuffix}`,
    subject: `[Verris] Domena ${ctx.domain} wygasa ${when}`,
    text,
    html,
  };
}

/* ===================== PANEL-14 — alert o limitach konta ===================== */
export interface AccountQuotaAlertContext {
  to: string;
  firstName: string | null;
  domain: string;
  diskPct: number | null;
  bandwidthPct: number | null;
  /** K-08: odsetek próbek z ostatniej doby, w których CPU / RAM był przy limicie. */
  cpuHotPct?: number | null;
  ramHotPct?: number | null;
  panelUrl: string;
  /** Link przycisku (zakładka „Zużycie zasobów” usługi); bez niego — panel. */
  ctaUrl?: string;
}

export function accountQuotaAlertTemplate(ctx: AccountQuotaAlertContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const lines: string[] = [greeting, '', `Twoje konto **${escapeMarkdown(ctx.domain)}** zbliża się do limitów:`, ''];
  if (ctx.diskPct != null) lines.push(`- **Dysk:** wykorzystane ${ctx.diskPct}%`);
  if (ctx.bandwidthPct != null) lines.push(`- **Transfer (bież. okres):** wykorzystany ${ctx.bandwidthPct}%`);
  if (ctx.cpuHotPct != null) lines.push(`- **Procesor:** przy limicie przez ${ctx.cpuHotPct}% ostatniej doby — strona może wtedy zwalniać`);
  if (ctx.ramHotPct != null) lines.push(`- **Pamięć RAM:** przy limicie przez ${ctx.ramHotPct}% ostatniej doby — procesy mogą być przerywane`);
  lines.push('', '## Co możesz zrobić', '');
  const rady: string[] = [];
  if (ctx.diskPct != null || ctx.bandwidthPct != null) rady.push('Usuń zbędne pliki i stare kopie lub wyczyść logi.');
  if (ctx.cpuHotPct != null || ctx.ramHotPct != null)
    rady.push('Włącz cache strony (np. LSCache dla WordPressa) i sprawdź wtyczki oraz zadania cron, które obciążają konto.');
  rady.push('Rozważ wyższy plan albo autoskalowanie, jeśli potrzebujesz więcej zasobów.');
  rady.push('Szczegóły i wykresy znajdziesz w panelu (zakładka „Zużycie zasobów”).');
  rady.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  const { html, text } = renderEmailShell({
    title: `Konto ${ctx.domain} zbliża się do limitu`,
    preheader: 'Wykorzystanie zasobów konta jest wysokie.',
    bodyMarkdown: lines.join('\n'),
    cta: { label: 'Sprawdź wykorzystanie', url: ctx.ctaUrl ?? ctx.panelUrl },
    footnote: 'Alert wysyłany maksymalnie raz na kilka dni, gdy wykorzystanie jest wysokie.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'hosting.quota-alert', subject: `[Verris] Konto ${ctx.domain} zbliża się do limitu zasobów`, text, html };
}
