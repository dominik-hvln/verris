import type { MailMessage } from '../mailer.interface.js';
import { escapeMarkdown, renderEmailShell } from './_layouts/email-shell.js';
import { kwotaPl } from './_layouts/odmiana.js';

/**
 * Kreator marki – potwierdzenie zakupu Pakietu marki albo kolejnej marki (dokumenty 1.4.0, Regulamin §13b ust. 13).
 *
 * Pakiet marki i kolejna marka to treści cyfrowe niedostarczane na nośniku materialnym. Prawo odstąpienia wygasa
 * (art. 38 ust. 1 pkt 13 ustawy o prawach konsumenta), jeżeli przedsiębiorca rozpoczął świadczenie za wyraźną
 * i uprzednią zgodą konsumenta poinformowanego o utracie prawa odstąpienia ORAZ przekazał mu potwierdzenie na trwałym
 * nośniku (art. 21 ust. 1 – potwierdzenie zawarcia umowy z potwierdzeniem tej zgody). Ten mail jest tym potwierdzeniem:
 * niesie chwilę wyrażenia zgody (`KreatorMarkaZakup.zgodaTresciCyfrowejAt`), chwilę udostępnienia (`oplaconoAt`),
 * dane sprzedawcy, cenę, faktury i reklamacje – jak potwierdzenie zamówienia hostingu (order-notifications.ts).
 */
export interface KreatorMarkiZakupContext {
  to: string;
  firstName: string | null;
  rodzaj: 'PAKIET' | 'DRUGA_MARKA';
  /** Kwota brutto z zakupu, np. „149.00”. */
  kwotaBrutto: string;
  metoda: string;
  zgodaAt: Date;
  udostepnionoAt: Date;
  /** Pakiet: pula serii i zmian AI oraz koniec nowych szablonów materiałów. */
  serie?: number;
  zmianyAi?: number;
  aktualizacjeDo?: Date | null;
  panelUrl: string;
}

export const NAZWA_ZAKUPU_MARKI: Record<KreatorMarkiZakupContext['rodzaj'], string> = {
  PAKIET: 'Pakiet marki',
  DRUGA_MARKA: 'Kolejna marka w Kreatorze marki',
};

const METODY: Record<string, string> = {
  portfel: 'z portfela Verris',
  karta: 'kartą (wpłata do portfela i opłata z portfela)',
  paynow: 'BLIK-iem lub przelewem (wpłata do portfela i opłata z portfela)',
};

const DZIEN = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' });
const GODZINA = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Warsaw' });
/** „19 listopada 2026 r., godz. 14:05” (czas polski) – chwila zgody i udostępnienia. */
export const chwilaPl = (d: Date) => `${DZIEN.format(d)} r., godz. ${GODZINA.format(d)}`;

export function kreatorMarkiZakupTemplate(ctx: KreatorMarkiZakupContext): MailMessage {
  const nazwa = NAZWA_ZAKUPU_MARKI[ctx.rodzaj];
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const pakiet = ctx.rodzaj === 'PAKIET';
  const zakres = pakiet
    ? [
        ctx.serie !== undefined ? `- **Dodatkowe serie propozycji:** ${ctx.serie}` : null,
        ctx.zmianyAi !== undefined ? `- **Dodatkowe zmiany AI:** ${ctx.zmianyAi}` : null,
        ctx.aktualizacjeDo ? `- **Nowe szablony materiałów:** do ${DZIEN.format(ctx.aktualizacjeDo)} r.` : null,
        `- Pulę serii i zmian AI wykorzystujesz bez limitu czasu, przy działającym hostingu.`,
      ]
    : [`- **Zakres:** jedna marka więcej na koncie, w zakresie dostępnym w cenie hostingu.`];
  const lines = [
    greeting,
    ``,
    `Dziękujemy za zakup w Kreatorze marki. ${pakiet ? 'Pakiet marki jest już dostępny na Twoim koncie.' : 'Możesz już utworzyć kolejną markę.'}`,
    ``,
    `## Podsumowanie`,
    ``,
    `- **Zakup:** ${nazwa} – treść cyfrowa, jednorazowo, bez odnowień`,
    `- **Cena:** ${kwotaPl(ctx.kwotaBrutto)} zł brutto`,
    `- **Płatność:** ${METODY[ctx.metoda] ?? escapeMarkdown(ctx.metoda)}`,
    `- **Udostępniono:** ${chwilaPl(ctx.udostepnionoAt)}`,
    ...zakres,
    ``,
    // Potwierdzenie zgody na trwałym nośniku (art. 21 ust. 1 i art. 38 ust. 1 pkt 13 ustawy o prawach konsumenta).
    `## Twoja zgoda i prawo odstąpienia`,
    ``,
    `Przy zakupie (${chwilaPl(ctx.zgodaAt)}) zaznaczono zgodę na rozpoczęcie dostarczania tej treści cyfrowej przed upływem 14-dniowego terminu odstąpienia od umowy i potwierdzono, że z chwilą jej udostępnienia na koncie przepada prawo odstąpienia od umowy w tym zakresie. Zakup udostępniliśmy na koncie ${chwilaPl(ctx.udostepnionoAt)}, więc prawo odstąpienia od umowy w zakresie tego zakupu wygasło (Regulamin §13b ust. 13 i §21 ust. 5). Ten e-mail jest potwierdzeniem tej zgody na trwałym nośniku. Nie dotyczy to hostingu – od umowy hostingu możesz odstąpić na zasadach §21 Regulaminu.`,
    ``,
    `## Twoja umowa`,
    ``,
    `- **Sprzedawca:** HVLN Dominik Kowalski, Zacisze 2A, 65-775 Zielona Góra, NIP 9292069367, REGON 521024260, e-mail kontakt@verris.pl.`,
    `- **Faktury:** fakturę wystawiamy na zasadach Regulaminu §9 ust. 4 i znajdziesz ją w panelu w Płatnościach.`,
    `- **Prawa do logo:** do pobranych plików logo i materiałów dostajesz bezterminową licencję – możesz ich używać w firmie, zmieniać je i zgłosić logo jako znak towarowy (Regulamin §13b ust. 4–6). Przed drukiem i zgłoszeniem sprawdź podobne znaki w TMview.`,
    `- **Reklamacje:** w panelu (Wsparcie → Nowe zgłoszenie), e-mailem na kontakt@verris.pl albo pisemnie na adres sprzedawcy. Odpowiadamy w ciągu 14 dni.`,
    ``,
    `Pełne warunki: [Regulamin świadczenia usług Verris](${ctx.panelUrl}/legal/terms) w wersji obowiązującej w dniu zakupu (archiwum wersji w panelu, Dokumenty prawne → Historia wersji) oraz [Polityka prywatności](${ctx.panelUrl}/legal/privacy).`,
  ].filter((l): l is string => l !== null);

  const { html, text } = renderEmailShell({
    title: `Potwierdzenie zakupu – ${nazwa}`,
    preheader: `${nazwa}: zakup udostępniony na Twoim koncie.`,
    bodyMarkdown: lines.join('\n'),
    cta: { label: 'Otwórz Kreator marki', url: `${ctx.panelUrl}/dashboard/kreator-marki` },
    footnote: 'To potwierdzenie zakupu i Twojej zgody na dostarczenie treści cyfrowej – zachowaj tę wiadomość.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'kreator-marki.zakup', subject: `[Verris] Potwierdzenie zakupu – ${nazwa}`, text, html };
}
