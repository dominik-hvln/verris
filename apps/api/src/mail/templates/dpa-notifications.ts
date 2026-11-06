import type { MailMessage } from '../mailer.interface.js';
import { renderEmailShell, escapeMarkdown } from './_layouts/email-shell.js';

export interface DpaAcceptedContext {
  to: string;
  firstName: string | null;
  dpaVersion: string;
  pdfUrl: string;
  panelUrl: string;
}

/**
 * Confirmation email sent after a B2B client accepts the current DPA. The
 * link in the CTA generates a personalized PDF on demand (see
 * `GET /me/dpa.pdf`).
 */
export function dpaAcceptedTemplate(ctx: DpaAcceptedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';

  const { html, text } = renderEmailShell({
    title: 'Akceptacja Umowy Powierzenia Danych (DPA)',
    preheader: `Wersja ${ctx.dpaVersion} – pobierz spersonalizowany PDF.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Dziękujemy za zaakceptowanie aktualnej wersji **Umowy Powierzenia Przetwarzania Danych Osobowych (DPA)** w wersji **${escapeMarkdown(ctx.dpaVersion)}**.`,
      ``,
      `## Co teraz?`,
      ``,
      `- Możesz pobrać egzemplarz PDF z danymi Twojej firmy (nazwa, NIP, adres, e-mail kontaktowy) i datą akceptacji.`,
      `- Identyfikator akceptacji widoczny w stopce każdej strony PDF jest jednoznacznym dowodem zawarcia umowy w naszym systemie.`,
      `- Egzemplarz pobierzesz też w panelu: Ustawienia → Prywatność i dane → Umowa powierzenia danych.`,
      `- Aktualną wersję DPA znajdziesz zawsze pod adresem [${escapeMarkdown(ctx.panelUrl)}/legal/dpa](${ctx.panelUrl}/legal/dpa).`,
      ``,
      `## Co znajdziesz w PDF`,
      ``,
      `- preambuła i zakres umowy,`,
      `- kategorie przetwarzanych danych i podmioty,`,
      `- obowiązki Verris jako podmiotu przetwarzającego,`,
      `- postępowanie w razie naruszenia (powiadomimy Cię najpóźniej w ciągu 24 godzin od jego stwierdzenia),`,
      `- listę dalszych podmiotów przetwarzających (o zmianie informujemy 30 dni wcześniej, możesz zgłosić sprzeciw),`,
      `- prawo audytu i punkt kontaktowy: rodo@verris.pl.`,
    ].join('\n'),
    cta: {
      label: 'Pobierz DPA (PDF)',
      url: ctx.pdfUrl,
    },
    footnote:
      'PDF generowany jest na żądanie z aktualnymi danymi Twojej firmy. Jeśli zmienisz dane firmowe w panelu, kolejna pobrana kopia będzie je odzwierciedlać.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'rodo.dpa-accepted',
    subject: `[Verris] Potwierdzenie akceptacji DPA (wersja ${ctx.dpaVersion})`,
    text,
    html,
  };
}
