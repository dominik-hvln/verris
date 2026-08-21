import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

// ---------------------------------------------------------------------------
// B3 — site monitoring alerts (down / recovered). One mail per transition,
// never per check — the scheduler enforces anti-flap before calling these.
// ---------------------------------------------------------------------------

export interface SiteDownContext {
  to: string;
  firstName: string | null;
  domain: string;
  url: string;
  /** Diagnoza, np. "timeout po 10 s" albo "HTTP 503". */
  reason: string;
  checkedAt: Date;
  panelUrl: string;
  serviceUrl: string;
}

export function siteDownTemplate(ctx: SiteDownContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';
  const { html, text } = renderEmailShell({
    title: `Twoja strona ${escapeHtml(ctx.domain)} nie odpowiada`,
    preheader: `Monitoring Verris: ${escapeHtml(ctx.domain)} — ${escapeHtml(ctx.reason)}.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Nasz monitoring wykrył, że **${escapeHtml(ctx.domain)}** przestała odpowiadać.`,
      ``,
      `- **Adres:** ${escapeHtml(ctx.url)}`,
      `- **Problem:** ${escapeHtml(ctx.reason)}`,
      `- **Wykryto:** ${ctx.checkedAt.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}`,
      ``,
      `Sprawdzamy stronę co minutę — **napiszemy ponownie, gdy wróci do działania.**`,
      ``,
      `Co możesz zrobić teraz:`,
      ``,
      `1. Otwórz stronę w trybie incognito — może to chwilowy problem z siecią.`,
      `2. Sprawdź status usługi i ostatnie zmiany (wtyczki, aktualizacje) w panelu.`,
      `3. Jeśli problem trwa, odpowiedz na tego maila lub otwórz ticket — pomożemy.`,
    ].join('\n'),
    cta: { label: 'Zobacz usługę w panelu', url: ctx.serviceUrl },
    footnote:
      'Otrzymujesz tę wiadomość, bo masz włączony monitoring strony dla tej usługi. Możesz go wyłączyć w panelu (zakładka Monitoring).',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'monitoring.site-down',
    subject: `[Verris] ⚠️ ${ctx.domain} nie odpowiada`,
    text,
    html,
  };
}

export interface SiteRecoveredContext {
  to: string;
  firstName: string | null;
  domain: string;
  url: string;
  downtimeMinutes: number;
  recoveredAt: Date;
  panelUrl: string;
  serviceUrl: string;
}

export function siteRecoveredTemplate(ctx: SiteRecoveredContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';
  const duration =
    ctx.downtimeMinutes < 60
      ? `${Math.max(1, Math.round(ctx.downtimeMinutes))} min`
      : `${Math.floor(ctx.downtimeMinutes / 60)} h ${Math.round(ctx.downtimeMinutes % 60)} min`;
  const { html, text } = renderEmailShell({
    title: `${escapeHtml(ctx.domain)} znowu działa`,
    preheader: `Strona wróciła po ${duration} przerwy.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Dobra wiadomość — **${escapeHtml(ctx.domain)}** znowu odpowiada.`,
      ``,
      `- **Czas niedostępności:** ~${duration}`,
      `- **Przywrócono:** ${ctx.recoveredAt.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}`,
      ``,
      `Historię awarii znajdziesz w panelu w zakładce **Monitoring** przy usłudze.`,
    ].join('\n'),
    cta: { label: 'Zobacz historię monitoringu', url: ctx.serviceUrl },
    footnote:
      'Otrzymujesz tę wiadomość, bo masz włączony monitoring strony dla tej usługi.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'monitoring.site-recovered',
    subject: `[Verris] ✅ ${ctx.domain} znowu działa (po ${duration})`,
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// MON-3 — płatny monitoring wrócił do darmowego z braku środków w portfelu.
// ---------------------------------------------------------------------------

export interface MonitoringPaidLapsedContext {
  to: string;
  firstName: string | null;
  domain: string;
  freeIntervalMinutes: number;
  paidIntervalMinutes: number;
  monthlyPrice: number;
  panelUrl: string;
  serviceUrl: string;
}

export function monitoringPaidLapsedTemplate(ctx: MonitoringPaidLapsedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';
  const paidEvery =
    ctx.paidIntervalMinutes === 1 ? 'co minutę' : `co ${ctx.paidIntervalMinutes} min`;
  const { html, text } = renderEmailShell({
    title: `Szybki monitoring ${escapeHtml(ctx.domain)} został wstrzymany`,
    preheader: `Brak środków w portfelu — wróciliśmy do monitoringu co ${ctx.freeIntervalMinutes} min.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Nie mogliśmy pobrać miesięcznej opłaty za **szybki monitoring** strony **${escapeHtml(
        ctx.domain,
      )}** — w portfelu zabrakło środków.`,
      ``,
      `**Twoja strona jest nadal monitorowana** — wróciliśmy tylko do standardowego sprawdzania co **${ctx.freeIntervalMinutes} min** (zamiast ${paidEvery}). Nic nie zniknęło, alerty o awariach działają dalej.`,
      ``,
      `Aby przywrócić szybkie sprawdzanie (${ctx.monthlyPrice} K/mies.), doładuj portfel i włącz je ponownie w panelu — zakładka **Monitoring** przy usłudze.`,
    ].join('\n'),
    cta: { label: 'Doładuj i włącz ponownie', url: `${ctx.panelUrl}/dashboard/billing` },
    footnote:
      'Otrzymujesz tę wiadomość, bo miałeś włączony płatny monitoring tej usługi. Standardowy (darmowy) monitoring pozostaje aktywny.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'monitoring.paid-lapsed',
    subject: `[Verris] Szybki monitoring ${ctx.domain} wstrzymany — doładuj portfel`,
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// MON-5 — certyfikat SSL strony wkrótce wygaśnie.
// ---------------------------------------------------------------------------

export interface SslExpiringContext {
  to: string;
  firstName: string | null;
  domain: string;
  expiresAt: Date;
  daysLeft: number;
  panelUrl: string;
  serviceUrl: string;
}

export function sslExpiringTemplate(ctx: SslExpiringContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';
  const expired = ctx.daysLeft <= 0;
  const whenLabel = expired
    ? 'wygasł'
    : ctx.daysLeft === 1
      ? 'wygaśnie jutro'
      : `wygaśnie za ${ctx.daysLeft} dni`;
  const { html, text } = renderEmailShell({
    title: expired
      ? `Certyfikat SSL dla ${escapeHtml(ctx.domain)} wygasł`
      : `Certyfikat SSL dla ${escapeHtml(ctx.domain)} ${whenLabel}`,
    preheader: `SSL ${escapeHtml(ctx.domain)} — ważny do ${escapeHtml(
      ctx.expiresAt.toLocaleDateString('pl-PL'),
    )}.`,
    bodyMarkdown: [
      greeting,
      ``,
      expired
        ? `Certyfikat SSL strony **${escapeHtml(ctx.domain)}** **wygasł** (${escapeHtml(
            ctx.expiresAt.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
          )}). Przeglądarki będą teraz pokazywać ostrzeżenie o niebezpiecznej stronie.`
        : `Certyfikat SSL strony **${escapeHtml(ctx.domain)}** **${whenLabel}** (ważny do ${escapeHtml(
            ctx.expiresAt.toLocaleDateString('pl-PL'),
          )}).`,
      ``,
      `Jeśli używasz darmowego certyfikatu **Let's Encrypt** z panelu — zwykle odnawia się automatycznie i nie musisz nic robić. Ten e-mail to zabezpieczenie na wypadek, gdyby odnowienie się nie powiodło.`,
      ``,
      `Co warto zrobić:`,
      ``,
      `1. Otwórz zakładkę **SSL** przy usłudze i sprawdź status certyfikatu.`,
      `2. Jeśli to certyfikat Let's Encrypt — kliknij „Odnów" / wygeneruj ponownie.`,
      `3. Jeśli wgrywasz własny certyfikat — przygotuj nowy przed datą wygaśnięcia.`,
    ].join('\n'),
    cta: { label: 'Zarządzaj certyfikatem SSL', url: ctx.serviceUrl },
    footnote:
      'Otrzymujesz tę wiadomość, bo masz włączony monitoring strony dla tej usługi. Sprawdzamy certyfikat raz dziennie.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'monitoring.ssl-expiring',
    subject: expired
      ? `[Verris] ⚠️ Certyfikat SSL ${ctx.domain} wygasł`
      : `[Verris] Certyfikat SSL ${ctx.domain} ${whenLabel}`,
    text,
    html,
  };
}
