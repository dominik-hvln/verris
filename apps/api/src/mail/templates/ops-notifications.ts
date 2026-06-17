import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

/**
 * Ops / fleet notifications for ADMINs — proactive protection for a LIVE
 * platform: a node going dark, and a daily go/no-go + fleet digest. All
 * TRANSACTIONAL (security/ops critical, non-unsubscribable).
 */

const DT = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Warsaw',
});
const fmt = (d: Date) => DT.format(d);

export interface NodeOfflineContext {
  to: string;
  firstName: string | null;
  nodeName: string;
  nodeId: string;
  lastSeenAt: Date | null;
  panelUrl: string;
}

export function nodeOfflineAlertTemplate(ctx: NodeOfflineContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: `Węzeł ${ctx.nodeName} nie odpowiada`,
    preheader: 'Brak heartbeatu z węzła — możliwa awaria/utrata łączności.',
    bodyMarkdown: [
      greeting,
      ``,
      `**Węzeł \`${escapeHtml(ctx.nodeName)}\` przestał wysyłać heartbeat** do control-plane. Konta na tym węźle mogą być niedostępne.`,
      ``,
      `- **Węzeł:** ${escapeHtml(ctx.nodeName)} (\`${escapeHtml(ctx.nodeId)}\`)`,
      `- **Ostatnio widziany:** ${ctx.lastSeenAt ? escapeHtml(fmt(ctx.lastSeenAt)) : '—'}`,
      ``,
      `## Co zrobić`,
      ``,
      `1. Sprawdź dostępność węzła (ping/SSH/panel dostawcy).`,
      `2. Jeśli to awaria — rozważ przełączenie ruchu / przywrócenie kont z backupu off-node.`,
      `3. Status floty i kont znajdziesz w panelu admina.`,
    ].join('\n'),
    cta: { label: 'Otwórz panel floty', url: `${ctx.panelUrl}/servers` },
    footnote: 'Alert wysyłany raz na incydent (z cooldownem). Otrzymują go wszyscy administratorzy.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'ops.node-offline', subject: `[Verris] ⚠️ Węzeł ${ctx.nodeName} nie odpowiada`, text, html };
}

export function nodeRecoveredTemplate(ctx: NodeOfflineContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: `Węzeł ${ctx.nodeName} znów online`,
    preheader: 'Heartbeat wrócił — węzeł odpowiada.',
    bodyMarkdown: [
      greeting,
      ``,
      `Dobre wieści: **węzeł \`${escapeHtml(ctx.nodeName)}\` znów wysyła heartbeat** i jest online.`,
      ``,
      `- **Węzeł:** ${escapeHtml(ctx.nodeName)} (\`${escapeHtml(ctx.nodeId)}\`)`,
      `- **Czas:** ${escapeHtml(fmt(new Date()))}`,
      ``,
      `Zweryfikuj, czy konta działają poprawnie i czy backupy są aktualne.`,
    ].join('\n'),
    cta: { label: 'Otwórz panel floty', url: `${ctx.panelUrl}/servers` },
    footnote: 'Powiadomienie o przywróceniu węzła.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'ops.node-recovered', subject: `[Verris] ✅ Węzeł ${ctx.nodeName} znów online`, text, html };
}

export interface OpsDigestContext {
  to: string;
  firstName: string | null;
  go: boolean;
  readinessFails: string[];
  readinessWarns: string[];
  nodesActive: number;
  nodesOffline: number;
  nodesBackupStale: number;
  servicesActive: number;
  servicesPastDue: number;
  servicesSuspended: number;
  trialsEndingSoon: number;
  domainsExpiringSoon: number;
  panelUrl: string;
}

export function opsDailyDigestTemplate(ctx: OpsDigestContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const verdict = ctx.go
    ? '🟢 **GO** — brak blokerów startu.'
    : '🔴 **NO-GO** — są blokery do usunięcia.';
  const failLines = ctx.readinessFails.length
    ? ctx.readinessFails.map((f) => `- ❌ ${escapeHtml(f)}`)
    : ['- _(brak)_'];
  const warnLines = ctx.readinessWarns.length
    ? ctx.readinessWarns.map((w) => `- ⚠️ ${escapeHtml(w)}`)
    : ['- _(brak)_'];

  const { html, text } = renderEmailShell({
    title: 'Dzienny raport floty Verris',
    preheader: ctx.go ? 'GO — brak blokerów.' : 'NO-GO — wymaga uwagi.',
    bodyMarkdown: [
      greeting,
      ``,
      `Gotowość LIVE: ${verdict}`,
      ``,
      `## Blokery`,
      ...failLines,
      ``,
      `## Ostrzeżenia`,
      ...warnLines,
      ``,
      `## Flota`,
      `- Węzły ACTIVE: **${ctx.nodesActive}**, offline: **${ctx.nodesOffline}**, nieaktualny backup off-node: **${ctx.nodesBackupStale}**`,
      ``,
      `## Usługi`,
      `- Aktywne: **${ctx.servicesActive}**, zaległe (PAST_DUE): **${ctx.servicesPastDue}**, zawieszone: **${ctx.servicesSuspended}**`,
      `- Okresy próbne kończące się ≤3 dni: **${ctx.trialsEndingSoon}**`,
      `- Domeny wygasające ≤30 dni: **${ctx.domainsExpiringSoon}**`,
    ].join('\n'),
    cta: { label: 'Gotowość do startu LIVE', url: `${ctx.panelUrl}/settings/live-readiness` },
    footnote: 'Dzienny raport operacyjny dla administratorów.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return {
    to: ctx.to,
    tag: 'ops.daily-digest',
    subject: `[Verris] Raport floty — ${ctx.go ? 'GO' : 'NO-GO'} · ${ctx.nodesOffline} offline`,
    text,
    html,
  };
}
