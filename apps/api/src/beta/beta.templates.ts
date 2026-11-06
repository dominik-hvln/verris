import type { MailMessage } from '../mail/mailer.interface.js';
import { escapeMarkdown as md, renderEmailShell } from '../mail/templates/_layouts/email-shell.js';

/** P4-12 — zgłoszenie z /beta tylko z zakresem „Poczta”: zaproszenie prowadzi do zamówienia samej poczty. */
export function tylkoPocztaWZakresie(zakres: readonly string[] | null | undefined): boolean {
  return Array.isArray(zakres) && zakres.length > 0 && zakres.every((z) => z === 'POCZTA');
}

/** Trasa panelu klienta, która po sprawdzeniu sesji oddaje przewodnik testera (apps/client-panel/src/app/dashboard/beta/przewodnik/route.ts). */
export const SCIEZKA_PRZEWODNIKA_TESTERA = '/dashboard/beta/przewodnik';

/**
 * PB-26 — zaproszenie do testów: kod, co sprawdzić, gdzie zgłaszać. P1-13: link „Załóż konto” zaraz pod kodem
 * (przycisk powtórzony na dole), adresy schowane pod nazwami, nadawca „Zespół Verris”. P4-12: wariant „tylko poczta”.
 */
export function zaproszenieDoTestowTemplate(input: {
  to: string;
  name?: string | null;
  code: string;
  credit: number;
  validTo: Date;
  panelUrl: string;
  /** Zgłoszenie z zakresem wyłącznie „Poczta” — bez hostingu, migracji strony i WordPressa. */
  tylkoPoczta?: boolean;
}): Omit<MailMessage, 'fromAddress'> {
  const dzien = input.validTo.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' });
  const poczta = input.tylkoPoczta === true;
  const rejestracja = `${input.panelUrl}/register`;
  const { html, text } = renderEmailShell({
    title: 'Zaproszenie do testów Verris',
    preheader: `Twój kod: ${input.code} – ${input.credit} K ${poczta ? 'na firmową pocztę' : 'na hosting'}, bez karty.`,
    bodyMarkdown: [
      input.name ? `Cześć **${md(input.name)}**,` : 'Cześć,',
      '',
      poczta
        ? 'zapraszamy Cię do testów poczty Verris przed startem. Dostajesz kredyt na firmową pocztę w Twojej domenie – hostingu nie musisz kupować. Prosimy tylko o jedno: korzystaj z poczty i panelu jak zwykle i pisz nam, co przeszkadza.'
        : 'zapraszamy Cię do testów hostingu Verris przed startem. Dostajesz kredyt na hosting – wystarczy mniej więcej na trzy miesiące – i prosimy tylko o jedno: korzystaj z panelu tak, jak z każdego hostingu, i pisz nam, co przeszkadza.',
      '',
      `**Twój kod: ${input.code}** – ${input.credit} K do portfela (1 K = 1 zł), jednorazowy, ważny do ${dzien}.`,
      '',
      `**[Załóż konto](${rejestracja})** – to pierwszy krok.`,
      '',
      '## Jak zacząć',
      '',
      `1. [Załóż konto](${rejestracja}) i potwierdź adres e-mail.`,
      '2. W panelu wejdź w **Płatności** i wpisz kod w polu kodu promocyjnego.',
      poczta
        ? '3. Wejdź w **Nowa usługa → Poczta e-mail** i zamów pocztę z portfela. Domena może zostać tam, gdzie jest teraz – panel pokaże, co w niej ustawić.'
        : '3. Zamów hosting i przenieś stronę kreatorem migracji albo zainstaluj WordPressa.',
      '',
      'Kredyty z kodu to nie zakup, więc nie ma za nie faktury.',
      '',
      '## Co sprawdzić',
      '',
      `Pełna lista scenariuszy jest w panelu: **[Testy (beta)](${input.panelUrl}/dashboard/beta)**. Odhaczasz tam kroki i dopisujesz uwagi – zapisują się na Twoim koncie, więc możesz przerwać i wrócić w dowolnej chwili.${poczta ? ' Scenariusze dotyczące poczty są oznaczone – resztę możesz pominąć.' : ''} Najważniejsze:`,
      '',
      ...(poczta
        ? [
            '- zamówienie poczty i ustawienia domeny,',
            '- skrzynkę pocztową: wysyłkę, odbiór i telefon,',
            '- przeniesienie starej poczty,',
            '- płatności i dostęp dla współpracownika,',
            '- panel na telefonie.',
          ]
        : [
            '- przeniesienie strony albo nowy WordPress,',
            '- podpięcie domeny i certyfikat SSL,',
            '- skrzynkę pocztową, także w telefonie,',
            '- kopię zapasową i odtworzenie pliku,',
            '- asystenta AI i prognozę zużycia w panelu,',
            '- panel na telefonie.',
          ]),
      '',
      // Decyzja 06.11 — przewodnik PDF tylko po zalogowaniu (trasa panelu sprawdza sesję), bez ręcznego wysyłania.
      `Przewodnik do wydruku albo wypełnienia w PDF pobierzesz po zalogowaniu na stronie Testy (beta): **[Pobierz przewodnik (PDF)](${input.panelUrl}${SCIEZKA_PRZEWODNIKA_TESTERA})**.`,
      '',
      '## Jak zgłaszać uwagi',
      '',
      'Po wpisaniu kodu w prawym dolnym rogu panelu pojawi się przycisk **„Zgłoś uwagę”**. Opisz, co się stało, i – jeśli chodzi o konkretne miejsce – kliknij **„Wskaż miejsce na stronie”**, a potem ten element. Do zgłoszenia dołączymy adres strony i zrzut ekranu z zaznaczeniem (przed wysłaniem zobaczysz podgląd i możesz go odznaczyć). Przycisk da się schować do zakładki przy prawej krawędzi.',
      '',
      'Dłuższe sprawy możesz opisać też w **Centrum pomocy → Nowe zgłoszenie → temat „Testy (beta)”**. Każde zgłoszenie czytamy.',
      '',
      'Usługa zostaje po testach – nic nie wygasa i nic nie trzeba przenosić. Później odnawiasz ją z portfela albo kartą, jak każdy klient. Gdyby coś miało się zmienić, napiszemy z wyprzedzeniem.',
    ].join('\n'),
    cta: { label: 'Załóż konto', url: rejestracja },
    footnote: 'Kod jest imienny i działa raz. Jeśli to zaproszenie trafiło do Ciebie przez pomyłkę – zignoruj je.',
    recipientEmail: input.to,
    panelUrl: input.panelUrl,
    recipientHasAccount: false,
  });
  // P1-13 — nadawca po polsku (rola SUPPORT dałaby „Verris Support”); fromName ma pierwszeństwo przed nazwą roli.
  return { to: input.to, tag: 'beta.invite', subject: 'Zaproszenie do testów Verris', fromName: 'Zespół Verris', text, html };
}

type Szablon = Omit<MailMessage, 'fromAddress'>;

/** Termin otwartej bety (BETA_TESTY.md, PB-26) — ten sam co BETA_TERMIN w apps/www/src/lib/beta.ts. */
export const TERMIN_OTWARTEJ_BETY = '7 grudnia 2026';

/** Etykiety zakresów z formularza verris.pl/beta (mail zespołu, panel admina). */
export const ETYKIETY_ZAKRESU_BETA: Record<string, string> = {
  WORDPRESS: 'WordPress',
  SKLEP: 'Sklep',
  STRONY_DLA_KLIENTOW: 'Strony dla klientów',
  POCZTA: 'Poczta',
  INNE: 'Inne',
};

/** Otwarta beta — double opt-in zgłoszenia z verris.pl/beta. Bez kodu: zaproszenie przychodzi osobno, po decyzji. */
export function potwierdzenieZgloszeniaBetaTemplate(input: {
  to: string;
  imie: string;
  confirmUrl: string;
  panelUrl: string;
}): Szablon {
  const { html, text } = renderEmailShell({
    title: 'Potwierdź zgłoszenie do testów Verris',
    preheader: 'Jedno kliknięcie i Twoje zgłoszenie trafi na listę.',
    bodyMarkdown: [
      // A1-04 — bez imienia: przed potwierdzeniem adresu pole z formularza wpisuje ktokolwiek, a mail idzie z adresu Verris.
      'Cześć,',
      '',
      'dziękujemy za zgłoszenie do testów hostingu Verris. Potwierdź jeszcze, że to Twój adres – bez tego nie zobaczymy zgłoszenia.',
      '',
      `Testy ruszają ${TERMIN_OTWARTEJ_BETY}. Testerów zapraszamy małymi grupami – gdy przyjdzie Twoja kolej, wyślemy na ten adres zaproszenie z imiennym kodem.`,
    ].join('\n'),
    cta: { label: 'Potwierdzam zgłoszenie', url: input.confirmUrl },
    footnote: 'Jeśli to nie Ty wypełniłeś formularz na verris.pl – zignoruj tę wiadomość. Niepotwierdzone zgłoszenie usuniemy po 7 dniach.',
    recipientEmail: input.to,
    panelUrl: input.panelUrl,
    recipientHasAccount: false,
  });
  return { to: input.to, tag: 'beta.zgloszenie.potwierdz', subject: 'Potwierdź zgłoszenie do testów Verris', text, html };
}

/** Otwarta beta — powiadomienie zespołu o potwierdzonym zgłoszeniu (decyzja w panelu admina → Testy (beta)). */
export function zgloszenieBetaNotifyTemplate(input: {
  to: string;
  imie: string;
  email: string;
  zakres: string[];
  strona?: string | null;
  obecnyHosting?: string | null;
  uwagi?: string | null;
  zrodlo?: string | null;
  panelUrl: string;
}): Szablon {
  const pola: [string, string | null | undefined][] = [
    ['Imię', input.imie],
    ['E-mail', input.email],
    ['Chce sprawdzić', input.zakres.map((z) => ETYKIETY_ZAKRESU_BETA[z] ?? z).join(', ')],
    ['Strona', input.strona],
    ['Obecny hosting', input.obecnyHosting],
    ['Źródło', input.zrodlo],
  ];
  const { html, text } = renderEmailShell({
    title: 'Nowe zgłoszenie do testów',
    preheader: input.email,
    bodyMarkdown: [
      ...pola.filter(([, v]) => v).map(([k, v]) => `- **${k}:** ${md(v as string)}`),
      ...(input.uwagi ? ['', '## Uwagi', '', md(input.uwagi.trim())] : []),
    ].join('\n'),
    footnote: 'Adres potwierdzony. Zaproszenie z kodem wysyłasz w panelu admina → Testy (beta) → Zgłoszenia.',
    recipientEmail: input.to,
    panelUrl: input.panelUrl,
    recipientHasAccount: false,
  });
  return { to: input.to, tag: 'beta.zgloszenie.notify', subject: `[Verris] Zgłoszenie do testów: ${input.email}`, text, html };
}

/** Otwarta beta — uprzejma odpowiedź, gdy tym razem nie zapraszamy. Bez obietnic rabatów i terminów. */
export function odmowaZgloszeniaBetaTemplate(input: { to: string; imie: string; panelUrl: string }): Szablon {
  const { html, text } = renderEmailShell({
    title: 'Dziękujemy za zgłoszenie do testów',
    preheader: 'Tym razem miejsca w testach się skończyły.',
    bodyMarkdown: [
      `Cześć **${md(input.imie)}**,`,
      '',
      'dziękujemy za chęć pomocy w testach hostingu Verris. Tym razem miejsca się skończyły i nie wyślemy zaproszenia z kodem.',
      '',
      // Zgoda z formularza obejmuje tylko wiadomości o testach — bez zapowiedzi startu czy ofert (PKE).
      'Jeśli w trakcie testów zwolni się miejsce, napiszemy. Twoje zgłoszenie usuniemy najpóźniej po 90 dniach od wysłania.',
    ].join('\n'),
    recipientEmail: input.to,
    panelUrl: input.panelUrl,
    recipientHasAccount: false,
  });
  return { to: input.to, tag: 'beta.zgloszenie.odmowa', subject: 'Testy Verris – dziękujemy za zgłoszenie', text, html };
}

/** A1-01 — ponowne zgłoszenie z już potwierdzonego adresu: nowe dane czekają na potwierdzenie linkiem (bez imienia, jak A1-04). */
export function zmianaZgloszeniaBetaTemplate(input: { to: string; confirmUrl: string; panelUrl: string }): Szablon {
  const { html, text } = renderEmailShell({
    title: 'Potwierdź zmianę zgłoszenia do testów',
    preheader: 'Twoje zgłoszenie jest już na liście – potwierdź, jeśli chcesz zmienić jego dane.',
    bodyMarkdown: [
      'Cześć,',
      '',
      'Twoje zgłoszenie do testów hostingu Verris jest już potwierdzone i czeka na liście. Właśnie ktoś wysłał formularz na verris.pl/beta jeszcze raz z tym adresem.',
      '',
      'Jeśli to Ty i chcesz zmienić dane zgłoszenia (zakres, adres strony, uwagi), potwierdź zmianę przyciskiem poniżej. Bez potwierdzenia zostaje to, co zgłosiłeś wcześniej.',
    ].join('\n'),
    cta: { label: 'Potwierdzam zmianę', url: input.confirmUrl },
    footnote: 'Jeśli to nie Ty – zignoruj tę wiadomość. Twoje zgłoszenie się nie zmieni.',
    recipientEmail: input.to,
    panelUrl: input.panelUrl,
    recipientHasAccount: false,
  });
  return { to: input.to, tag: 'beta.zgloszenie.zmiana', subject: 'Potwierdź zmianę zgłoszenia do testów Verris', text, html };
}

/**
 * P2-11 — ponowne zgłoszenie z adresu, który ma już zaproszenie: mail mówi, w jakim stanie jest sprawa (formularz
 * odpowiada każdemu tak samo, więc stan widzi tylko właściciel skrzynki). Ważny kod wysyłamy ponownie zwykłym zaproszeniem.
 */
export function stanZaproszeniaBetaTemplate(input: { to: string; stan: 'TESTER' | 'NIEAKTYWNE'; panelUrl: string; kontakt: string }): Szablon {
  const tester = input.stan === 'TESTER';
  const { html, text } = renderEmailShell({
    title: tester ? 'Jesteś już w testach Verris' : 'Twoje zaproszenie do testów straciło ważność',
    preheader: tester ? 'Kod z zaproszenia jest już na Twoim koncie.' : 'Napisz do nas, jeśli dalej chcesz testować.',
    bodyMarkdown: (tester
      ? [
          'Cześć,',
          '',
          'ktoś wysłał formularz na verris.pl/beta z tym adresem, ale Ty już testujesz: kod z zaproszenia jest zrealizowany na Twoim koncie.',
          '',
          `Zaloguj się do panelu i otwórz **Testy (beta)** (${input.panelUrl}/dashboard/beta) – tam są scenariusze i przycisk „Zgłoś uwagę”.`,
        ]
      : [
          'Cześć,',
          '',
          'ktoś wysłał formularz na verris.pl/beta z tym adresem. Zaproszenie z kodem, które wysłaliśmy wcześniej, wygasło albo zostało wycofane, więc formularz nie doda nowego zgłoszenia.',
          '',
          `Jeśli dalej chcesz testować, napisz na ${input.kontakt} – odpowiemy z nowym terminem.`,
        ]
    ).join('\n'),
    ...(tester ? { cta: { label: 'Przejdź do panelu', url: `${input.panelUrl}/dashboard/beta` } } : {}),
    footnote: 'Jeśli to nie Ty wypełniłeś formularz – zignoruj tę wiadomość.',
    recipientEmail: input.to,
    panelUrl: input.panelUrl,
    recipientHasAccount: tester,
  });
  return { to: input.to, tag: 'beta.zgloszenie.stan', subject: tester ? 'Jesteś już w testach Verris' : 'Testy Verris – zaproszenie straciło ważność', text, html };
}
