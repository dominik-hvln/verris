import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';
import { AutoscalingResource } from '@verris/database';

const RESOURCE_LABELS: Record<AutoscalingResource, string> = {
  CPU: 'CPU',
  RAM: 'RAM',
  DISK: 'dysk',
  IO: 'I/O',
  TRANSFER: 'transfer',
};

function formatDelta(resource: AutoscalingResource, mbOrPct: number): string {
  if (resource === AutoscalingResource.CPU) return `+${mbOrPct}%`;
  const gb = mbOrPct / 1024;
  const label = gb % 1 === 0 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(1)} GB`;
  return `+${label}`;
}

function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem} min`;
}

export interface AutoscalingResourceDelta {
  resource: AutoscalingResource;
  toValue: number;
}

/**
 * Sent ONCE when an autoscaling episode begins (any resource goes from the
 * baseline plan to a scaled-up delta). Subsequent in-episode bumps do NOT send
 * another email — the rest of the detail lives in the client panel.
 */
export interface AutoscalingStartedContext {
  to: string;
  userId?: string;
  firstName: string | null;
  domain: string;
  deltas: AutoscalingResourceDelta[];
  /** Estimated hourly cost of the current scaled delta, in PLN. */
  hourlyCostPln?: number;
  /** Cost of the minimum billing block (15 min), in PLN. */
  blockCostPln?: number;
  blockMinutes: number;
  panelUrl: string;
  autoscalingUrl: string;
}

export function autoscalingStartedTemplate(ctx: AutoscalingStartedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';
  const deltaLines = ctx.deltas.map((d) => {
    const label = RESOURCE_LABELS[d.resource] ?? d.resource;
    return `- **${escapeHtml(label)}:** ${escapeHtml(formatDelta(d.resource, d.toValue))} ponad plan bazowy`;
  });

  const costLine =
    ctx.hourlyCostPln != null && ctx.hourlyCostPln > 0
      ? `- **Koszt:** ~${ctx.hourlyCostPln.toFixed(2)} PLN/h, naliczane w blokach po ${ctx.blockMinutes} min` +
        (ctx.blockCostPln != null && ctx.blockCostPln > 0
          ? ` (min. ${ctx.blockCostPln.toFixed(2)} PLN za blok)`
          : '')
      : `- **Koszt:** naliczany z portfela według cennika, w blokach po ${ctx.blockMinutes} min`;

  const { html, text } = renderEmailShell({
    title: 'Autoskalowanie uruchomione',
    preheader: `${escapeHtml(ctx.domain)} — podniesiono limity w odpowiedzi na ruch.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Dla usługi **${escapeHtml(ctx.domain)}** silnik **uruchomił autoskalowanie** i podniósł limity w odpowiedzi na utrzymującą się presję zasobów. Twoja strona działa dalej bez przerwy.`,
      ``,
      ...deltaLines,
      costLine,
      ``,
      `Nie wyślemy kolejnych maili przy dalszych korektach w trakcie tego skoku — **jeden mail teraz** i **jeden, gdy wszystko wróci do planu bazowego** z krótkim podsumowaniem. Bieżące zużycie, historię i koszty na żywo znajdziesz w panelu → Autoskalowanie.`,
    ].join('\n'),
    cta: { label: 'Zobacz autoskalowanie', url: ctx.autoscalingUrl },
    footnote:
      'To powiadomienie produktowe — nie wymaga akcji, jeśli oczekujesz wzrostu ruchu. Limit kosztu i zasoby do skalowania ustawisz w panelu.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'PRODUCT_UPDATE',
  });

  return {
    to: ctx.to,
    userId: ctx.userId,
    tag: 'autoscaling.started',
    subject: `[Verris] Autoskalowanie uruchomione — ${ctx.domain}`,
    text,
    html,
    category: 'PRODUCT_UPDATE',
  };
}

export type AutoscalingEndReason = 'RELAXED' | 'CAP_REACHED' | 'WALLET_EMPTY' | 'AUTO_DISABLED';

/**
 * Sent ONCE when an autoscaling episode ends (all resources return to the
 * baseline plan), with a short summary: how long it lasted and what it cost.
 */
export interface AutoscalingEndedContext {
  to: string;
  userId?: string;
  firstName: string | null;
  domain: string;
  durationMinutes: number;
  totalCostPln: number;
  reason: AutoscalingEndReason;
  panelUrl: string;
  autoscalingUrl: string;
}

const END_REASON_COPY: Record<AutoscalingEndReason, { title: string; line: string }> = {
  RELAXED: {
    title: 'Autoskalowanie zakończone — powrót do planu',
    line: 'Ruch się unormował, więc limity wróciły do Twojego planu bazowego.',
  },
  CAP_REACHED: {
    title: 'Autoskalowanie wstrzymane — limit kosztu',
    line: 'Osiągnięto ustawiony miesięczny limit kosztu autoskalowania, więc limity wróciły do planu bazowego. Limit możesz podnieść w panelu.',
  },
  WALLET_EMPTY: {
    title: 'Autoskalowanie wstrzymane — portfel',
    line: 'Saldo portfela było zbyt niskie, by utrzymać podwyższone limity, więc wróciły do planu bazowego. Doładuj portfel, aby ponownie korzystać z autoskalowania.',
  },
  AUTO_DISABLED: {
    title: 'Autoskalowanie zakończone',
    line: 'Autoskalowanie zostało wyłączone, a limity wróciły do planu bazowego.',
  },
};

export function autoscalingEndedTemplate(ctx: AutoscalingEndedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';
  const copy = END_REASON_COPY[ctx.reason] ?? END_REASON_COPY.AUTO_DISABLED;

  const { html, text } = renderEmailShell({
    title: copy.title,
    preheader: `${escapeHtml(ctx.domain)} — podsumowanie autoskalowania.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Dla usługi **${escapeHtml(ctx.domain)}** ${copy.line}`,
      ``,
      `**Podsumowanie skoku:**`,
      `- **Czas trwania:** ${escapeHtml(formatDuration(ctx.durationMinutes))}`,
      `- **Koszt łącznie:** ${ctx.totalCostPln.toFixed(2)} PLN`,
      ``,
      `Pełną historię (co, kiedy i za ile zostało podniesione) znajdziesz w panelu → Autoskalowanie.`,
    ].join('\n'),
    cta: { label: 'Historia i koszty', url: ctx.autoscalingUrl },
    footnote: 'To powiadomienie produktowe — podsumowanie zakończonego skoku zasobów.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'PRODUCT_UPDATE',
  });

  return {
    to: ctx.to,
    userId: ctx.userId,
    tag: 'autoscaling.ended',
    subject: `[Verris] Autoskalowanie zakończone — ${ctx.domain}`,
    text,
    html,
    category: 'PRODUCT_UPDATE',
  };
}
