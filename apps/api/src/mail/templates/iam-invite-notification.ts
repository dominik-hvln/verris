import type { MailMessage } from '../mailer.interface.js';
import { renderEmailShell, escapeMarkdown } from './_layouts/email-shell.js';

export interface IamInviteContext {
  to: string;
  ownerEmail: string;
  /** P3-10 — firma albo imię i nazwisko zapraszającego (null = sam adres). */
  ownerName?: string | null;
  inviteUrl: string;
  expiresDays: number;
  label: string | null;
  panelUrl: string;
  /** PB-20 — adres ma już konto Verris: przyjmuje się z własnego konta, bez nowego loginu. */
  maKonto?: boolean;
  /** PB-20 — nazwy udostępnionych usług; `null` = całe konto. */
  uslugi?: string[] | null;
  /** P3-10 — nadane uprawnienia (kody CustomerPermission); w mailu prostym językiem. */
  permissions?: readonly string[];
}

/** P3-10 — uprawnienia prostym językiem (te same nazwy co w panelu: IAM → uprawnienia). */
export const OPIS_UPRAWNIEN: Record<string, string> = {
  BILLING_READ: 'podgląd płatności i faktur',
  BILLING_MANAGE: 'płatności: doładowania i zakupy z portfela',
  SERVICES_READ: 'podgląd usług',
  SERVICES_MANAGE: 'zarządzanie usługami (bez rezygnacji z usługi)',
  DOMAINS_READ: 'podgląd domen',
  DOMAINS_MANAGE: 'zarządzanie domenami',
  DNS_MANAGE: 'rekordy DNS',
  EMAIL_MANAGE: 'skrzynki i poczta',
  FILES_MANAGE: 'pliki stron, bazy danych i kopie',
  TICKETS_READ: 'podgląd zgłoszeń do pomocy',
  TICKETS_MANAGE: 'zakładanie zgłoszeń i odpowiedzi',
  SETTINGS_MANAGE: 'ustawienia konta',
};

/** Firma albo imię i nazwisko, a gdy ich brak — adres e-mail. */
export function nazwaOsoby(o: { email: string; firstName?: string | null; lastName?: string | null; companyName?: string | null }): string {
  return o.companyName?.trim() || [o.firstName, o.lastName].filter(Boolean).join(' ').trim() || o.email;
}

export function iamSubaccountInviteTemplate(ctx: IamInviteContext): MailMessage {
  const kto =
    ctx.ownerName && ctx.ownerName !== ctx.ownerEmail
      ? `**${escapeMarkdown(ctx.ownerName)}** (${escapeMarkdown(ctx.ownerEmail)})`
      : `**${escapeMarkdown(ctx.ownerEmail)}**`;
  const zakres = ctx.uslugi?.length
    ? `Dostęp obejmuje tylko te usługi: **${ctx.uslugi.map(escapeMarkdown).join(', ')}**.`
    : 'Dostęp obejmuje wszystkie usługi konta.';
  const uprawnienia = (ctx.permissions ?? []).map((p) => OPIS_UPRAWNIEN[p]).filter((p): p is string => Boolean(p));
  const { html, text } = renderEmailShell({
    title: 'Zaproszenie do konta Verris',
    preheader: `Zaproszenie ważne ${ctx.expiresDays} dni.`,
    bodyMarkdown: [
      'Cześć!',
      ``,
      ctx.maKonto
        ? `${kto} udostępnia Ci swoje konto w panelu Verris. Masz już konto Verris – przyjmiesz zaproszenie ze swojego konta i będziesz przełączać się między kontami bez nowego loginu.`
        : `${kto} zaprasza Cię do współpracy w panelu Verris. Dostaniesz własny login (subkonto) do tego konta.`,
      ``,
      zakres,
      ``,
      ...(uprawnienia.length ? ['Możesz:', '', ...uprawnienia.map((u) => `- ${u}`), ''] : []),
      ...(ctx.label ? [`Etykieta dostępu: **${escapeMarkdown(ctx.label)}**`, ''] : []),
      'Usunąć konta, zrezygnować z usługi ani zmienić dostępu innych osób nie możesz – to zostaje u właściciela konta.',
      ``,
      ctx.maKonto
        ? `Kliknij poniżej i zaloguj się swoim kontem. Link wygasa po **${ctx.expiresDays} dniach**.`
        : `Kliknij poniżej, aby ustawić hasło i wejść do panelu. Link wygasa po **${ctx.expiresDays} dniach**.`,
    ].join('\n'),
    cta: { label: ctx.maKonto ? 'Przyjmij zaproszenie' : 'Aktywuj subkonto', url: ctx.inviteUrl },
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'iam.subaccount-invite',
    subject: 'Zaproszenie do konta Verris',
    text,
    html,
  };
}

export interface IamDostepOdebranyContext {
  to: string;
  ownerName: string;
  panelUrl: string;
  /** Dostęp z własnego konta Verris (członkostwo) — konto osoby działa dalej. */
  wlasneKonto: boolean;
}

/** P3-09 — właściciel odebrał dostęp: krótka informacja dla współpracownika. */
export function iamDostepOdebranyTemplate(ctx: IamDostepOdebranyContext): MailMessage {
  const { html, text } = renderEmailShell({
    title: 'Dostęp do konta Verris odebrany',
    preheader: `Dostęp do konta ${ctx.ownerName} został wyłączony.`,
    bodyMarkdown: [
      'Cześć!',
      '',
      `Twój dostęp do konta **${escapeMarkdown(ctx.ownerName)}** w panelu Verris został wyłączony przez właściciela tego konta.`,
      '',
      ctx.wlasneKonto
        ? 'Twoje własne konto Verris działa bez zmian – znika z niego tylko przełączanie na to konto.'
        : 'Nie zalogujesz się już na to subkonto. Jeśli to pomyłka, skontaktuj się z osobą, która Cię zaprosiła – może przywrócić dostęp.',
    ].join('\n'),
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'iam.dostep-odebrany', subject: 'Dostęp do konta Verris odebrany', text, html };
}
