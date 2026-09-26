import type { MailMessage } from '../mailer.interface.js';
import { renderEmailShell, escapeMarkdown } from './_layouts/email-shell.js';

export interface PlanChangedContext {
  to: string;
  userId?: string;
  firstName: string | null;
  domain: string;
  fromPlanName: string;
  toPlanName: string;
  direction: 'upgrade' | 'downgrade' | 'none';
  amountDue: string;
  amountCredit: string;
  currency: string;
  panelUrl: string;
  serviceUrl: string;
}

export function planChangedTemplate(ctx: PlanChangedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**!` : 'Cześć!';
  const amountLine =
    ctx.direction === 'upgrade' && Number(ctx.amountDue) > 0
      ? `**Dopłata proporcjonalna:** ${escapeMarkdown(ctx.amountDue)} ${escapeMarkdown(ctx.currency)} (z portfela lub karty — zgodnie z metodą płatności usługi).`
      : ctx.direction === 'downgrade' && Number(ctx.amountCredit) > 0
        ? `**Uznanie na portfel:** ${escapeMarkdown(ctx.amountCredit)} ${escapeMarkdown(ctx.currency)} za niewykorzystany okres.`
        : 'Bez dodatkowej opłaty za pozostały okres.';

  const { html, text } = renderEmailShell({
    title: 'Plan hostingowy został zmieniony',
    preheader: `${escapeMarkdown(ctx.domain)} — ${escapeMarkdown(ctx.fromPlanName)} → ${escapeMarkdown(ctx.toPlanName)}.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Dla usługi **${escapeMarkdown(ctx.domain)}** zmieniliśmy plan hostingowy:`,
      ``,
      `- **Było:** ${escapeMarkdown(ctx.fromPlanName)}`,
      `- **Jest:** ${escapeMarkdown(ctx.toPlanName)}`,
      `- ${amountLine}`,
      ``,
      `Limity LVE i dysku zostały ustawione według nowego planu. Delty autoskalowania (jeśli były) zostały zresetowane — możesz je ponownie skonfigurować w panelu.`,
    ].join('\n'),
    cta: {
      label: 'Otwórz usługę',
      url: ctx.serviceUrl,
    },
    footnote: 'Potwierdzenie zmiany planu na istniejącej usłudze.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'subscription.plan-changed',
    subject: `Plan zmieniony: ${ctx.domain}`,
    html,
    text,
    category: 'TRANSACTIONAL',
    userId: ctx.userId,
  };
}
