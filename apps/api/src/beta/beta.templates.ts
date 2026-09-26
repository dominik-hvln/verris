import type { MailMessage } from '../mail/mailer.interface.js';
import { escapeMarkdown as md, renderEmailShell } from '../mail/templates/_layouts/email-shell.js';

/** PB-26 — zaproszenie do testów: kod, co sprawdzić, gdzie zgłaszać. */
export function zaproszenieDoTestowTemplate(input: {
  to: string;
  name?: string | null;
  code: string;
  credit: number;
  validTo: Date;
  panelUrl: string;
}): Omit<MailMessage, 'fromAddress'> {
  const dzien = input.validTo.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' });
  const { html, text } = renderEmailShell({
    title: 'Zaproszenie do testów Verris',
    preheader: `Twój kod: ${input.code} — ${input.credit} K na hosting, bez karty.`,
    bodyMarkdown: [
      input.name ? `Cześć **${md(input.name)}**,` : 'Cześć,',
      '',
      'zapraszamy Cię do testów hostingu Verris przed startem. Dostajesz kredyt na hosting — wystarczy mniej więcej na trzy miesiące — i prosimy tylko o jedno: korzystaj z panelu tak, jak z każdego hostingu, i pisz nam, co przeszkadza.',
      '',
      `**Twój kod: ${input.code}** — ${input.credit} K do portfela (1 K = 1 zł), jednorazowy, ważny do ${dzien}.`,
      '',
      '## Jak zacząć',
      '',
      '1. Załóż konto (przycisk poniżej) i potwierdź adres e-mail.',
      '2. W panelu wejdź w **Płatności** i wpisz kod w polu kodu promocyjnego.',
      '3. Zamów hosting i przenieś stronę kreatorem migracji albo zainstaluj WordPressa.',
      '',
      '## Co warto sprawdzić',
      '',
      '- podpięcie domeny i certyfikat SSL,',
      '- skrzynkę pocztową, także w telefonie,',
      '- kopię zapasową i odtworzenie pliku,',
      '- panel na telefonie.',
      '',
      'Uwagi i błędy zgłaszaj w panelu: **Centrum pomocy → Nowe zgłoszenie → temat „Testy (beta)”**. Każde zgłoszenie czytamy.',
      '',
      'Usługa zostaje po testach — nic nie wygasa i nic nie trzeba przenosić. Później odnawiasz ją z portfela albo kartą, jak każdy klient.',
    ].join('\n'),
    cta: { label: 'Załóż konto', url: `${input.panelUrl}/register` },
    footnote: 'Kod jest imienny i działa raz. Jeśli to zaproszenie trafiło do Ciebie przez pomyłkę — zignoruj je.',
    recipientEmail: input.to,
    panelUrl: input.panelUrl,
    recipientHasAccount: false,
  });
  return { to: input.to, tag: 'beta.invite', subject: 'Zaproszenie do testów Verris', text, html };
}
