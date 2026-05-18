import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

const DATE_FORMATTER = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDateTimePl(d: Date): string {
  return DATE_FORMATTER.format(d).replace(',', '');
}

const DAY_FORMATTER = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatDayPl(d: Date): string {
  return DAY_FORMATTER.format(d);
}

// ---------------------------------------------------------------------------
// 1. Potwierdzenie wniosku o usunięcie konta
// ---------------------------------------------------------------------------

export interface DeletionRequestedContext {
  to: string;
  firstName: string | null;
  scheduledFor: Date;
  gracePeriodDays: number;
  cancelUrl: string;
}

export function deletionRequestedTemplate(ctx: DeletionRequestedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const scheduledStr = formatDateTimePl(ctx.scheduledFor);
  const dayStr = formatDayPl(ctx.scheduledFor);

  const { html, text } = renderEmailShell({
    title: 'Otrzymaliśmy Twój wniosek o usunięcie konta',
    preheader: `Konto zostanie zanonimizowane ${dayStr}. Możesz cofnąć wniosek w panelu.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Potwierdzamy, że zarejestrowaliśmy Twój wniosek o usunięcie konta w Verris (RODO art. 17 — prawo do bycia zapomnianym).`,
      ``,
      `## Co się stanie i kiedy`,
      ``,
      `- **${ctx.gracePeriodDays} dni** karencji — w tym czasie możesz cofnąć wniosek bez konsekwencji.`,
      `- W dniu **${escapeHtml(scheduledStr)}** zanonimizujemy Twoje konto: usuniemy dane osobowe (imię, adres, NIP, hasła), dezaktywujemy subskrypcje i zawiesimy konta hostingowe.`,
      `- Po **30 dniach od anonimizacji** trwale usuniemy konta hostingowe (usługi, e-maile, bazy danych) z naszych serwerów.`,
      `- Faktury, transakcje portfela i dane księgowe zostaną zachowane przez 5 lat (wymóg polskiej ustawy o rachunkowości), ale bez powiązania z Twoją tożsamością.`,
      ``,
      `## Chcesz cofnąć wniosek?`,
      ``,
      `Możesz to zrobić w dowolnym momencie w sekcji **Ustawienia → Prywatność i dane** w panelu klienta. Po anonimizacji cofnięcie nie będzie już możliwe.`,
    ].join('\n'),
    cta: {
      label: 'Cofnij wniosek w panelu',
      url: ctx.cancelUrl,
    },
    footnote:
      'Jeśli to nie Ty zgłosiłeś wniosek o usunięcie konta, natychmiast skontaktuj się z nami: rodo@verris.pl.',
    recipientEmail: ctx.to,
    panelUrl: ctx.cancelUrl.replace(/\/dashboard\/.*$/, ''),
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'rodo.deletion-requested',
    subject: `[Verris] Wniosek o usunięcie konta — anonimizacja ${dayStr}`,
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 2. Konto zostało zanonimizowane (final goodbye)
// ---------------------------------------------------------------------------

export interface AccountAnonymizedContext {
  to: string;
  firstName: string | null;
  purgeDate: Date;
}

export function accountAnonymizedTemplate(ctx: AccountAnonymizedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const purgeStr = formatDayPl(ctx.purgeDate);

  const { html, text } = renderEmailShell({
    title: 'Twoje konto Verris zostało zanonimizowane',
    preheader: 'To ostatni e-mail, jaki od nas otrzymujesz. Dziękujemy.',
    bodyMarkdown: [
      greeting,
      ``,
      `Zgodnie z Twoim wnioskiem zanonimizowaliśmy Twoje konto w Verris. Usunęliśmy z naszych systemów:`,
      ``,
      `- imię, nazwisko, adres, NIP, dane do faktury,`,
      `- hasła i klucze 2FA,`,
      `- numery kart i metody płatności (po stronie Stripe również usunięte),`,
      `- kody referralów i token "eco badge".`,
      ``,
      `## Co jeszcze się dzieje`,
      ``,
      `- Konta hostingowe na naszych serwerach zostały **zawieszone**. Trwale usuniemy je **${escapeHtml(purgeStr)}** (30 dni karencji na ewentualne odzyskanie danych przez nasz support, jeśli zgłosisz to przed tą datą).`,
      `- Faktury i historia transakcji są nadal przechowywane (wymóg art. 74 ustawy o rachunkowości), ale bez powiązania z Twoją tożsamością.`,
      `- Nie możesz już zalogować się do panelu — adres e-mail został zastąpiony przez wartość techniczną.`,
      ``,
      `## Chciałbyś jeszcze odzyskać dane?`,
      ``,
      `Masz **30 dni**, żeby skontaktować się z naszym supportem (rodo@verris.pl) z prośbą o tymczasowe przywrócenie konta hostingowego. Po tym terminie konta hostingowe zostaną nieodwracalnie usunięte.`,
      ``,
      `Dziękujemy, że byłeś z nami. Powodzenia!`,
      ``,
      `— Zespół Verris`,
    ].join('\n'),
    footnote:
      'To ostatnia wiadomość, jaką wysyłamy na ten adres e-mail. Dalsza komunikacja jest możliwa wyłącznie przez rodo@verris.pl.',
    recipientEmail: ctx.to,
    panelUrl: 'https://verris.pl',
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'rodo.account-anonymized',
    subject: '[Verris] Twoje konto zostało zanonimizowane',
    text,
    html,
  };
}
