import type { MailMessage } from '../mail/mailer.interface';

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
}): Omit<MailMessage, 'fromAddress'> {
  const label = input.kind === 'MIGRATION' ? 'Lead migracyjny (LP)' : 'Zapytanie z formularza kontaktowego';
  const lines = [
    `Nowy ${label.toLowerCase()}.`,
    '',
    `E-mail: ${input.email}`,
    input.name ? `Imię: ${input.name}` : '',
    input.source ? `Źródło: ${input.source}` : '',
    input.page ? `Strona: ${input.page}` : '',
    input.ip ? `IP: ${input.ip}` : '',
    input.message ? `\nWiadomość:\n${input.message}` : '',
    '',
    input.kind === 'MIGRATION'
      ? 'Lead marketingowy — czeka na potwierdzenie double opt-in. Wejdzie do sekwencji dopiero po kliknięciu w mail potwierdzający.'
      : 'Odpowiedz bezpośrednio na adres nadawcy (Reply-To ustawiony na e-mail klienta).',
  ].filter(Boolean);
  return {
    to: input.to,
    subject: `[Verris] ${label}: ${input.email}`,
    text: lines.join('\n'),
    // Odpowiedź trafi wprost do klienta.
    replyTo: input.email,
  };
}

/** Potwierdzenie double opt-in (MIGRATION) — link aktywacyjny. */
export function leadOptInTemplate(input: {
  to: string;
  confirmUrl: string;
}): Omit<MailMessage, 'fromAddress'> {
  const text = [
    'Dzięki za zainteresowanie hostingiem Verris.',
    '',
    'Potwierdź adres e-mail jednym kliknięciem, a wyślemy Ci plan migracji strony w 3 krokach',
    'oraz kilka konkretnych wiadomości o hostingu. Bez potwierdzenia nie wyślemy nic więcej.',
    '',
    `Potwierdzam: ${input.confirmUrl}`,
    '',
    'Jeśli to nie Ty zostawiłeś ten adres — zignoruj tę wiadomość, nic się nie stanie.',
    '',
    'Zespół Verris',
  ].join('\n');
  return {
    to: input.to,
    subject: 'Potwierdź adres — plan migracji Verris',
    text,
  };
}

/** Podziękowanie za zapytanie kontaktowe (CONTACT). */
export function leadContactAckTemplate(input: {
  to: string;
  name?: string | null;
}): Omit<MailMessage, 'fromAddress'> {
  const hi = input.name ? `Cześć ${input.name},` : 'Cześć,';
  const text = [
    hi,
    '',
    'Dziękujemy za wiadomość — przyjęliśmy Twoje zapytanie i odezwiemy się na ten adres,',
    'zwykle tego samego dnia roboczego.',
    '',
    'Jeśli sprawa jest pilna, napisz bezpośrednio na kontakt@verris.pl.',
    '',
    'Zespół Verris',
  ].join('\n');
  return {
    to: input.to,
    subject: 'Otrzymaliśmy Twoją wiadomość — Verris',
    text,
  };
}
