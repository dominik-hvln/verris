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
  /** MIGRATION: czy zaznaczono dobrowolną zgodę na wiadomości (A2-01). */
  marketingConsent?: boolean;
}): Szablon {
  const label = input.kind === 'MIGRATION' ? 'Plan migracji (LP)' : 'Zapytanie z formularza kontaktowego';
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
        ? input.marketingConsent
          ? 'Plan migracji poszedł mailem. Osoba zaznaczyła zgodę na wiadomości o hostingu – obowiązuje dopiero po kliknięciu „Potwierdzam zgodę” w mailu.'
          : 'Plan migracji poszedł mailem. Bez zgody na wiadomości – nie wysyłamy nic więcej, odpowiadamy tylko na pytania.'
        : 'Odpowiedz bezpośrednio na tę wiadomość – Reply-To to e-mail nadawcy.',
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

const PORA: Record<string, string> = { rano: 'rano', poludnie: 'w południe', popoludnie: 'po 14:00' };

/** 1.11 — powiadomienie zespołu o prośbie o telefon (pas „Wolisz porozmawiać?”). Bez Reply-To: nadawca nie podaje adresu. */
export function leadCallbackNotifyTemplate(input: {
  to: string;
  name: string;
  phone: string;
  preferredTime: string;
  page?: string | null;
  ip?: string | null;
  panelUrl: string;
  /** Przebieg rozmowy z asystentem AI, gdy prośba przyszła z jego okna. */
  rozmowa?: Array<{ rola: 'USER' | 'ASSISTANT'; tresc: string }> | null;
}): Szablon {
  const pora = PORA[input.preferredTime] ?? input.preferredTime;
  const przebieg = input.rozmowa?.length
    ? [
        '',
        '## Rozmowa z asystentem AI',
        '',
        ...input.rozmowa.flatMap((w) => [`**${w.rola === 'USER' ? 'Klient' : 'Asystent'}:** ${md(w.tresc.replace(/\s+/g, ' ').trim())}`, '']),
      ]
    : [];
  const pola: [string, string | null | undefined][] = [
    ['Imię', input.name],
    ['Telefon', input.phone],
    ['Kiedy zadzwonić', pora],
    ['Strona', input.page],
    ['IP', input.ip],
  ];
  const { html, text } = renderEmailShell({
    title: 'Prośba o telefon',
    preheader: `${input.phone} · ${pora}`,
    bodyMarkdown: [...pola.filter(([, v]) => v).map(([k, v]) => `- **${k}:** ${md(v as string)}`), ...przebieg].join('\n'),
    footnote:
      'Obiecujemy oddzwonienie w dni robocze 9–17, zwykle tego samego dnia. Numer służy tylko do tej rozmowy – nie dopisuj go do żadnej listy.',
    recipientEmail: input.to,
    panelUrl: input.panelUrl,
    recipientHasAccount: false,
  });
  return {
    to: input.to,
    tag: 'lead.callback',
    subject: `[Verris] Prośba o telefon: ${input.phone} (${pora})`,
    text,
    html,
  };
}

/**
 * A2-01 (paczka 109) — plan migracji z verris.pl/przenies-strone. Mail transakcyjny: osoba poprosiła o plan, więc
 * dostaje go zawsze, bez warunku zgody marketingowej (art. 7 ust. 4 RODO). Zgoda na „kilka wiadomości o hostingu”
 * jest osobna i dobrowolna: gdy ją zaznaczono, mail ma przycisk potwierdzenia (double opt-in) i link wypisu.
 * Kroki zgodne z kreatorem przeprowadzki w panelu (apps/www/src/lib/migracja.ts, KROKI_PRZEPROWADZKI).
 */
export function leadPlanMigracjiTemplate(input: {
  to: string;
  panelUrl: string;
  /** Link do strony potwierdzenia zgody — tylko gdy zgodę zaznaczono. */
  potwierdzZgodeUrl?: string | null;
  /** Link do strony wypisu — tylko gdy zgodę zaznaczono. */
  wypisUrl?: string | null;
}): Szablon {
  const zgoda = Boolean(input.potwierdzZgodeUrl);
  const { html, text } = renderEmailShell({
    title: 'Plan przeniesienia strony do Verris',
    preheader: 'Trzy kroki: konto, przeprowadzka w panelu, przełączenie domeny.',
    bodyMarkdown: [
      'Cześć,',
      '',
      'oto plan przeniesienia strony do Verris, o który prosisz na verris.pl.',
      '',
      '## 1. Załóż konto i zamów hosting',
      '',
      `Rejestracja zajmuje chwilę: [${input.panelUrl.replace(/^https?:\/\//, '')}](${input.panelUrl}). Przy zamówieniu wybierz domenę strony, którą przenosisz. Domena może zostać u obecnego rejestratora.`,
      '',
      '## 2. Uruchom przeprowadzkę w panelu',
      '',
      'Kreator prowadzi krok po kroku: podajesz dostęp do starego hostingu (login do panelu albo dane FTP), zaznaczasz strony, bazy i skrzynki, a postęp kopiowania widzisz na żywo. Po zakończeniu porównujemy liczbę plików i wierszy w bazie ze źródłem i wysyłamy raport mailem. Stara strona działa przez cały czas.',
      '',
      '## 3. Przełącz domenę, kiedy jesteś gotowy',
      '',
      'Przed zmianą DNS możesz dosłać zmiany, które powstały w trakcie przeprowadzki. Przy sklepie ostatnia synchronizacja bazy wymaga krótkiej przerwy w zapisie, kilku minut o wybranej przez Ciebie porze. Plan przełączenia w panelu sprawdza rekordy DNS na bieżąco.',
      '',
      'Szczegóły i poradniki dla popularnych hostingów: [verris.pl/przenies-strone](https://verris.pl/przenies-strone). Pytania? Odpisz na tę wiadomość albo napisz na [kontakt@verris.pl](mailto:kontakt@verris.pl).',
      ...(zgoda
        ? [
            '',
            '## Wiadomości o hostingu',
            '',
            `Zaznaczasz zgodę na kilka wiadomości o hostingu Verris. Zaczniemy je wysyłać dopiero po potwierdzeniu przyciskiem poniżej. Bez potwierdzenia ten plan jest ostatnią wiadomością od nas. Rezygnacja w każdej chwili: [wypisz mnie](${input.wypisUrl}).`,
          ]
        : []),
    ].join('\n'),
    ...(zgoda ? { cta: { label: 'Potwierdzam zgodę na wiadomości', url: input.potwierdzZgodeUrl as string } } : {}),
    footnote: 'Jeśli to nie Ty – zignoruj tę wiadomość. Bez potwierdzenia nie wyślemy nic więcej.',
    recipientEmail: input.to,
    panelUrl: input.panelUrl,
    recipientHasAccount: false,
  });
  return { to: input.to, tag: 'lead.plan-migracji', subject: 'Plan przeniesienia strony – Verris', text, html };
}

/** Podziękowanie za zapytanie kontaktowe (CONTACT). */
// Audyt bezpieczeństwa 13.10: bez pola „imię” z formularza — anonim wpisywał tam dowolny tekst, który szedł
// z naszej domeny na dowolny adres (spam/phishing z podpisem Verris).
export function leadContactAckTemplate(input: { to: string; panelUrl: string }): Szablon {
  const { html, text } = renderEmailShell({
    title: 'Otrzymaliśmy Twoją wiadomość',
    preheader: 'Odezwiemy się zwykle tego samego dnia roboczego.',
    bodyMarkdown: [
      'Cześć,',
      '',
      'Dziękujemy za wiadomość – przyjęliśmy Twoje zapytanie i odezwiemy się na ten adres, zwykle tego samego dnia roboczego.',
      '',
      'Jeśli sprawa jest pilna, napisz bezpośrednio na [kontakt@verris.pl](mailto:kontakt@verris.pl).',
    ].join('\n'),
    recipientEmail: input.to,
    panelUrl: input.panelUrl,
    recipientHasAccount: false,
  });
  return { to: input.to, tag: 'lead.contact-ack', subject: 'Otrzymaliśmy Twoją wiadomość – Verris', text, html };
}
