import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

export interface VpsReadyContext {
  to: string;
  firstName: string | null;
  name: string;
  ipv4: string | null;
  panelUrl: string;
}

export function vpsReadyTemplate(ctx: VpsReadyContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'Twój VPS jest gotowy',
    preheader: `${escapeHtml(ctx.name)} działa${ctx.ipv4 ? ` — ${escapeHtml(ctx.ipv4)}` : ''}.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Twój serwer **${escapeHtml(ctx.name)}** został uruchomiony i jest gotowy do pracy.`,
      ``,
      ctx.ipv4 ? `- **Adres IPv4:** ${escapeHtml(ctx.ipv4)}` : '',
      `- **Dostęp:** SSH jako \`root\` (hasło początkowe pokazaliśmy raz w panelu — zmień je po pierwszym logowaniu).`,
      ``,
      `Zarządzaj serwerem (start/stop/restart) w panelu.`,
    ].filter(Boolean).join('\n'),
    cta: { label: 'Zarządzaj VPS', url: `${ctx.panelUrl}/dashboard/vps` },
    footnote: 'Hasło root pokazujemy tylko raz — przechowuj je bezpiecznie.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'vps.ready', subject: '[Verris] Twój VPS jest gotowy', text, html };
}

export interface VpsLifecycleContext {
  to: string;
  firstName: string | null;
  name: string;
  panelUrl: string;
}

export function vpsSuspendedTemplate(ctx: VpsLifecycleContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'VPS zawieszony — brak środków',
    preheader: 'Doładuj portfel, aby wznowić serwer.',
    bodyMarkdown: [
      greeting,
      ``,
      `Nie udało się pobrać opłaty za kolejny okres dla VPS **${escapeHtml(ctx.name)}**, więc serwer został **wyłączony**.`,
      ``,
      `Doładuj portfel — przy kolejnej próbie rozliczenia serwer zostanie automatycznie wznowiony. Jeśli zaległość przekroczy **7 dni**, serwer i jego dane mogą zostać **trwale usunięte**.`,
    ].join('\n'),
    cta: { label: 'Doładuj portfel', url: `${ctx.panelUrl}/dashboard/billing` },
    footnote: 'Dane na serwerze są zachowane do czasu ewentualnego usunięcia po okresie karencji.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'vps.suspended', subject: `[Verris] VPS ${ctx.name} zawieszony — doładuj portfel`, text, html };
}

export function vpsTerminatedTemplate(ctx: VpsLifecycleContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'VPS usunięty (zaległość płatnicza)',
    preheader: 'Serwer został usunięty po okresie karencji.',
    bodyMarkdown: [
      greeting,
      ``,
      `Z powodu nieuregulowanej opłaty przez ponad 7 dni serwer VPS **${escapeHtml(ctx.name)}** został **trwale usunięty**, a zasoby zwolnione.`,
      ``,
      `Jeśli chcesz wrócić — zamów nowy VPS w panelu w dowolnej chwili.`,
    ].join('\n'),
    cta: { label: 'Zamów nowy VPS', url: `${ctx.panelUrl}/dashboard/vps` },
    footnote: 'Powiadomienie o zakończeniu usługi.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'vps.terminated', subject: `[Verris] VPS ${ctx.name} usunięty`, text, html };
}
