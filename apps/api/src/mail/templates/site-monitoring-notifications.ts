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
