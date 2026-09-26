import type { MailMessage } from '../mail/mailer.interface.js';
import { escapeMarkdown as md, renderEmailShell } from '../mail/templates/_layouts/email-shell.js';

type Szablon = Omit<MailMessage, 'fromAddress'>;

/** Powiadomienie wewnętrzne do Verris o nowym leadzie. */
export function leadNotifyTemplate(input: {
  to: string;
  kind: 'MIGRATION' | 'CONTACT';
  email: string;
  name?: string | null;
  message?: string | null;
  source?: string | null;
  ip?: string | null;
  page?: string | null;
  panelUrl: string;
}): Szablon {
  const label = input.kind === 'MIGRATION' ? 'Lead migracyjny (LP)' : 'Zapytanie z formularza kontaktowego';
  const pola: [string, string | null | undefined][] = [
    ['E-mail', input.email],
    ['Imię', input.name],
    ['Źródło', input.source],
    ['Strona', input.page],
    ['IP', input.ip],
  ];
  const { html, text } = renderEmailShell({
    title: label,
    preheader: input.email,
    bodyMarkdown: [
      ...pola.filter(([, v]) => v).map(([k, v]) => `- **${k}:** ${md(v as string)}`),
      ...(input.message ? ['', '## Wiadomość', '', md(input.message.trim())] : []),
    ].join('\n'),
    footnote:
      input.kind === 'MIGRATION'
        ? 'Lead marketingowy — czeka na potwierdzenie double opt-in. Wejdzie do sekwencji dopiero po kliknięciu w mail potwierdzający.'
        : 'Odpowiedz bezpośrednio na tę wiadomość — Reply-To to e-mail nadawcy.',
    recipientEmail: input.to,
    panelUrl: input.panelUrl,
    recipientHasAccount: false,
  });
  return {
    to: input.to,
    tag: 'lead.notify',
    subject: `[Verris] ${label}: ${input.email}`,
    text,
    html,
    // Odpowiedź trafi wprost do klienta.
    replyTo: input.email,
  };
}

/** Potwierdzenie double opt-in (MIGRATION) — link aktywacyjny. */
export function leadOptInTemplate(input: { to: string; confirmUrl: string; panelUrl: string }): Szablon {
  const { html, text } = renderEmailShell({
    title: 'Potwierdź adres e-mail',
    preheader: 'Jedno kliknięcie i wyślemy Ci plan migracji strony w 3 krokach.',
    bodyMarkdown: [
      'Dzięki za zainteresowanie hostingiem Verris.',
      '',
      'Potwierdź adres e-mail jednym kliknięciem, a wyślemy Ci plan migracji strony w 3 krokach oraz kilka konkretnych wiadomości o hostingu. Bez potwierdzenia nie wyślemy nic więcej.',
    ].join('\n'),
    cta: { label: 'Potwierdzam adres', url: input.confirmUrl },
    footnote: 'Jeśli to nie Ty zostawiłeś ten adres — zignoruj tę wiadomość, nic się nie stanie.',
    recipientEmail: input.to,
    panelUrl: input.panelUrl,
    recipientHasAccount: false,
  });
  return { to: input.to, tag: 'lead.opt-in', subject: 'Potwierdź adres — plan migracji Verris', text, html };
}

/** Podziękowanie za zapytanie kontaktowe (CONTACT). */
export function leadContactAckTemplate(input: { to: string; name?: string | null; panelUrl: string }): Szablon {
  const { html, text } = renderEmailShell({
    title: 'Otrzymaliśmy Twoją wiadomość',
    preheader: 'Odezwiemy się zwykle tego samego dnia roboczego.',
    bodyMarkdown: [
      input.name ? `Cześć **${md(input.name)}**,` : 'Cześć,',
      '',
      'Dziękujemy za wiadomość — przyjęliśmy Twoje zapytanie i odezwiemy się na ten adres, zwykle tego samego dnia roboczego.',
      '',
      'Jeśli sprawa jest pilna, napisz bezpośrednio na [kontakt@verris.pl](mailto:kontakt@verris.pl).',
    ].join('\n'),
    recipientEmail: input.to,
    panelUrl: input.panelUrl,
    recipientHasAccount: false,
  });
  return { to: input.to, tag: 'lead.contact-ack', subject: 'Otrzymaliśmy Twoją wiadomość — Verris', text, html };
}
