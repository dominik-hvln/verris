import type { MailMessage } from '../mailer.interface.js';
import { renderEmailShell, escapeMarkdown } from './_layouts/email-shell.js';

/**
 * K2 (PB-53.5) — zmiana właściciela usługi przez administratora: mail do poprzedniego i do nowego właściciela.
 * TRANSACTIONAL (dotyczy działania usługi). Żadna strona nie dostaje adresu e-mail drugiej (RODO) ani nazwiska
 * operatora (D3); bez nazw infrastruktury (white label).
 */

export interface ZmianaWlascicielaMailContext {
  to: string;
  userId: string;
  firstName: string | null;
  /** Domena główna usługi (albo jej oznaczenie, gdy konto nie ma domeny). */
  usluga: string;
  panelUrl: string;
}

export interface NowyWlascicielMailContext extends ZmianaWlascicielaMailContext {
  subscriptionId: string;
  /** Najbliższe odnowienie (ISO) — null, gdy usługa nie ma okresu. */
  odnowienie: string | null;
  /** Usługa anulowana na koniec okresu (ISO) — nie odnowi się, póki klient nie cofnie rezygnacji. */
  anulowanaDo: string | null;
  /** Płatne dodatki, które od teraz rozliczają się na koncie nowego właściciela (np. autoskalowanie). */
  platneDodatki: string[];
}

const dzien = (iso: string) => new Date(iso).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
const powitanie = (imie: string | null) => (imie ? `Cześć **${escapeMarkdown(imie)}**!` : 'Cześć!');

export function uslugaPrzekazanaTemplate(ctx: ZmianaWlascicielaMailContext): MailMessage {
  const usluga = escapeMarkdown(ctx.usluga);
  const { html, text } = renderEmailShell({
    title: 'Usługa przeniesiona na inne konto',
    preheader: `${usluga} należy teraz do innego konta Verris.`,
    bodyMarkdown: [
      powitanie(ctx.firstName),
      '',
      `Na zlecenie przenieśliśmy usługę **${usluga}** na inne konto klienta Verris. Od teraz nie widzisz jej w swoim panelu i nie będziemy Cię za nią obciążać.`,
      '',
      '- Faktury i płatności za dotychczasowe okresy zostają na Twoim koncie.',
      '- Subkonta i współpracownicy Twojego konta nie mają już dostępu do tej usługi.',
      '',
      'Jeśli przeniesienie jest dla Ciebie zaskoczeniem, odpowiedz na tę wiadomość albo napisz zgłoszenie w panelu.',
    ].join('\n'),
    cta: { label: 'Otwórz rozliczenia', url: `${ctx.panelUrl}/dashboard/billing` },
    footnote: 'Potwierdzenie zmiany właściciela usługi.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, userId: ctx.userId, tag: 'subscription.owner-changed.previous', subject: `Usługa przeniesiona: ${ctx.usluga}`, html, text, category: 'TRANSACTIONAL', fromRole: 'SUPPORT' };
}

export function uslugaPrzyjetaTemplate(ctx: NowyWlascicielMailContext): MailMessage {
  const usluga = escapeMarkdown(ctx.usluga);
  const rozliczenie = ctx.anulowanaDo
    ? `- Usługa jest anulowana na koniec okresu — działa do **${dzien(ctx.anulowanaDo)}** i się nie odnowi. Jeśli chcesz ją zachować, cofnij rezygnację w panelu.`
    : ctx.odnowienie
      ? `- Najbliższe odnowienie: **${dzien(ctx.odnowienie)}** — kolejne okresy rozliczamy już na Twoim koncie.`
      : '- Kolejne okresy rozliczamy już na Twoim koncie.';
  const { html, text } = renderEmailShell({
    title: 'Masz nową usługę na swoim koncie',
    preheader: `${usluga} należy teraz do Twojego konta Verris.`,
    bodyMarkdown: [
      powitanie(ctx.firstName),
      '',
      `Na zlecenie przypisaliśmy do Twojego konta usługę **${usluga}** — z plikami, bazami, pocztą i ustawieniami.`,
      '',
      rozliczenie,
      ...(ctx.platneDodatki.length ? [`- Płatne dodatki usługi (${ctx.platneDodatki.map(escapeMarkdown).join(', ')}) od teraz rozliczają się z Twojego portfela — możesz je wyłączyć w panelu.`] : []),
      '',
      'Poprzedni właściciel mógł znać hasła do tej usługi. Dla bezpieczeństwa zmień hasła do FTP, skrzynek pocztowych, baz danych i panelu strony (np. WordPressa) oraz sprawdź klucze SSH.',
    ].join('\n'),
    cta: { label: 'Otwórz usługę', url: `${ctx.panelUrl}/dashboard/services/${ctx.subscriptionId}` },
    footnote: 'Potwierdzenie zmiany właściciela usługi.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, userId: ctx.userId, tag: 'subscription.owner-changed.new', subject: `Nowa usługa na Twoim koncie: ${ctx.usluga}`, html, text, category: 'TRANSACTIONAL', fromRole: 'SUPPORT' };
}
