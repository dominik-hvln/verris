import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

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
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';
  const amountLine =
    ctx.direction === 'upgrade' && Number(ctx.amountDue) > 0
      ? `**Dopłata proporcjonalna:** ${escapeHtml(ctx.amountDue)} ${escapeHtml(ctx.currency)} (z portfela lub karty — zgodnie z metodą płatności usługi).`
      : ctx.direction === 'downgrade' && Number(ctx.amountCredit) > 0
        ? `**Uznanie na portfel:** ${escapeHtml(ctx.amountCredit)} ${escapeHtml(ctx.currency)} za niewykorzystany okres.`
        : 'Bez dodatkowej opłaty za pozostały okres.';

  const { html, text } = renderEmailShell({
    title: 'Plan hostingowy został zmieniony',
    preheader: `${escapeHtml(ctx.domain)} — ${escapeHtml(ctx.fromPlanName)} → ${escapeHtml(ctx.toPlanName)}.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Dla usługi **${escapeHtml(ctx.domain)}** zmieniliśmy plan hostingowy:`,
      ``,
      `- **Było:** ${escapeHtml(ctx.fromPlanName)}`,
      `- **Jest:** ${escapeHtml(ctx.toPlanName)}`,
      `- ${amountLine}`,
      ``,
      `Limity LVE i dysku zostały ustawione według nowego planu. Delty autoskalowania (jeśli były) zostały zresetowane — możesz je ponownie skonfigurować w panelu.`,
    ].join('\n'),
    cta: {
      label: 'Otwórz usługę',
      url: ctx.serviceUrl,
    },
    footnote: 'To powiadomienie produktowe o zmianie planu na istniejącej subskrypcji.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'PRODUCT_UPDATE',
  });

  return {
    to: ctx.to,
    subject: `Plan zmieniony: ${ctx.domain}`,
    html,
    text,
    category: 'PRODUCT_UPDATE',
    userId: ctx.userId,
  };
}
