import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

/**
 * Billing lifecycle email templates (Sprint 2.1).
 *
 * Each template here is paired with a real Stripe webhook / scheduler hook
 * — never sent on a "best effort" basis. The expectation is:
 *
 *   wallet-low-balance        → WalletLowBalanceScheduler (cron, daily 09:00)
 *   subscription-renewal      → SubscriptionReminderScheduler (cron, T-7/3/1)
 *   subscription-renewed      → BillingService.handleInvoicePaid (after our
 *                               own invoice row created)
 *   subscription-payment-fail → BillingService.handleInvoicePaymentFailed
 *   subscription-suspended    → SubscriptionsService.markPastDueFromStripe
 *                               once status == UNPAID/CANCELED
 *   subscription-cancelled    → SubscriptionsService.markCanceledFromStripe
 *
 * All emails are TRANSACTIONAL category — they document an action the user
 * (or our automation) took on their account. No `MARKETING` opt-in check.
 */

const PLN_FORMATTER = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DAY_FORMATTER = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatPLN(amount: string | number): string {
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (Number.isNaN(n)) return `${amount} zł`;
  return PLN_FORMATTER.format(n);
}

function formatDate(d: Date): string {
  return DAY_FORMATTER.format(d);
}

// ---------------------------------------------------------------------------
// wallet-topup-ok (Stripe checkout)
// ---------------------------------------------------------------------------

export interface WalletTopupOkContext {
  to: string;
  firstName: string | null;
  amountPln: string;
  newBalancePln: string;
  panelUrl: string;
}

export function walletTopupOkTemplate(ctx: WalletTopupOkContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'Portfel doładowany',
    preheader: `${formatPLN(ctx.amountPln)} — nowe saldo ${formatPLN(ctx.newBalancePln)}.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Potwierdzamy **doładowanie portfela** kartą.`,
      ``,
      `- **Kwota:** ${escapeHtml(formatPLN(ctx.amountPln))}`,
      `- **Nowe saldo:** ${escapeHtml(formatPLN(ctx.newBalancePln))}`,
    ].join('\n'),
    cta: { label: 'Zobacz portfel', url: `${ctx.panelUrl}/dashboard/billing` },
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'wallet.topup-ok',
    subject: `[Verris] Doładowano portfel — ${formatPLN(ctx.amountPln)}`,
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// wallet-auto-topup-ok
// ---------------------------------------------------------------------------

export interface WalletAutoTopupOkContext {
  to: string;
  firstName: string | null;
  amountPln: string;
  newBalancePln: string;
  panelUrl: string;
}

export function walletAutoTopupOkTemplate(ctx: WalletAutoTopupOkContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'Auto-doładowanie portfela',
    preheader: `Dodano ${formatPLN(ctx.amountPln)} — saldo ${formatPLN(ctx.newBalancePln)}.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Zgodnie z Twoją regułą **automatycznie doładowaliśmy portfel**.`,
      ``,
      `- **Kwota:** ${escapeHtml(formatPLN(ctx.amountPln))}`,
      `- **Saldo:** ${escapeHtml(formatPLN(ctx.newBalancePln))}`,
    ].join('\n'),
    cta: { label: 'Ustawienia portfela', url: `${ctx.panelUrl}/dashboard/billing` },
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'wallet.auto-topup-ok',
    subject: `[Verris] Auto-doładowanie — ${formatPLN(ctx.amountPln)}`,
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 0. wallet-auto-topup-failed
// ---------------------------------------------------------------------------

export interface WalletAutoTopupFailedContext {
  to: string;
  firstName: string | null;
  reason: string;
  topupAmountPln: string;
  panelUrl: string;
}

export function walletAutoTopupFailedTemplate(ctx: WalletAutoTopupFailedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';

  const { html, text } = renderEmailShell({
    title: 'Automatyczne doładowanie nie powiodło się',
    preheader: 'Zmień kartę lub doładuj portfel ręcznie.',
    bodyMarkdown: [
      greeting,
      ``,
      `Nie udało się wykonać **automatycznego doładowania** portfela na kwotę **${escapeHtml(
        ctx.topupAmountPln,
      )} K**.`,
      ``,
      `**Powód:** ${escapeHtml(ctx.reason)}`,
      ``,
      `Doładuj portfel ręcznie lub zaktualizuj zapisaną kartę w ustawieniach — inaczej odnowienia usług i autoskalowanie mogą się zatrzymać przy zerowym saldzie.`,
    ].join('\n'),
    cta: {
      label: 'Portfel i karty',
      url: `${ctx.panelUrl}/dashboard/billing`,
    },
    footnote: 'Kolejna próba auto-doładowania nastąpi po upływie okresu cooldown (ok. 1 h).',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'wallet.auto-topup-failed',
    subject: '[Verris] Automatyczne doładowanie portfela nie powiodło się',
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 1. wallet-low-balance
// ---------------------------------------------------------------------------

export interface WalletLowBalanceContext {
  to: string;
  firstName: string | null;
  currentBalance: string;
  thresholdBalance: string;
  /** Estimated days until balance hits zero based on average burn rate; null when unknown. */
  daysUntilEmpty: number | null;
  /** True if user has automatic top-up configured — we tell them next attempt timing. */
  hasAutoTopup: boolean;
  /** Date of next auto-topup attempt (only when `hasAutoTopup`). */
  nextAutoTopupAt: Date | null;
  panelUrl: string;
}

export function walletLowBalanceTemplate(ctx: WalletLowBalanceContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';

  const daysLine =
    ctx.daysUntilEmpty !== null && ctx.daysUntilEmpty > 0
      ? `Przy obecnym tempie wykorzystania środków portfel wystarczy jeszcze na **około ${ctx.daysUntilEmpty} dni**.`
      : 'Środki w portfelu są niskie — zalecamy uzupełnienie, aby uniknąć przerwy w usługach.';

  const autoTopupLine = ctx.hasAutoTopup
    ? ctx.nextAutoTopupAt
      ? `Masz włączone **automatyczne doładowanie** — kolejna próba: **${escapeHtml(
          formatDate(ctx.nextAutoTopupAt),
        )}**.`
      : 'Masz włączone **automatyczne doładowanie** — uruchomi się, gdy saldo spadnie poniżej progu.'
    : 'Możesz **włączyć automatyczne doładowanie** w ustawieniach portfela, aby nigdy nie martwić się o saldo.';

  const { html, text } = renderEmailShell({
    title: 'Niskie saldo portfela Verris',
    preheader: `Pozostało ${ctx.currentBalance} K — uzupełnij, by uniknąć przerwy w usługach.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Saldo Twojego portfela Verris spadło poniżej ustawionego progu **${escapeHtml(
        ctx.thresholdBalance,
      )} K**.`,
      ``,
      `## Aktualnie na portfelu`,
      ``,
      `**${escapeHtml(ctx.currentBalance)} K**  *(1 K = 1 zł)*`,
      ``,
      daysLine,
      ``,
      autoTopupLine,
      ``,
      `Aby kontynuować bez przerw — wszystkie odnowienia subskrypcji oraz autoskalowanie pobierają środki z tego portfela.`,
    ].join('\n'),
    cta: {
      label: 'Doładuj portfel',
      url: `${ctx.panelUrl}/dashboard/billing`,
    },
    footnote:
      'Próg powiadamiania możesz zmienić w "Portfel → Ustawienia". Limit to ochrona, a nie blokada — usługi działają dopóki w portfelu są środki.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'wallet.low-balance',
    subject: `[Verris] Niskie saldo portfela — ${ctx.currentBalance} K`,
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 2. subscription-renewal-reminder (T-7 / T-3 / T-1)
// ---------------------------------------------------------------------------

export type RenewalReminderWindow = 'T_MINUS_7' | 'T_MINUS_3' | 'T_MINUS_1';

export interface SubscriptionRenewalReminderContext {
  to: string;
  firstName: string | null;
  serviceName: string;
  /** Cents-amount as decimal string, e.g. "29.00" — net of tax/discounts already applied by Stripe. */
  amount: string;
  currency: 'PLN' | 'EUR' | 'USD';
  renewalDate: Date;
  window: RenewalReminderWindow;
  walletBalance: string;
  /** Will the renewal be paid from wallet (true) or directly via Stripe? */
  payFromWallet: boolean;
  /** Pre-formatted "Twój plan" details that vary per service kind. */
  planSummary: string;
  panelUrl: string;
}

const WINDOW_LABEL: Record<RenewalReminderWindow, string> = {
  T_MINUS_7: 'za 7 dni',
  T_MINUS_3: 'za 3 dni',
  T_MINUS_1: 'jutro',
};

export function subscriptionRenewalReminderTemplate(
  ctx: SubscriptionRenewalReminderContext,
): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const when = WINDOW_LABEL[ctx.window];
  const amount = ctx.currency === 'PLN' ? formatPLN(ctx.amount) : `${ctx.amount} ${ctx.currency}`;

  const sourceLine = ctx.payFromWallet
    ? `Płatność zostanie pobrana z **portfela Verris** (saldo: **${escapeHtml(
        ctx.walletBalance,
      )} K**). Jeśli środków zabraknie — usługa może zostać zawieszona.`
    : 'Płatność zostanie pobrana **automatycznie ze Stripe** z karty zapisanej w Twoim koncie.';

  const ctaLabel = ctx.payFromWallet ? 'Sprawdź saldo portfela' : 'Zarządzaj subskrypcją';
  const ctaUrl = ctx.payFromWallet
    ? `${ctx.panelUrl}/dashboard/billing`
    : `${ctx.panelUrl}/dashboard/subscriptions`;

  const { html, text } = renderEmailShell({
    title: `Subskrypcja "${ctx.serviceName}" zostanie odnowiona ${when}`,
    preheader: `${escapeHtml(ctx.serviceName)} — odnowienie ${escapeHtml(formatDate(ctx.renewalDate))} (${escapeHtml(amount)})`,
    bodyMarkdown: [
      greeting,
      ``,
      `Przypominamy, że Twoja subskrypcja **${escapeHtml(ctx.serviceName)}** zostanie automatycznie odnowiona **${when}** (${escapeHtml(formatDate(ctx.renewalDate))}).`,
      ``,
      `## Szczegóły odnowienia`,
      ``,
      `- **Plan:** ${escapeHtml(ctx.planSummary)}`,
      `- **Kwota:** ${escapeHtml(amount)}`,
      `- **Data:** ${escapeHtml(formatDate(ctx.renewalDate))}`,
      ``,
      sourceLine,
      ``,
      `Jeśli **nie chcesz odnawiać** subskrypcji — anuluj ją w panelu. Anulacja będzie skuteczna do końca obecnego okresu rozliczeniowego (dane i pliki **nie znikają natychmiast** — zachowujemy je 30 dni od daty wygaśnięcia).`,
    ].join('\n'),
    cta: {
      label: ctaLabel,
      url: ctaUrl,
    },
    footnote:
      'To wiadomość przypominająca — nie wymaga od Ciebie żadnej akcji, jeśli wszystko się zgadza. Subskrypcję możesz anulować w każdej chwili.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  const tagSuffix =
    ctx.window === 'T_MINUS_7' ? 't7' : ctx.window === 'T_MINUS_3' ? 't3' : 't1';

  return {
    to: ctx.to,
    tag: `subscription.renewal-reminder.${tagSuffix}`,
    subject: `[Verris] Odnowienie ${ctx.serviceName} ${when}`,
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 3. subscription-renewed (after invoice.paid)
// ---------------------------------------------------------------------------

export interface SubscriptionRenewedContext {
  to: string;
  firstName: string | null;
  serviceName: string;
  amount: string;
  currency: 'PLN' | 'EUR' | 'USD';
  paidAt: Date;
  newPeriodEnd: Date;
  /** Internal Verris invoice number, e.g. "VFV/2026/05/0042". */
  invoiceNumber: string | null;
  /** Authenticated panel URL where the invoice PDF can be downloaded. */
  invoiceUrl: string | null;
  panelUrl: string;
}

export function subscriptionRenewedTemplate(ctx: SubscriptionRenewedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const amount = ctx.currency === 'PLN' ? formatPLN(ctx.amount) : `${ctx.amount} ${ctx.currency}`;

  const invoiceLine = ctx.invoiceNumber
    ? `**Numer faktury:** ${escapeHtml(ctx.invoiceNumber)}${
        ctx.invoiceUrl ? ` — [pobierz PDF](${ctx.invoiceUrl})` : ''
      }`
    : 'Faktura zostanie wystawiona w ciągu kolejnych 24 godzin — otrzymasz osobny e-mail.';

  const { html, text } = renderEmailShell({
    title: `Subskrypcja "${ctx.serviceName}" została odnowiona`,
    preheader: `Płatność ${escapeHtml(amount)} potwierdzona — usługa działa do ${escapeHtml(formatDate(ctx.newPeriodEnd))}.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Dziękujemy! Twoja subskrypcja **${escapeHtml(ctx.serviceName)}** została pomyślnie odnowiona.`,
      ``,
      `## Podsumowanie`,
      ``,
      `- **Kwota:** ${escapeHtml(amount)}`,
      `- **Data płatności:** ${escapeHtml(formatDate(ctx.paidAt))}`,
      `- **Nowy okres rozliczeniowy do:** ${escapeHtml(formatDate(ctx.newPeriodEnd))}`,
      ``,
      invoiceLine,
      ``,
      `Wszystko jest gotowe — Twoja usługa działa nieprzerwanie.`,
    ].join('\n'),
    cta: ctx.invoiceUrl
      ? { label: 'Pobierz fakturę', url: ctx.invoiceUrl }
      : { label: 'Zarządzaj subskrypcjami', url: `${ctx.panelUrl}/dashboard/subscriptions` },
    footnote:
      'Wszystkie faktury (5 lat archiwum — wymóg PL) znajdziesz w sekcji "Portfel → Faktury" w panelu klienta.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'subscription.renewed',
    subject: `[Verris] Subskrypcja ${ctx.serviceName} odnowiona — ${amount}`,
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 4. subscription-payment-failed (Stripe `invoice.payment_failed`)
// ---------------------------------------------------------------------------

export interface SubscriptionPaymentFailedContext {
  to: string;
  firstName: string | null;
  serviceName: string;
  amount: string;
  currency: 'PLN' | 'EUR' | 'USD';
  /** Stripe error message — already user-friendly (e.g. "Karta odrzucona"). */
  errorReason: string | null;
  /** When Stripe will retry next; null if all retries exhausted. */
  nextRetryAt: Date | null;
  /** When the subscription will be suspended if payment keeps failing. */
  suspendAt: Date | null;
  /** Stripe-hosted "update payment method" URL or panel URL. */
  paymentUpdateUrl: string;
  panelUrl: string;
}

export function subscriptionPaymentFailedTemplate(
  ctx: SubscriptionPaymentFailedContext,
): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const amount = ctx.currency === 'PLN' ? formatPLN(ctx.amount) : `${ctx.amount} ${ctx.currency}`;
  const reasonLine = ctx.errorReason
    ? `**Powód odrzucenia:** ${escapeHtml(ctx.errorReason)}`
    : '**Powód:** Płatność została odrzucona przez bank lub operatora karty.';

  const retryLine = ctx.nextRetryAt
    ? `Spróbujemy ponownie automatycznie **${escapeHtml(formatDate(ctx.nextRetryAt))}**.`
    : 'Wykorzystaliśmy wszystkie próby automatycznego pobrania.';

  const suspendLine = ctx.suspendAt
    ? `Jeśli płatność nie zostanie uregulowana do **${escapeHtml(formatDate(ctx.suspendAt))}**, usługa **zostanie zawieszona**.`
    : 'Usługa może zostać zawieszona w ciągu najbliższych dni — zaktualizuj sposób płatności jak najszybciej.';

  const { html, text } = renderEmailShell({
    title: `Płatność za "${ctx.serviceName}" nie powiodła się`,
    preheader: `Kwota ${escapeHtml(amount)} nie została pobrana — ${
      ctx.nextRetryAt ? 'spróbujemy ponownie' : 'wymaga akcji'
    }.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Niestety, nie udało nam się pobrać płatności **${escapeHtml(amount)}** za subskrypcję **${escapeHtml(
        ctx.serviceName,
      )}**.`,
      ``,
      reasonLine,
      ``,
      retryLine,
      ``,
      suspendLine,
      ``,
      `## Co możesz zrobić`,
      ``,
      `- Zaktualizować dane karty / metodę płatności,`,
      `- Sprawdzić czy karta nie wygasła i nie ma zablokowanych płatności online,`,
      `- Skontaktować się z nami, jeśli powyższe nie pomaga: **rodo@verris.pl**.`,
    ].join('\n'),
    cta: {
      label: 'Zaktualizuj płatność',
      url: ctx.paymentUpdateUrl,
    },
    footnote:
      'Twoje dane i pliki są bezpieczne — nawet w razie zawieszenia konta zachowujemy je 30 dni, w tym czasie możesz wznowić bez utraty danych.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'subscription.payment-failed',
    subject: `[Verris] Pilne — płatność za ${ctx.serviceName} odrzucona`,
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 5. subscription-suspended (after retries exhausted)
// ---------------------------------------------------------------------------

export interface SubscriptionSuspendedContext {
  to: string;
  firstName: string | null;
  serviceName: string;
  /** Date when service was actually suspended. */
  suspendedAt: Date;
  /** Date when data will be permanently deleted (typically suspendedAt + 30 days). */
  dataDeletedAt: Date;
  paymentUpdateUrl: string;
  panelUrl: string;
}

export function subscriptionSuspendedTemplate(ctx: SubscriptionSuspendedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';

  const { html, text } = renderEmailShell({
    title: `Subskrypcja "${ctx.serviceName}" została zawieszona`,
    preheader: `Brak płatności — masz czas do ${escapeHtml(formatDate(ctx.dataDeletedAt))} na wznowienie.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Z przykrością informujemy, że Twoja subskrypcja **${escapeHtml(
        ctx.serviceName,
      )}** została **zawieszona** dnia ${escapeHtml(formatDate(ctx.suspendedAt))} z powodu nieuregulowanej płatności.`,
      ``,
      `## Co to oznacza`,
      ``,
      `- Usługa **przestała działać** (strony WWW niedostępne),`,
      `- Twoje **dane są zachowane** — w tym pliki, e-maile, bazy danych,`,
      `- Masz czas do **${escapeHtml(formatDate(ctx.dataDeletedAt))}** (30 dni od zawieszenia) na wznowienie subskrypcji bez utraty danych,`,
      `- Po tym terminie konto zostanie **trwale usunięte** zgodnie z naszą polityką retencji.`,
      ``,
      `## Jak wznowić`,
      ``,
      `1. Zaktualizuj metodę płatności,`,
      `2. Wybierz "Wznów subskrypcję" w panelu,`,
      `3. Po pomyślnej płatności usługa wraca **w ciągu kilkunastu minut**.`,
    ].join('\n'),
    cta: {
      label: 'Wznów subskrypcję',
      url: ctx.paymentUpdateUrl,
    },
    footnote:
      'Jeśli to świadoma decyzja (rezygnacja) — nie musisz nic robić. Po 30 dniach automatycznie usuniemy Twoje dane zgodnie z RODO.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'subscription.suspended',
    subject: `[Verris] Subskrypcja ${ctx.serviceName} zawieszona — wznów do ${formatDate(ctx.dataDeletedAt)}`,
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 6. subscription-cancelled (user-initiated or post-grace removal)
// ---------------------------------------------------------------------------

export interface SubscriptionCancelledContext {
  to: string;
  firstName: string | null;
  serviceName: string;
  /** When cancellation request was processed. */
  cancelledAt: Date;
  /**
   * Date until the service still works (end of paid period). Past dates
   * indicate immediate cancellation (refund / chargeback / hard delete).
   */
  effectiveUntil: Date;
  /** Date when data will be removed (typically `effectiveUntil + 30 days`). */
  dataDeletedAt: Date;
  /** True when user explicitly cancelled (vs automatic post-failure). */
  userInitiated: boolean;
  panelUrl: string;
}

export function subscriptionCancelledTemplate(ctx: SubscriptionCancelledContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const opening = ctx.userInitiated
    ? `Potwierdzamy anulowanie subskrypcji **${escapeHtml(ctx.serviceName)}** zgodnie z Twoim zgłoszeniem.`
    : `Subskrypcja **${escapeHtml(ctx.serviceName)}** została zakończona automatycznie — najczęściej z powodu nieuregulowanej płatności po terminie zawieszenia.`;

  const stillWorksLine =
    ctx.effectiveUntil.getTime() > ctx.cancelledAt.getTime()
      ? `Usługa **działa nadal do ${escapeHtml(formatDate(ctx.effectiveUntil))}** (do końca opłaconego okresu) — pełnia funkcjonalności bez zmian.`
      : 'Usługa została zakończona z dniem dzisiejszym.';

  const { html, text } = renderEmailShell({
    title: `Subskrypcja "${ctx.serviceName}" — anulacja potwierdzona`,
    preheader: `Działa do ${escapeHtml(formatDate(ctx.effectiveUntil))}, dane do ${escapeHtml(formatDate(ctx.dataDeletedAt))}.`,
    bodyMarkdown: [
      greeting,
      ``,
      opening,
      ``,
      stillWorksLine,
      ``,
      `## Twoje dane`,
      ``,
      `- Pliki, e-maile, bazy są **zachowane do ${escapeHtml(formatDate(ctx.dataDeletedAt))}** (30 dni od końca subskrypcji),`,
      `- W tym czasie możesz **wznowić** subskrypcję bez utraty czegokolwiek,`,
      `- Po tym terminie dane są **usuwane trwale** (RODO art. 17).`,
      ``,
      `Jeśli zmienisz zdanie — w sekcji "Subskrypcje" w panelu znajdziesz przycisk wznowienia.`,
      ``,
      `Dziękujemy, że byłeś z nami!`,
    ].join('\n'),
    cta: {
      label: 'Wróć do panelu',
      url: `${ctx.panelUrl}/dashboard/subscriptions`,
    },
    footnote:
      'Eksport danych (RODO art. 20) możesz wykonać w każdej chwili w "Ustawienia → Prywatność i dane".',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: ctx.userInitiated ? 'subscription.cancelled.user' : 'subscription.cancelled.auto',
    subject: `[Verris] Subskrypcja ${ctx.serviceName} — potwierdzenie anulacji`,
    text,
    html,
  };
}
