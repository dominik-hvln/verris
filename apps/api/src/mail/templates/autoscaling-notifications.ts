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

export interface AutoscalingScaleUpContext {
  to: string;
  userId?: string;
  firstName: string | null;
  domain: string;
  resource: AutoscalingResource;
  fromValue: number;
  toValue: number;
  panelUrl: string;
  autoscalingUrl: string;
}

export function autoscalingScaleUpTemplate(ctx: AutoscalingScaleUpContext): MailMessage {
  const label = RESOURCE_LABELS[ctx.resource] ?? ctx.resource;
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';
  const deltaFrom = formatDelta(ctx.resource, ctx.fromValue);
  const deltaTo = formatDelta(ctx.resource, ctx.toValue);

  const { html, text } = renderEmailShell({
    title: 'Autoskalowanie zwiększyło limity',
    preheader: `${escapeHtml(ctx.domain)} — wyższy limit ${label}.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Dla usługi **${escapeHtml(ctx.domain)}** silnik autoskalowania **zwiększył dodatkowy limit ${label}** w odpowiedzi na utrzymującą się presję zasobów.`,
      ``,
      `- **Zasób:** ${escapeHtml(label)}`,
      `- **Delta autoskalowania:** ${escapeHtml(deltaFrom)} → ${escapeHtml(deltaTo)} (ponad plan bazowy)`,
      ``,
      `Naliczenie godzinowe trafia do portfela według cennika. Możesz zmienić, które zasoby skalujemy (CPU, RAM, dysk), lub wyłączyć autoskalowanie w panelu.`,
    ].join('\n'),
    cta: {
      label: 'Ustawienia autoskalowania',
      url: ctx.autoscalingUrl,
    },
    footnote:
      'To powiadomienie produktowe — nie wymaga akcji, jeśli oczekujesz wzrostu ruchu.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'PRODUCT_UPDATE',
  });

  return {
    to: ctx.to,
    userId: ctx.userId,
    tag: `autoscaling.scale-up.${ctx.resource.toLowerCase()}`,
    subject: `[Verris] Autoskalowanie — ${ctx.domain} (${label})`,
    text,
    html,
    category: 'PRODUCT_UPDATE',
  };
}
