import type { MailMessage } from '../mailer.interface.js';
import { renderEmailShell, escapeMarkdown } from './_layouts/email-shell.js';

/**
 * F3.8 — poczta serwisowa od obsługi: mail do klienta z szablonu (karta klienta) i komunikat serwisowy do klientów węzła
 * albo planu. Treść pisze operator, więc całą escapujemy (bez linków i formatowania z treści) i dzielimy na akapity.
 * TRANSACTIONAL — dotyczy działania usługi, wychodzi bez zgody marketingowej (PKE), dlatego bez treści promocyjnych
 * (API odrzuca je wcześniej: trescPromocyjna w libs/contracts) i bez linku wypisu. Nadawca: obsługa (odpowiedź trafia do
 * zgłoszeń przez skrzynkę zespołu, F3.7); bez nazwiska operatora (D3).
 */

export interface MailObslugiContext {
  to: string;
  userId: string;
  temat: string;
  tresc: string;
  panelUrl: string;
  /** Mail w sprawie zgłoszenia — wątek (Message-ID/In-Reply-To) i odpowiedź wraca do tego zgłoszenia. */
  zgloszenieId?: string | null;
  tag: string;
}

const STOPKA_SERWISOWA =
  'To wiadomość serwisowa dotycząca Twojej usługi w Verris — wysyłamy ją niezależnie od zgód marketingowych. Odpowiedz na nią, jeśli masz pytania.';

export function trescDoMarkdown(tresc: string): string {
  return tresc
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((akapit) => akapit.split('\n').map((l) => escapeMarkdown(l.trimEnd())).join('\n'))
    .filter((a) => a.trim())
    .join('\n\n');
}

export function mailObslugiTemplate(ctx: MailObslugiContext): MailMessage {
  const { html, text } = renderEmailShell({
    title: ctx.temat,
    preheader: ctx.temat.slice(0, 100),
    bodyMarkdown: trescDoMarkdown(ctx.tresc),
    footnote: STOPKA_SERWISOWA,
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return {
    to: ctx.to,
    userId: ctx.userId,
    tag: ctx.tag,
    subject: ctx.temat,
    text,
    html,
    category: 'TRANSACTIONAL',
    fromRole: 'SUPPORT',
    ...(ctx.zgloszenieId ? { zgloszenieId: ctx.zgloszenieId } : {}),
  };
}
