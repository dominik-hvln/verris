import type { MailMessage } from '../mailer.interface.js';
import { renderEmailShell, escapeMarkdown } from './_layouts/email-shell.js';
import { kwotaPl } from './_layouts/odmiana.js';

/**
 * MAIL-W2 — potwierdzenie zamówienia („dziękujemy za zamówienie"), wysyłane
 * tuż po złożeniu zamówienia (przed/obok provisioningu). Odrębne od maila
 * „konto gotowe" (hosting.account-provisioned) i od faktury — to potwierdzenie
 * samej transakcji, którego wcześniej brakowało.
 */
export interface OrderReceivedContext {
  to: string;
  firstName: string | null;
  planName: string;
  serviceTag: string;
  /** Sformatowana kwota, np. „29,00 zł". */
  amountLabel: string;
  /** 'MONTH' | 'YEAR' — do etykiety okresu. */
  interval: 'MONTH' | 'YEAR';
  /** Domena/usługa (opcjonalnie — brak dla produktów aplikacyjnych). */
  domain?: string | null;
  /** Sposób płatności do krótkiej informacji. */
  paymentLabel: string;
  panelUrl: string;
}

/** Kwota z wywołującego („45.00 PLN”) w formacie panelu („45,00 zł brutto”); inne waluty bez zmian. */
function kwotaZamowienia(label: string): string {
  const m = /^(-?\d+(?:\.\d+)?) PLN$/.exec(label.trim());
  return m ? `${kwotaPl(m[1])} zł brutto` : label;
}

/**
 * A2-08 (beta 3.11) — mail jest potwierdzeniem zawarcia umowy na trwałym nośniku (art. 21 ust. 1 upk), więc oprócz
 * linku do Regulaminu niesie same informacje: sprzedawca (decyzja 10 — bez telefonu), cena i okres, automatyczne
 * odnowienie i jak je wyłączyć, faktury (ta sama zasada co w panelu — `billing/zasady-dokumentow.ts`), reklamacje
 * i odstąpienie. Regulaminu w załączniku PDF nie dołączamy: mailer nie obsługuje dziś załączników (zob.
 * docs/legal/drafts/ZMIANY_1.0.0-1.1.0.md, „DO SPRAWDZENIA”).
 */
export function orderReceivedTemplate(ctx: OrderReceivedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const period = ctx.interval === 'YEAR' ? 'za rok' : 'za miesiąc';
  const coOkres = ctx.interval === 'YEAR' ? 'co rok' : 'co miesiąc';
  const lines = [
    greeting,
    ``,
    `Dziękujemy za zamówienie w Verris! Przyjęliśmy je do realizacji.`,
    ``,
    `## Podsumowanie`,
    ``,
    `- **Usługa:** ${escapeMarkdown(ctx.planName)}`,
    ctx.domain ? `- **Domena:** ${escapeMarkdown(ctx.domain)}` : null,
    `- **Identyfikator usługi:** \`${escapeMarkdown(ctx.serviceTag)}\``,
    `- **Cena:** ${escapeMarkdown(kwotaZamowienia(ctx.amountLabel))} ${period}`,
    `- **Płatność:** ${escapeMarkdown(ctx.paymentLabel)}`,
    ``,
    `Gdy usługa będzie gotowa, wyślemy osobną wiadomość z danymi dostępowymi.`,
    ``,
    // Potwierdzenie zawarcia umowy na trwałym nośniku (art. 21 ust. 1 ustawy o prawach konsumenta).
    `## Twoja umowa`,
    ``,
    `- **Sprzedawca:** HVLN Dominik Kowalski, Zacisze 2A, 65-775 Zielona Góra, NIP 9292069367, REGON 521024260, e-mail kontakt@verris.pl.`,
    `- **Odnowienie:** usługa odnawia się automatycznie ${coOkres} według cennika z dnia odnowienia. Przypomnimy o tym e-mailem przed odnowieniem. Odnawianie wyłączysz w panelu, w ustawieniach usługi, przed końcem okresu — bez opłat.`,
    `- **Faktury:** fakturę wystawiamy przy każdej wpłacie pieniędzy (doładowanie portfela, płatność BLIK-iem lub przelewem, pobranie z karty) i znajdziesz ją w panelu w Płatnościach. Zakup z portfela nie tworzy nowej faktury, bo rozlicza go faktura za doładowanie. Kredyty z kodu promocyjnego to nie zakup, więc nie ma za nie faktury.`,
    `- **Reklamacje:** w panelu (Wsparcie → Nowe zgłoszenie), e-mailem na kontakt@verris.pl albo pisemnie na adres sprzedawcy. Odpowiadamy w ciągu 14 dni.`,
    `- **Odstąpienie od umowy:** zamówienie zawiera Twoje żądanie rozpoczęcia świadczenia usługi przed upływem 14-dniowego terminu odstąpienia. Jeśli jesteś konsumentem albo przedsiębiorcą na prawach konsumenta, możesz odstąpić od umowy w ciągu 14 dni od jej zawarcia, bez podania przyczyny — zgłoszeniem w panelu (Wsparcie → Nowe zgłoszenie), e-mailem na kontakt@verris.pl albo pisemnie. Zapłacisz wtedy proporcjonalnie za czas, w którym usługa działała, a resztę zwrócimy w ciągu 14 dni. Przy rejestracji domeny prawo odstąpienia w tej części wygasa z chwilą jej zarejestrowania. Wzór formularza odstąpienia jest w Załączniku 1 do Regulaminu (nie musisz z niego korzystać).`,
    ``,
    `Pełne warunki: [Regulamin świadczenia usług Verris](${ctx.panelUrl}/legal/terms) w wersji obowiązującej w dniu zakupu (archiwum wersji w panelu, Dokumenty prawne → Historia wersji) oraz [Polityka prywatności](${ctx.panelUrl}/legal/privacy).`,
  ].filter((l): l is string => l !== null);

  const { html, text } = renderEmailShell({
    title: 'Dziękujemy za zamówienie',
    preheader: `Przyjęliśmy zamówienie: ${ctx.planName}.`,
    bodyMarkdown: lines.join('\n'),
    cta: { label: 'Otwórz panel', url: `${ctx.panelUrl}/dashboard` },
    footnote: 'To potwierdzenie zamówienia. Aktywacja usługi może potrwać chwilę.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'order.received', subject: `[Verris] Potwierdzenie zamówienia — ${ctx.planName}`, text, html };
}
