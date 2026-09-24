import type { MailMessage } from '../mail/mailer.interface';
import { escapeMarkdown as md, renderEmailShell } from '../mail/templates/_layouts/email-shell';

type Szablon = Omit<MailMessage, 'fromAddress'>;
const STOPKA = 'Kolejne zgłoszenia: https://verris.pl/zglos-naduzycie';

export const ETYKIETY_KATEGORII: Record<string, string> = {
  SPAM: 'spam', PHISHING: 'phishing / podszywanie się', MALWARE: 'złośliwe oprogramowanie',
  ILLEGAL_CONTENT: 'treść nielegalna', COPYRIGHT: 'naruszenie praw autorskich',
  PERSONAL_DATA: 'dane osobowe', OTHER: 'inne',
};

const kategoria = (k: string) => ETYKIETY_KATEGORII[k] ?? k;
/** Uzasadnienie pisze obsługa, ale może cytować zgłoszenie — wstawiamy je jako zwykły tekst. */
const akapity = (t: string) => md(t.trim()).replace(/\n{3,}/g, '\n\n');

/** Potwierdzenie przyjęcia (DSA art. 16 ust. 4 — bez zbędnej zwłoki). Zgłaszający nie ma konta w panelu. */
export function potwierdzenieZgloszenia(i: { to: string; id: string; url: string; kategoria: string; panelUrl: string }): Szablon {
  const { html, text } = renderEmailShell({
    title: 'Przyjęliśmy Twoje zgłoszenie',
    preheader: `Zgłoszenie ${i.id.slice(0, 8)} trafiło do zespołu Verris.`,
    bodyMarkdown: [
      'Dziękujemy — Twoje zgłoszenie trafiło do zespołu Verris.',
      '',
      `- **Numer:** ${md(i.id)}`,
      `- **Adres:** ${md(i.url)}`,
      `- **Kategoria:** ${md(kategoria(i.kategoria))}`,
      '',
      'Sprawdzimy je i poinformujemy Cię o decyzji na ten adres. Decyzję podejmuje człowiek, nie automat. Jeśli masz dodatkowe dowody, odpowiedz na tę wiadomość.',
    ].join('\n'),
    footnote: STOPKA,
    recipientEmail: i.to,
    panelUrl: i.panelUrl,
    recipientHasAccount: false,
  });
  return { to: i.to, tag: 'abuse.received', subject: `Przyjęliśmy zgłoszenie nadużycia (${i.id.slice(0, 8)})`, text, html };
}

/** Wewnętrzne powiadomienie dla obsługi. */
export function noweZgloszenieDlaObslugi(i: { to: string; id: string; url: string; kategoria: string; dopasowanie: string; panelUrl: string; staffPanelUrl: string }): Szablon {
  const { html, text } = renderEmailShell({
    title: 'Nowe zgłoszenie nadużycia',
    preheader: `${kategoria(i.kategoria)} — ${i.url}`,
    bodyMarkdown: [
      `- **Numer:** ${md(i.id)}`,
      `- **Adres:** ${md(i.url)}`,
      `- **Kategoria:** ${md(kategoria(i.kategoria))}`,
      `- **Dopasowanie:** ${md(i.dopasowanie)}`,
    ].join('\n'),
    cta: { label: 'Otwórz kolejkę nadużyć', url: `${i.staffPanelUrl}/abuse` },
    recipientEmail: i.to,
    panelUrl: i.panelUrl,
    recipientHasAccount: false,
  });
  return { to: i.to, tag: 'abuse.staff-new', subject: `[Verris] Nowe zgłoszenie nadużycia: ${kategoria(i.kategoria)} — ${i.url}`, text, html };
}

/** Decyzja dla zgłaszającego. */
export function decyzjaDlaZglaszajacego(i: { to: string; id: string; url: string; przyjete: boolean; uzasadnienie: string; panelUrl: string }): Szablon {
  const { html, text } = renderEmailShell({
    title: i.przyjete ? 'Podjęliśmy działania' : 'Nie znaleźliśmy podstaw do działania',
    preheader: `Decyzja w sprawie zgłoszenia ${i.id.slice(0, 8)}.`,
    bodyMarkdown: [
      i.przyjete
        ? `Po sprawdzeniu zgłoszenia dotyczącego ${md(i.url)} podjęliśmy działania.`
        : `Po sprawdzeniu zgłoszenia dotyczącego ${md(i.url)} nie znaleźliśmy podstaw do działania.`,
      '',
      '## Uzasadnienie',
      '',
      akapity(i.uzasadnienie),
    ].join('\n'),
    footnote: STOPKA,
    recipientEmail: i.to,
    panelUrl: i.panelUrl,
    recipientHasAccount: false,
  });
  return { to: i.to, tag: 'abuse.decision', subject: `Decyzja w sprawie zgłoszenia ${i.id.slice(0, 8)}`, text, html };
}

/** Uzasadnienie dla klienta, gdy ograniczamy usługę (DSA art. 17). */
export function uzasadnienieDlaKlienta(i: { to: string; url: string; kategoria: string; uzasadnienie: string; panelUrl: string }): Szablon {
  const { html, text } = renderEmailShell({
    title: 'Ograniczyliśmy dostęp do treści na Twojej usłudze',
    preheader: 'Uzasadnienie decyzji i jak się odwołać.',
    bodyMarkdown: [
      `Otrzymaliśmy zgłoszenie dotyczące ${md(i.url)} (${md(kategoria(i.kategoria))}) i po sprawdzeniu podjęliśmy działania.`,
      '',
      '## Uzasadnienie',
      '',
      akapity(i.uzasadnienie),
      '',
      '## Odwołanie',
      '',
      'Jeśli uważasz, że to pomyłka, odpowiedz na tę wiadomość albo załóż zgłoszenie w panelu — rozpatrzymy odwołanie. Decyzję podjął człowiek, nie automat.',
    ].join('\n'),
    cta: { label: 'Załóż zgłoszenie', url: `${i.panelUrl}/dashboard/support` },
    recipientEmail: i.to,
    panelUrl: i.panelUrl,
  });
  return { to: i.to, tag: 'abuse.customer-restriction', subject: 'Ograniczyliśmy dostęp do treści na Twojej usłudze — uzasadnienie', text, html };
}
