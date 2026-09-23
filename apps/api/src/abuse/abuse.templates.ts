import type { MailMessage } from '../mail/mailer.interface';

type Szablon = Omit<MailMessage, 'fromAddress'>;
const STOPKA = '\n\n—\nVerris · zgłoszenia nadużyć: https://verris.pl/zglos-naduzycie';

export const ETYKIETY_KATEGORII: Record<string, string> = {
  SPAM: 'spam', PHISHING: 'phishing / podszywanie się', MALWARE: 'złośliwe oprogramowanie',
  ILLEGAL_CONTENT: 'treść nielegalna', COPYRIGHT: 'naruszenie praw autorskich',
  PERSONAL_DATA: 'dane osobowe', OTHER: 'inne',
};

/** Potwierdzenie przyjęcia (DSA art. 16 ust. 4 — bez zbędnej zwłoki). */
export function potwierdzenieZgloszenia(i: { to: string; id: string; url: string; kategoria: string }): Szablon {
  return {
    to: i.to,
    subject: `Przyjęliśmy zgłoszenie nadużycia (${i.id.slice(0, 8)})`,
    text: [
      'Dziękujemy — Twoje zgłoszenie trafiło do zespołu Verris.',
      '',
      `Numer: ${i.id}`,
      `Adres: ${i.url}`,
      `Kategoria: ${ETYKIETY_KATEGORII[i.kategoria] ?? i.kategoria}`,
      '',
      'Sprawdzimy je i poinformujemy Cię o decyzji na ten adres. Decyzję podejmuje człowiek,',
      'nie automat. Jeśli masz dodatkowe dowody, odpowiedz na tę wiadomość.',
    ].join('\n') + STOPKA,
  };
}

/** Wewnętrzne powiadomienie dla obsługi. */
export function noweZgloszenieDlaObslugi(i: { to: string; id: string; url: string; kategoria: string; dopasowanie: string }): Szablon {
  return {
    to: i.to,
    subject: `[Verris] Nowe zgłoszenie nadużycia: ${ETYKIETY_KATEGORII[i.kategoria] ?? i.kategoria} — ${i.url}`,
    text: [`Numer: ${i.id}`, `Adres: ${i.url}`, `Dopasowanie: ${i.dopasowanie}`, '', 'Panel obsługi → Nadużycia.'].join('\n'),
  };
}

/** Decyzja dla zgłaszającego. */
export function decyzjaDlaZglaszajacego(i: { to: string; id: string; url: string; przyjete: boolean; uzasadnienie: string }): Szablon {
  return {
    to: i.to,
    subject: `Decyzja w sprawie zgłoszenia ${i.id.slice(0, 8)}`,
    text: [
      i.przyjete
        ? `Po sprawdzeniu zgłoszenia dotyczącego ${i.url} podjęliśmy działania.`
        : `Po sprawdzeniu zgłoszenia dotyczącego ${i.url} nie znaleźliśmy podstaw do działania.`,
      '',
      'Uzasadnienie:',
      i.uzasadnienie,
    ].join('\n') + STOPKA,
  };
}

/** Uzasadnienie dla klienta, gdy ograniczamy usługę (DSA art. 17). */
export function uzasadnienieDlaKlienta(i: { to: string; url: string; kategoria: string; uzasadnienie: string }): Szablon {
  return {
    to: i.to,
    subject: 'Ograniczyliśmy dostęp do treści na Twojej usłudze — uzasadnienie',
    text: [
      `Otrzymaliśmy zgłoszenie dotyczące ${i.url} (${ETYKIETY_KATEGORII[i.kategoria] ?? i.kategoria}) i po sprawdzeniu podjęliśmy działania.`,
      '',
      'Uzasadnienie:',
      i.uzasadnienie,
      '',
      'Jeśli uważasz, że to pomyłka, odpowiedz na tę wiadomość albo załóż zgłoszenie w panelu —',
      'rozpatrzymy odwołanie. Decyzję podjął człowiek, nie automat.',
    ].join('\n') + STOPKA,
  };
}
