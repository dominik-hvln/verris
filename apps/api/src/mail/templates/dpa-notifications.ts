import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

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
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';

  const { html, text } = renderEmailShell({
    title: 'Akceptacja Umowy Powierzenia Danych (DPA)',
    preheader: `Wersja ${ctx.dpaVersion} — pobierz spersonalizowany PDF.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Dziękujemy za zaakceptowanie aktualnej wersji **Umowy Powierzenia Przetwarzania Danych Osobowych (DPA)** w wersji **${escapeHtml(ctx.dpaVersion)}**.`,
      ``,
      `## Co teraz?`,
      ``,
      `- Możesz pobrać spersonalizowany PDF DPA, zawierający dane Twojej firmy (nazwę, NIP, adres, e-mail kontaktowy) oraz datę akceptacji.`,
      `- Identyfikator akceptacji widoczny w stopce każdej strony PDF jest jednoznacznym dowodem zawarcia umowy w naszym systemie.`,
      `- Aktualną wersję DPA znajdziesz zawsze pod adresem [${escapeHtml(ctx.panelUrl)}/legal/dpa](${ctx.panelUrl}/legal/dpa).`,
      ``,
      `## Co znajdziesz w PDF`,
      ``,
      `- preambuła i zakres umowy,`,
      `- kategorie przetwarzanych danych i podmioty,`,
      `- obowiązki Verris jako procesora,`,
      `- postępowanie w razie naruszenia (Art. 33 RODO — 72h),`,
      `- lista subprocessorów (na życzenie aktualizujemy w 30-dniowym okresie sprzeciwu),`,
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
