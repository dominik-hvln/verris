import type { MailMessage } from '../mail/mailer.interface.js';
import { renderEmailShell } from '../mail/templates/_layouts/email-shell.js';

/**
 * A1-07 (paczka 109) — rejestracja albo zmiana adresu na e-mail, który ma już konto. API odpowiada tak samo jak przy
 * sukcesie (bez zdradzania, że konto istnieje), a właściciel skrzynki dostaje ten mail: zaloguj się albo zresetuj hasło.
 */
export function kontoJuzIstniejeTemplate(input: { to: string; panelUrl: string; powod: 'REJESTRACJA' | 'ZMIANA_ADRESU' }): Omit<MailMessage, 'fromAddress'> {
  const rejestracja = input.powod === 'REJESTRACJA';
  const { html, text } = renderEmailShell({
    title: 'Ten adres ma już konto w Verris',
    preheader: rejestracja ? 'Ktoś próbował założyć konto na Twój adres.' : 'Ktoś próbował przypisać Twój adres do innego konta.',
    bodyMarkdown: [
      'Cześć,',
      '',
      rejestracja
        ? 'ktoś (być może Ty) próbował założyć konto w Verris na ten adres e-mail. Konto na ten adres już istnieje, więc nowego nie założyliśmy.'
        : 'ktoś (być może Ty) próbował zmienić adres e-mail innego konta w Verris na ten adres. Ten adres ma już swoje konto, więc zmiany nie wprowadziliśmy.',
      '',
      `Jeśli to Ty — zaloguj się (${input.panelUrl}/login). Nie pamiętasz hasła? Ustaw nowe: ${input.panelUrl}/forgot-password.`,
    ].join('\n'),
    cta: { label: 'Zaloguj się', url: `${input.panelUrl}/login` },
    footnote: 'Jeśli to nie Ty — nic nie musisz robić, Twoje konto jest bezpieczne. Pytania: kontakt@verris.pl.',
    recipientEmail: input.to,
    panelUrl: input.panelUrl,
    recipientHasAccount: true,
  });
  return { to: input.to, tag: 'auth.konto-istnieje', subject: 'Ten adres ma już konto w Verris', text, html };
}
