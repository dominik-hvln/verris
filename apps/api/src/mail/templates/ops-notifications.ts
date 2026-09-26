import type { MailMessage } from '../mailer.interface.js';
import { renderEmailShell, escapeMarkdown } from './_layouts/email-shell.js';

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
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: `Węzeł ${ctx.nodeName} nie odpowiada`,
    preheader: 'Brak heartbeatu z węzła — możliwa awaria/utrata łączności.',
    bodyMarkdown: [
      greeting,
      ``,
      `**Węzeł \`${escapeMarkdown(ctx.nodeName)}\` przestał wysyłać heartbeat** do control-plane. Konta na tym węźle mogą być niedostępne.`,
      ``,
      `- **Węzeł:** ${escapeMarkdown(ctx.nodeName)} (\`${escapeMarkdown(ctx.nodeId)}\`)`,
      `- **Ostatnio widziany:** ${ctx.lastSeenAt ? escapeMarkdown(fmt(ctx.lastSeenAt)) : '—'}`,
      ``,
      `## Co zrobić`,
      ``,
      `1. Sprawdź dostępność węzła (ping/SSH/panel dostawcy).`,
      `2. Jeśli to awaria — rozważ przełączenie ruchu / przywrócenie kont z backupu off-node.`,
      `3. Status floty i kont znajdziesz w panelu admina.`,
    ].join('\n'),
    cta: { label: 'Otwórz panel floty', url: `${ctx.panelUrl}/nodes` },
    footnote: 'Alert wysyłany raz na incydent (z cooldownem). Otrzymują go wszyscy administratorzy.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'ops.node-offline', subject: `[Verris] ⚠️ Węzeł ${ctx.nodeName} nie odpowiada`, text, html };
}

export function nodeRecoveredTemplate(ctx: NodeOfflineContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: `Węzeł ${ctx.nodeName} znów online`,
    preheader: 'Heartbeat wrócił — węzeł odpowiada.',
    bodyMarkdown: [
      greeting,
      ``,
      `Dobre wieści: **węzeł \`${escapeMarkdown(ctx.nodeName)}\` znów wysyła heartbeat** i jest online.`,
      ``,
      `- **Węzeł:** ${escapeMarkdown(ctx.nodeName)} (\`${escapeMarkdown(ctx.nodeId)}\`)`,
      `- **Czas:** ${escapeMarkdown(fmt(new Date()))}`,
      ``,
      `Zweryfikuj, czy konta działają poprawnie i czy backupy są aktualne.`,
    ].join('\n'),
    cta: { label: 'Otwórz panel floty', url: `${ctx.panelUrl}/nodes` },
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
  /** Z-15 — realne zużycie względem pojemności fizycznej po headroomie; null = brak świeżej telemetrii. */
  physical?: { cpu: number; ram: number; disk: number } | null;
  accounts: number;
  maxAccounts: number | null;
  /** Czy watchdog automatycznie ustawił cordon. */
  autoCordoned: boolean;
  panelUrl: string;
}

export function nodeCapacityAlertTemplate(ctx: NodeCapacityContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: `Węzeł ${ctx.nodeName} blisko zapełnienia`,
    preheader: `Obłożenie ${ctx.topUtilizationPct}% — rozważ dodanie węzła.`,
    bodyMarkdown: [
      greeting,
      ``,
      `**Węzeł \`${escapeMarkdown(ctx.nodeName)}\` zbliża się do limitu pojemności.**`,
      ``,
      `- **Węzeł:** ${escapeMarkdown(ctx.nodeName)} (\`${escapeMarkdown(ctx.nodeId)}\`)`,
      `- **Sprzedane** (względem pojemności z nadsubskrypcją): CPU ${ctx.cpuPct}% · RAM ${ctx.ramPct}% · Dysk ${ctx.diskPct}%`,
      ctx.physical
        ? `- **Realne zużycie** (względem pojemności fizycznej po rezerwie; przy 100% węzeł przestaje przyjmować konta): CPU ${ctx.physical.cpu}% · RAM ${ctx.physical.ram}% · Dysk ${ctx.physical.disk}%`
        : `- **Realne zużycie:** brak świeżej telemetrii z węzła`,
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
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const verdict = ctx.go
    ? '🟢 **GO** — brak blokerów startu.'
    : '🔴 **NO-GO** — są blokery do usunięcia.';
  const failLines = ctx.readinessFails.length
    ? ctx.readinessFails.map((f) => `- ❌ ${escapeMarkdown(f)}`)
    : ['- _(brak)_'];
  const warnLines = ctx.readinessWarns.length
    ? ctx.readinessWarns.map((w) => `- ⚠️ ${escapeMarkdown(w)}`)
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
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const zonesList = ctx.zones.map((z) => `- \`${escapeMarkdown(z)}\``).join('\n');
  const { html, text } = renderEmailShell({
    title: `IP węzła ${ctx.nodeName} trafiło na blacklistę`,
    preheader: 'Reputacja IP zagrożona — może to wpłynąć na dostarczalność poczty.',
    bodyMarkdown: [
      greeting,
      ``,
      `**IP \`${escapeMarkdown(ctx.ip)}\` (węzeł ${escapeMarkdown(ctx.nodeName)}) figuruje na blacklistach DNS (RBL).** Poczta wychodząca z kont na tym węźle może być odrzucana lub trafiać do spamu.`,
      ``,
      `- **Węzeł:** ${escapeMarkdown(ctx.nodeName)} (\`${escapeMarkdown(ctx.nodeId)}\`)`,
      `- **IP:** ${escapeMarkdown(ctx.ip)}`,
      `- **Wykryto na:**`,
      zonesList,
      ``,
      `## Co zrobić`,
      ``,
      `1. Sprawdź, czy żadne konto nie zostało przejęte/nie wysyła spamu (logi SMTP, kolejka).`,
      `2. Złóż wniosek o delisting w danym RBL (Spamhaus/Spamcop/Barracuda/SORBS).`,
      `3. Zweryfikuj SPF/DKIM/DMARC i rate-limit wysyłki na węźle.`,
    ].join('\n'),
    cta: { label: 'Otwórz panel floty', url: `${ctx.panelUrl}/nodes` },
    footnote: 'Alert wysyłany raz na incydent (cooldown 12h). Otrzymują go wszyscy administratorzy.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'ops.node-rbl', subject: `[Verris] ⚠️ IP węzła ${ctx.nodeName} na blacklistcie (RBL)`, text, html };
}

export function nodeRblClearedTemplate(ctx: NodeRblContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: `IP węzła ${ctx.nodeName} czyste`,
    preheader: 'IP zniknęło z blacklist — reputacja przywrócona.',
    bodyMarkdown: [
      greeting,
      ``,
      `Dobre wieści: **IP \`${escapeMarkdown(ctx.ip)}\` (węzeł ${escapeMarkdown(ctx.nodeName)}) nie figuruje już na sprawdzanych blacklistach.**`,
      ``,
      `- **Węzeł:** ${escapeMarkdown(ctx.nodeName)} (\`${escapeMarkdown(ctx.nodeId)}\`)`,
      `- **Czas:** ${escapeMarkdown(fmt(new Date()))}`,
      ``,
      `Monitoruj dostarczalność przez kolejne dni, aby upewnić się, że reputacja jest stabilna.`,
    ].join('\n'),
    cta: { label: 'Otwórz panel floty', url: `${ctx.panelUrl}/nodes` },
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
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: `Rośnie odsetek nieudanych maili (${ctx.ratePct}%)`,
    preheader: 'Wysyłka poczty systemowej zawodzi — sprawdź konfigurację SMTP.',
    bodyMarkdown: [
      greeting,
      ``,
      `**W ostatnich ${ctx.windowMinutes} min ${ctx.failed} z ${ctx.total} maili zakończyło się statusem FAILED (${ctx.ratePct}%).** Powiadomienia (reset hasła, faktury, alerty) mogą nie docierać do klientów.`,
      ``,
      ctx.topError ? `- **Najczęstszy błąd:** \`${escapeMarkdown(ctx.topError)}\`` : `- Szczegóły błędów w dzienniku EmailLog.`,
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
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: 'Zdarzenie płatności nie zostało obsłużone',
    preheader: `Stripe ${escapeMarkdown(ctx.typ)} — ${ctx.proby} nieudane próby.`,
    bodyMarkdown: [
      greeting,
      ``,
      `**Zdarzenie webhooka Stripe'a nie zostało obsłużone** mimo ${ctx.proby} prób.`,
      `Jeżeli dotyczy doładowania albo opłaty za subskrypcję, pieniądze mogły` +
        ` zostać pobrane, a saldo albo aktywacja nie nastąpiły.`,
      ``,
      `- **Zdarzenie:** \`${escapeMarkdown(ctx.eventId)}\``,
      `- **Typ:** ${escapeMarkdown(ctx.typ)}`,
      `- **Pierwsza dostawa:** ${escapeMarkdown(fmt(ctx.pierwszyRaz))}`,
      `- **Liczba prób:** ${ctx.proby}`,
      ``,
      `**Ostatni błąd:**`,
      ``,
      '```',
      escapeMarkdown(ctx.ostatniBlad ?? '(brak treści błędu)'),
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

// -----------------------------------------------------------------------------
// Z-01 — faktura powstała, ale nie udało się jej dokończyć
// -----------------------------------------------------------------------------

export interface FakturaNiedokonczonaContext {
  to: string;
  firstName: string | null;
  numer: string;
  kwota: string;
  proby: number;
  wystawiona: Date;
  ostatniBlad: string | null;
  panelUrl: string;
}

/**
 * Alert o fakturze bez PDF-u.
 *
 * Pieniądze są pobrane poprawnie — brakuje dokumentu. Ton odpowiednio spokojny,
 * ale termin jest ustawowy, więc podany wprost.
 */
export function fakturaNiedokonczonaTemplate(ctx: FakturaNiedokonczonaContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: `Faktura ${ctx.numer} nie ma pliku PDF`,
    preheader: `${ctx.proby} nieudane próby wygenerowania dokumentu.`,
    bodyMarkdown: [
      greeting,
      ``,
      `**Faktura \`${escapeMarkdown(ctx.numer)}\` istnieje w bazie, ale nie udało się wygenerować`,
      `jej pliku PDF** mimo ${ctx.proby} prób. Klient jej nie dostał i nie pobierze jej z panelu.`,
      ``,
      `Pieniądze zostały pobrane poprawnie — brakuje wyłącznie dokumentu.`,
      ``,
      `- **Numer:** ${escapeMarkdown(ctx.numer)}`,
      `- **Kwota:** ${escapeMarkdown(ctx.kwota)}`,
      `- **Wystawiona:** ${escapeMarkdown(fmt(ctx.wystawiona))}`,
      `- **Prób:** ${ctx.proby}`,
      ``,
      `**Ostatni błąd:**`,
      ``,
      '```',
      escapeMarkdown(ctx.ostatniBlad ?? '(brak treści błędu)'),
      '```',
      ``,
      `## Co zrobić`,
      ``,
      `1. Najczęstsza przyczyna to niedostępny MinIO albo brak danych sprzedawcy`,
      `   w ustawieniach platformy — sprawdź jedno i drugie.`,
      `2. Po usunięciu przyczyny job spróbuje ponownie sam; można też wymusić`,
      `   z listy faktur w panelu.`,
      ``,
      `**Termin jest ustawowy:** fakturę trzeba wystawić do 15. dnia miesiąca`,
      `następującego po miesiącu sprzedaży.`,
    ].join('\n'),
    cta: { label: 'Otwórz faktury', url: `${ctx.panelUrl}/invoices` },
    footnote:
      'Alert wysyłany najwyżej raz na dobę dla tej samej faktury. Otrzymują go wszyscy administratorzy.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return {
    to: ctx.to,
    tag: 'ops.faktura-niedokonczona',
    subject: `[Verris] 📄 Faktura ${ctx.numer} bez pliku PDF`,
    text,
    html,
  };
}

// -----------------------------------------------------------------------------
// H-20 — próba odtworzenia z kopii wymaga powtórzenia
// -----------------------------------------------------------------------------

export interface ProbaOdtworzeniaContext {
  to: string;
  firstName: string | null;
  stan: 'brak' | 'nieudana' | 'przeterminowana' | 'wkrotce';
  komunikat: string;
  wiekDni: number | null;
  blokuje: boolean;
  panelUrl: string;
}

/**
 * Alert o stanie próby odtworzenia.
 *
 * Ton zależy od tego, czy pozycja zatrzymuje start sprzedaży. Przypomnienie
 * siedem dni przed terminem ma brzmieć jak przypomnienie; brak jakiejkolwiek
 * próby ma brzmieć jak to, czym jest — backupy bez potwierdzonego odtworzenia
 * to założenie, nie zabezpieczenie.
 */
export function probaOdtworzeniaTemplate(ctx: ProbaOdtworzeniaContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const tytul = ctx.blokuje
    ? 'Warstwa DR jest niepotwierdzona'
    : 'Próba odtworzenia z kopii wymaga powtórzenia';

  const { html, text } = renderEmailShell({
    title: tytul,
    preheader: escapeMarkdown(ctx.komunikat.slice(0, 120)),
    bodyMarkdown: [
      greeting,
      ``,
      ctx.blokuje
        ? `**${escapeMarkdown(tytul)}** — i to jest twarda bramka startu sprzedaży, nie ostrzeżenie.`
        : `**${escapeMarkdown(tytul)}.**`,
      ``,
      escapeMarkdown(ctx.komunikat),
      ``,
      `## Jak wykonać próbę`,
      ``,
      'Na control-plane, jednym poleceniem:',
      ``,
      '```',
      'cd /opt/verris && ./ops/scripts/restore-drill-isolated.sh --owner "Imię Nazwisko"',
      '```',
      ``,
      `Skrypt odtwarza kopię do OSOBNEJ bazy — produkcyjna nie jest dotykana. Sprawdza`,
      `liczby wierszy w tabelach kontrolnych i zapisuje wynik razem z czasem trwania.`,
      `Ten czas to Twoje realne RTO; warto go znać przed awarią, a nie w jej trakcie.`,
      ``,
      `Wynik — udany albo nie — pojawi się w panelu admina w gotowości do startu.`,
    ].join('\n'),
    cta: { label: 'Otwórz gotowość do startu', url: `${ctx.panelUrl}/settings/live-readiness` },
    footnote:
      'Backupy i DR wymagają poziomu dowodu D4: data, wynik i właściciel. Alert wysyłany raz na dobę do wszystkich administratorów.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return {
    to: ctx.to,
    tag: 'ops.proba-odtworzenia',
    subject: ctx.blokuje
      ? '[Verris] 🔴 Warstwa DR niepotwierdzona — próba odtworzenia'
      : '[Verris] 🗄️ Zaplanuj próbę odtworzenia z kopii',
    text,
    html,
  };
}

export interface ProgOssContext {
  to: string;
  firstName: string | null;
  sprzedazPln: string;
  procent: number;
  przekroczony: boolean;
  panelUrl: string;
}

/** M-09 — sprzedaż usług elektronicznych konsumentom z UE zbliża się do progu 42 000 zł / go przekroczyła. */
export function progOssTemplate(ctx: ProgOssContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeMarkdown(ctx.firstName)}**,` : 'Cześć,';
  const { html, text } = renderEmailShell({
    title: ctx.przekroczony ? 'Próg OSS przekroczony' : `Próg OSS: ${ctx.procent}%`,
    preheader: `Sprzedaż konsumentom z UE: ${ctx.sprzedazPln} zł z 42 000 zł.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Sprzedaż usług Verris konsumentom z innych krajów UE (rok bieżący albo poprzedni) wynosi **${escapeMarkdown(ctx.sprzedazPln)} zł** — **${ctx.procent}%** progu 42 000 zł (art. 28k ustawy o VAT).`,
      ``,
      ctx.przekroczony
        ? `Od przekroczenia progu takie usługi opodatkowuje się w kraju klienta. Panel nadal wystawia dokumenty z 23%, bo OSS nie jest włączony — **zarejestruj się w VAT OSS i włącz ustawienie \`vat.ossWlaczone\`**, a panel zacznie stosować stawki krajów klientów.`
        : `Po przekroczeniu progu trzeba będzie stosować stawki krajów klientów przez VAT OSS. Warto złożyć zgłoszenie z wyprzedzeniem.`,
      ``,
      `Skonsultuj termin rejestracji z księgową.`,
    ].join('\n'),
    cta: { label: 'Otwórz panel admina', url: ctx.panelUrl },
    footnote: 'Alert wysyłany raz na próg (80% i 100%) w danym roku.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return { to: ctx.to, tag: 'ops.prog-oss', subject: `[Verris] ${ctx.przekroczony ? 'Próg OSS przekroczony' : `Próg OSS: ${ctx.procent}%`}`, text, html };
}
