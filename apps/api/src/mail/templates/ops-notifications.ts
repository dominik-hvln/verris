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

export interface NodeCapacityContext {
  to: string;
  firstName: string | null;
  nodeName: string;
  nodeId: string;
  /** Najwyższe obłożenie spośród CPU/RAM/dysku (%). */
  topUtilizationPct: number;
  cpuPct: number;
  ramPct: number;
  diskPct: number;
  accounts: number;
  maxAccounts: number | null;
  /** Czy watchdog automatycznie ustawił cordon. */
  autoCordoned: boolean;
  panelUrl: string;
}

export function nodeCapacityAlertTemplate(ctx: NodeCapacityContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: `Węzeł ${ctx.nodeName} blisko zapełnienia`,
    preheader: `Obłożenie ${ctx.topUtilizationPct}% — rozważ dodanie węzła.`,
    bodyMarkdown: [
      greeting,
      ``,
      `**Węzeł \`${escapeHtml(ctx.nodeName)}\` zbliża się do limitu pojemności** (alokacja planów, bez burstu autoskalowania).`,
      ``,
      `- **Węzeł:** ${escapeHtml(ctx.nodeName)} (\`${escapeHtml(ctx.nodeId)}\`)`,
      `- **CPU:** ${ctx.cpuPct}% · **RAM:** ${ctx.ramPct}% · **Dysk:** ${ctx.diskPct}%`,
      `- **Konta:** ${ctx.accounts}${ctx.maxAccounts != null ? ` / ${ctx.maxAccounts}` : ''}`,
      ...(ctx.autoCordoned
        ? ['', `> ⚠️ Watchdog **automatycznie ustawił cordon** na tym węźle — nie przyjmuje nowych kont, istniejące działają.`]
        : []),
      ``,
      `## Co zrobić`,
      ``,
      `1. **Dodaj nowy węzł** (wizard) lub zwiększ pojemność istniejącego.`,
      `2. Rozważ **rebalans** części kont na mniej obciążony węzeł.`,
      `3. Sprawdź szczegóły w panelu: Pojemność floty.`,
    ].join('\n'),
    cta: { label: 'Otwórz pojemność floty', url: `${ctx.panelUrl}/nodes/capacity` },
    footnote: 'Alert wysyłany z cooldownem na węzeł. Otrzymują go wszyscy administratorzy.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return {
    to: ctx.to,
    tag: 'ops.node-capacity',
    subject: `[Verris] ⚠️ Węzeł ${ctx.nodeName} blisko zapełnienia (${ctx.topUtilizationPct}%)`,
    text,
    html,
  };
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

/* ===================== CMP-5b — reputacja IP (RBL) ===================== */
export interface NodeRblContext {
  to: string;
  firstName: string | null;
  nodeName: string;
  nodeId: string;
  ip: string;
  zones: string[];
  panelUrl: string;
}

export function nodeRblAlertTemplate(ctx: NodeRblContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const zonesList = ctx.zones.map((z) => `- \`${escapeHtml(z)}\``).join('\n');
  const { html, text } = renderEmailShell({
    title: `IP węzła ${ctx.nodeName} trafiło na blacklistę`,
    preheader: 'Reputacja IP zagrożona — może to wpłynąć na dostarczalność poczty.',
    bodyMarkdown: [
      greeting,
      ``,
      `**IP \`${escapeHtml(ctx.ip)}\` (węzeł ${escapeHtml(ctx.nodeName)}) figuruje na blacklistach DNS (RBL).** Poczta wychodząca z kont na tym węźle może być odrzucana lub trafiać do spamu.`,
      ``,
      `- **Węzeł:** ${escapeHtml(ctx.nodeName)} (\`${escapeHtml(ctx.nodeId)}\`)`,
      `- **IP:** ${escapeHtml(ctx.ip)}`,
      `- **Wykryto na:**`,
      zonesList,
      ``,
      `## Co zrobić`,
      ``,
      `1. Sprawdź, czy żadne konto nie zostało przejęte/nie wysyła spamu (logi SMTP, kolejka).`,
      `2. Złóż wniosek o delisting w danym RBL (Spamhaus/Spamcop/Barracuda/SORBS).`,
      `3. Zweryfikuj SPF/DKIM/DMARC i rate-limit wysyłki na węźle.`,
    ].join('\n'),
    cta: { label: 'Otwórz panel floty', url: `${ctx.panelUrl}/servers` },
    footnote: 'Alert wysyłany raz na incydent (cooldown 12h). Otrzymują go wszyscy administratorzy.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'ops.node-rbl', subject: `[Verris] ⚠️ IP węzła ${ctx.nodeName} na blacklistcie (RBL)`, text, html };
}

export function nodeRblClearedTemplate(ctx: NodeRblContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: `IP węzła ${ctx.nodeName} czyste`,
    preheader: 'IP zniknęło z blacklist — reputacja przywrócona.',
    bodyMarkdown: [
      greeting,
      ``,
      `Dobre wieści: **IP \`${escapeHtml(ctx.ip)}\` (węzeł ${escapeHtml(ctx.nodeName)}) nie figuruje już na sprawdzanych blacklistach.**`,
      ``,
      `- **Węzeł:** ${escapeHtml(ctx.nodeName)} (\`${escapeHtml(ctx.nodeId)}\`)`,
      `- **Czas:** ${escapeHtml(fmt(new Date()))}`,
      ``,
      `Monitoruj dostarczalność przez kolejne dni, aby upewnić się, że reputacja jest stabilna.`,
    ].join('\n'),
    cta: { label: 'Otwórz panel floty', url: `${ctx.panelUrl}/servers` },
    footnote: 'Powiadomienie o przywróceniu reputacji IP.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'ops.node-rbl-cleared', subject: `[Verris] ✅ IP węzła ${ctx.nodeName} znów czyste (RBL)`, text, html };
}

/* ===================== MAIL-W1 — watchdog wysyłki poczty ===================== */
export interface MailDeliveryFailureContext {
  to: string;
  firstName: string | null;
  windowMinutes: number;
  failed: number;
  total: number;
  ratePct: number;
  /** Najczęstszy komunikat błędu w oknie (do szybkiej diagnozy). */
  topError: string | null;
  panelUrl: string;
}

export function mailDeliveryFailureAlertTemplate(ctx: MailDeliveryFailureContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: `Rośnie odsetek nieudanych maili (${ctx.ratePct}%)`,
    preheader: 'Wysyłka poczty systemowej zawodzi — sprawdź konfigurację SMTP.',
    bodyMarkdown: [
      greeting,
      ``,
      `**W ostatnich ${ctx.windowMinutes} min ${ctx.failed} z ${ctx.total} maili zakończyło się statusem FAILED (${ctx.ratePct}%).** Powiadomienia (reset hasła, faktury, alerty) mogą nie docierać do klientów.`,
      ``,
      ctx.topError ? `- **Najczęstszy błąd:** \`${escapeHtml(ctx.topError)}\`` : `- Szczegóły błędów w dzienniku EmailLog.`,
      ``,
      `## Co sprawdzić`,
      ``,
      `1. Ustawienia poczty (SMTP host/login/hasło, tryb transportu).`,
      `2. Dziennik EmailLog — kolumna błędu przy statusie FAILED.`,
      `3. Stan relaya (SES/Postfix) i limity/reputację nadawcy.`,
    ].join('\n'),
    cta: { label: 'Otwórz dziennik poczty', url: `${ctx.panelUrl}/settings/mail/log` },
    footnote: 'Alert wysyłany z cooldownem (max raz na 3h). Otrzymują go wszyscy administratorzy.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return {
    to: ctx.to,
    tag: 'ops.mail-failure-rate',
    subject: `[Verris] ⚠️ Nieudane maile: ${ctx.ratePct}% w ${ctx.windowMinutes} min`,
    text,
    html,
  };
}

// -----------------------------------------------------------------------------
// Z-05 — zdarzenie webhooka Stripe'a zacięło się na ścieżce pieniędzy
// -----------------------------------------------------------------------------

export interface WebhookZacietyContext {
  to: string;
  firstName: string | null;
  eventId: string;
  typ: string;
  proby: number;
  pierwszyRaz: Date;
  ostatniBlad: string | null;
  panelUrl: string;
}

/**
 * Alert o zdarzeniu, którego nie udało się obsłużyć.
 *
 * Ton jest celowo konkretny, nie alarmistyczny: podaje identyfikator zdarzenia,
 * treść błędu i jedno miejsce, w które trzeba kliknąć. Alert, który każe komuś
 * dopiero szukać, gdzie zajrzeć, kosztuje tyle samo czasu co brak alertu.
 */
export function webhookZacietyTemplate(ctx: WebhookZacietyContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'Zdarzenie płatności nie zostało obsłużone',
    preheader: `Stripe ${escapeHtml(ctx.typ)} — ${ctx.proby} nieudane próby.`,
    bodyMarkdown: [
      greeting,
      ``,
      `**Zdarzenie webhooka Stripe'a nie zostało obsłużone** mimo ${ctx.proby} prób.`,
      `Jeżeli dotyczy doładowania albo opłaty za subskrypcję, pieniądze mogły` +
        ` zostać pobrane, a saldo albo aktywacja nie nastąpiły.`,
      ``,
      `- **Zdarzenie:** \`${escapeHtml(ctx.eventId)}\``,
      `- **Typ:** ${escapeHtml(ctx.typ)}`,
      `- **Pierwsza dostawa:** ${escapeHtml(fmt(ctx.pierwszyRaz))}`,
      `- **Liczba prób:** ${ctx.proby}`,
      ``,
      `**Ostatni błąd:**`,
      ``,
      '```',
      escapeHtml(ctx.ostatniBlad ?? '(brak treści błędu)'),
      '```',
      ``,
      `## Co zrobić`,
      ``,
      `1. Otwórz listę zaciętych zdarzeń w panelu admina.`,
      `2. Przeczytaj błąd — jeśli przyczyna minęła (np. baza była chwilowo niedostępna),`,
      `   wystarczy „Ponów przetwarzanie".`,
      `3. Jeśli błąd wraca, sprawdź w Stripe, czy płatność faktycznie doszła,`,
      `   zanim zaczniesz cokolwiek księgować ręcznie.`,
      ``,
      `Ponowienie jest bezpieczne: księgowanie portfela jest idempotentne po kluczu`,
      `sesji, więc powtórzenie nie doda pieniędzy drugi raz.`,
    ].join('\n'),
    cta: { label: 'Otwórz zacięte zdarzenia', url: `${ctx.panelUrl}/billing/webhooki` },
    footnote:
      'Alert wysyłany najwyżej raz na 6 godzin dla tego samego zdarzenia. Otrzymują go wszyscy administratorzy.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return {
    to: ctx.to,
    tag: 'ops.webhook-zaciety',
    subject: `[Verris] 💳 Zdarzenie płatności nieobsłużone (${ctx.typ})`,
    text,
    html,
  };
}
