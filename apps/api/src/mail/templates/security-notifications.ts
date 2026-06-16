import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

/**
 * Security email templates — Sprint 2.5.
 *
 * Wszystkie maile w tym module są **kategorii TRANSACTIONAL** (security-critical
 * notifications) — usery nie mogą się z nich wypisać, bo wymaga tego nasza
 * polityka bezpieczeństwa (i zdrowy rozsądek). Maile te są częścią warstwy
 * obrony przed account takeover (ATO):
 *
 *  1. `new-device-login`  — login z nowego urządzenia/IP, użytkownik
 *     dostaje 30s heads-up by zorientować się że ktoś inny się logował.
 *  2. `2fa-enabled`       — potwierdzenie aktywacji 2FA + recovery codes.
 *  3. `2fa-disabled`      — alert o wyłączeniu 2FA (atakujący próbujący
 *     je zdjąć).
 *  4. `password-changed`  — alert o zmianie hasła (ATO red flag).
 *
 * Każdy zawiera **link do zerwania sesji + reset hasła** w panelu, więc
 * legit user może natychmiast zareagować jeśli to nie była jego akcja.
 */

const DATETIME_FORMATTER = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Warsaw',
});

function formatDateTime(d: Date): string {
  return DATETIME_FORMATTER.format(d) + ' (czasu polskiego)';
}

// ---------------------------------------------------------------------------
// 1. new-device-login
// ---------------------------------------------------------------------------

export interface NewDeviceLoginContext {
  to: string;
  firstName: string | null;
  /** When the suspicious login happened (server time). */
  loginAt: Date;
  /** Best-effort string description (e.g. "Chrome 120 on macOS"). May be null. */
  deviceLabel: string | null;
  /** Public IP address — surface raw, no anonymization (security context). */
  ipAddress: string | null;
  /** Two-letter ISO country code from GeoIP — null if unavailable. */
  countryCode: string | null;
  panelUrl: string;
}

export function newDeviceLoginTemplate(ctx: NewDeviceLoginContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';
  const deviceLine = ctx.deviceLabel
    ? `- **Urządzenie:** ${escapeHtml(ctx.deviceLabel)}`
    : `- **Urządzenie:** _(nieustalone)_`;
  const locationLine =
    ctx.ipAddress && ctx.countryCode
      ? `- **Lokalizacja:** ${escapeHtml(ctx.ipAddress)} (${escapeHtml(ctx.countryCode)})`
      : ctx.ipAddress
      ? `- **IP:** ${escapeHtml(ctx.ipAddress)}`
      : `- **IP:** _(nieustalone)_`;

  const { html, text } = renderEmailShell({
    title: 'Nowe logowanie do Twojego konta',
    preheader: 'Wykryliśmy logowanie z nieznanego urządzenia.',
    bodyMarkdown: [
      greeting,
      ``,
      `Wykryliśmy **logowanie do Twojego konta Verris z nieznanego wcześniej urządzenia lub lokalizacji**. Jeśli to byłeś Ty — możesz zignorować tego maila. Jeśli **nie**, **natychmiast zabezpiecz konto**.`,
      ``,
      `## Szczegóły logowania`,
      ``,
      `- **Czas:** ${escapeHtml(formatDateTime(ctx.loginAt))}`,
      deviceLine,
      locationLine,
      ``,
      `## Co zrobić, jeśli to nie byłeś Ty?`,
      ``,
      `1. **Natychmiast zmień hasło** w panelu (Ustawienia → Bezpieczeństwo).`,
      `2. **Wyloguj wszystkie aktywne sesje** — w panelu jest taki przycisk.`,
      `3. **Włącz dwuskładnikowe uwierzytelnianie (2FA)**, jeśli jeszcze go nie masz.`,
      `4. Sprawdź **historię logowania** i zgłoś podejrzaną aktywność na ${escapeHtml(
        'support@verris.pl',
      )}.`,
    ].join('\n'),
    cta: {
      label: 'Zabezpiecz konto',
      url: `${ctx.panelUrl}/settings/security`,
    },
    footnote:
      'Ten alert wysyłamy raz na nowe urządzenie/IP — nie da się go wyłączyć, bo jest częścią ochrony konta.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'security.new-device-login',
    subject: '[Verris] Nowe logowanie do Twojego konta',
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 2. 2fa-enabled
// ---------------------------------------------------------------------------

export interface TwoFactorEnabledContext {
  to: string;
  firstName: string | null;
  enrolledAt: Date;
  /** Recovery codes (10 jednorazowych). NIE wysyłamy ich ponownie później. */
  recoveryCodes: string[];
  panelUrl: string;
}

export function twoFactorEnabledTemplate(ctx: TwoFactorEnabledContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';
  const codesBlock = ctx.recoveryCodes
    .map((code) => `- \`${escapeHtml(code)}\``)
    .join('\n');

  const { html, text } = renderEmailShell({
    title: 'Dwuskładnikowe uwierzytelnianie aktywne',
    preheader: 'Konto Verris jest teraz zabezpieczone 2FA.',
    bodyMarkdown: [
      greeting,
      ``,
      `**2FA zostało aktywowane** dla Twojego konta Verris. Od teraz przy każdym logowaniu poprosimy Cię o **6-cyfrowy kod z aplikacji uwierzytelniającej** (Google Authenticator, Authy, 1Password itp.).`,
      ``,
      `**Czas aktywacji:** ${escapeHtml(formatDateTime(ctx.enrolledAt))}.`,
      ``,
      `## Kody odzyskiwania (zapisz je teraz!)`,
      ``,
      `Poniżej znajdziesz **${ctx.recoveryCodes.length} jednorazowych kodów odzyskiwania**. Każdy z nich można użyć **raz**, jeśli stracisz dostęp do aplikacji uwierzytelniającej (zgubiony telefon, kradzież).`,
      ``,
      codesBlock,
      ``,
      `**Zapisz je w bezpiecznym miejscu** — np. w menedżerze haseł lub wydrukuj i schowaj. **Nie wysyłamy ich ponownie**. Możesz je w każdej chwili zregenerować w panelu (poprzednie zostaną unieważnione).`,
      ``,
      `## Co dalej?`,
      ``,
      `- Przy następnym logowaniu, po wpisaniu hasła, podasz kod z aplikacji.`,
      `- Jeśli zgubisz dostęp do aplikacji — użyj kodu odzyskiwania powyżej.`,
      `- W każdej chwili możesz wyłączyć 2FA w panelu (ale **nie zalecamy** — to znacznie obniża bezpieczeństwo).`,
    ].join('\n'),
    cta: {
      label: 'Zarządzaj 2FA w panelu',
      url: `${ctx.panelUrl}/settings/security/two-factor`,
    },
    footnote:
      'Kody odzyskiwania działają jak hasła — traktuj je z odpowiednią ostrożnością.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'security.2fa-enabled',
    subject: '[Verris] 2FA aktywne — zapisz kody odzyskiwania',
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 3. 2fa-disabled
// ---------------------------------------------------------------------------

export interface TwoFactorDisabledContext {
  to: string;
  firstName: string | null;
  disabledAt: Date;
  panelUrl: string;
}

export function twoFactorDisabledTemplate(ctx: TwoFactorDisabledContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';

  const { html, text } = renderEmailShell({
    title: 'Dwuskładnikowe uwierzytelnianie zostało WYŁĄCZONE',
    preheader: '2FA jest nieaktywne — Twoje konto chroni już tylko hasło.',
    bodyMarkdown: [
      greeting,
      ``,
      `**Dwuskładnikowe uwierzytelnianie (2FA) zostało wyłączone** dla Twojego konta Verris. To znaczy, że od teraz przy logowaniu nie będziemy już prosić o kod z aplikacji uwierzytelniającej — Twoje konto **chroni tylko hasło**.`,
      ``,
      `**Czas wyłączenia:** ${escapeHtml(formatDateTime(ctx.disabledAt))}.`,
      ``,
      `## Czy to byłeś Ty?`,
      ``,
      `Jeśli **nie wyłączałeś 2FA** — Twoje konto może być zagrożone. Wykonaj **natychmiast** następujące kroki:`,
      ``,
      `1. **Zmień hasło** (Ustawienia → Bezpieczeństwo → Zmień hasło).`,
      `2. **Włącz 2FA ponownie** — to jedyny skuteczny sposób ochrony przed przejęciem konta.`,
      `3. **Wyloguj wszystkie aktywne sesje** w panelu.`,
      `4. Skontaktuj się z nami: ${escapeHtml('support@verris.pl')}.`,
      ``,
      `Jeśli to Ty wyłączyłeś 2FA świadomie — **rekomendujemy ponowne włączenie**. To jedna z najsilniejszych metod ochrony przed kradzieżą konta, a kosztuje 30 sekund konfiguracji.`,
    ].join('\n'),
    cta: {
      label: 'Włącz 2FA ponownie',
      url: `${ctx.panelUrl}/settings/security/two-factor`,
    },
    footnote:
      'Bez 2FA jedyną przeszkodą dla atakującego jest siła Twojego hasła. Zalecamy menedżer haseł.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'security.2fa-disabled',
    subject: '[Verris] 2FA WYŁĄCZONE — czy to byłeś Ty?',
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 4. password-changed
// ---------------------------------------------------------------------------

export interface PasswordChangedContext {
  to: string;
  firstName: string | null;
  changedAt: Date;
  /** Best-effort string description of the device that made the change. */
  deviceLabel: string | null;
  ipAddress: string | null;
  panelUrl: string;
}

export function passwordChangedTemplate(ctx: PasswordChangedContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';
  const deviceLine = ctx.deviceLabel
    ? `- **Urządzenie:** ${escapeHtml(ctx.deviceLabel)}`
    : null;
  const ipLine = ctx.ipAddress ? `- **IP:** ${escapeHtml(ctx.ipAddress)}` : null;
  const detailLines = [deviceLine, ipLine].filter((l): l is string => l !== null);

  const { html, text } = renderEmailShell({
    title: 'Hasło do konta zostało zmienione',
    preheader: 'Potwierdzenie zmiany hasła w Verris.',
    bodyMarkdown: [
      greeting,
      ``,
      `**Hasło do Twojego konta Verris zostało zmienione**. Wysyłamy ten mail jako standardowe potwierdzenie — Twoje konto pozostaje bezpieczne, jeśli to **Ty** wykonałeś tę akcję.`,
      ``,
      `**Czas zmiany:** ${escapeHtml(formatDateTime(ctx.changedAt))}.`,
      ...(detailLines.length > 0 ? ['', ...detailLines] : []),
      ``,
      `## Czy to NIE byłeś Ty?`,
      ``,
      `Jeśli nie zmieniałeś hasła — **Twoje konto zostało prawdopodobnie przejęte**. Wykonaj te kroki **natychmiast**:`,
      ``,
      `1. Skorzystaj z linku „Nie pamiętam hasła" na stronie logowania, żeby **odzyskać kontrolę** nad kontem.`,
      `2. Po zalogowaniu **wyloguj wszystkie sesje** (Ustawienia → Bezpieczeństwo).`,
      `3. **Włącz 2FA**, jeśli jeszcze go nie masz.`,
      `4. Napisz do nas: ${escapeHtml('support@verris.pl')} — pomożemy zabezpieczyć konto i sprawdzić, czy nie doszło do nieuprawnionych zmian.`,
    ].join('\n'),
    cta: {
      label: 'Otwórz ustawienia bezpieczeństwa',
      url: `${ctx.panelUrl}/settings/security`,
    },
    footnote:
      'Ten alert otrzymujesz przy każdej zmianie hasła — nie da się go wyłączyć (security-critical).',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'security.password-changed',
    subject: '[Verris] Hasło do konta zostało zmienione',
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 5. break-glass codes issued (privileged passkey fallback)
// ---------------------------------------------------------------------------

export interface BreakGlassCodesIssuedContext {
  to: string;
  firstName: string | null;
  issuedAt: Date;
  count: number;
  panelUrl: string;
}

export function breakGlassCodesIssuedTemplate(
  ctx: BreakGlassCodesIssuedContext,
): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';
  const { html, text } = renderEmailShell({
    title: 'Wygenerowano awaryjne kody logowania (break-glass)',
    preheader: 'Nowy zestaw kodów awaryjnych dla Twojego konta.',
    bodyMarkdown: [
      greeting,
      ``,
      `Dla Twojego konta **wygenerowano ${ctx.count} jednorazowych kodów awaryjnych (break-glass)**. Służą one wyłącznie do logowania, gdy **nie masz przy sobie passkey** — wymagają dodatkowo hasła i kodu 2FA.`,
      ``,
      `**Czas wygenerowania:** ${escapeHtml(formatDateTime(ctx.issuedAt))}.`,
      ``,
      `## Zasady`,
      ``,
      `1. Każdy kod **działa tylko raz**. Stary zestaw został właśnie unieważniony.`,
      `2. Użycie kodu **powiadamia wszystkich administratorów** i trafia do logu audytu.`,
      `3. Przechowuj kody **offline** (np. w menedżerze haseł), nigdy w skrzynce e-mail.`,
      ``,
      `Jeśli to **nie Ty** wygenerowałeś kody — Twoje konto mogło zostać przejęte. Natychmiast zmień hasło, wyloguj wszystkie sesje i napisz na ${escapeHtml('security@verris.pl')}.`,
    ].join('\n'),
    cta: { label: 'Ustawienia bezpieczeństwa', url: `${ctx.panelUrl}/settings/security` },
    footnote:
      'Same kody pokazujemy tylko raz, w panelu, w momencie generowania — nie wysyłamy ich mailem.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return {
    to: ctx.to,
    tag: 'security.break-glass-issued',
    subject: '[Verris] Wygenerowano awaryjne kody logowania',
    text,
    html,
  };
}

// ---------------------------------------------------------------------------
// 6. break-glass used — alert to every admin
// ---------------------------------------------------------------------------

export interface BreakGlassUsedAlertContext {
  to: string;
  firstName: string | null;
  /** The account that performed the break-glass login. */
  accountEmail: string;
  role: string;
  usedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  remaining: number;
  panelUrl: string;
}

export function breakGlassUsedAlertTemplate(
  ctx: BreakGlassUsedAlertContext,
): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**!` : 'Cześć!';
  const ipLine = ctx.ipAddress
    ? `- **IP:** ${escapeHtml(ctx.ipAddress)}`
    : `- **IP:** _(nieustalone)_`;
  const uaLine = ctx.userAgent
    ? `- **Klient:** ${escapeHtml(ctx.userAgent)}`
    : null;
  const { html, text } = renderEmailShell({
    title: 'Użyto awaryjnego logowania break-glass',
    preheader: `Konto ${ctx.accountEmail} zalogowało się kodem awaryjnym.`,
    bodyMarkdown: [
      greeting,
      ``,
      `**Uwaga bezpieczeństwa.** Konto uprzywilejowane właśnie zalogowało się **z pominięciem passkey**, używając awaryjnego kodu break-glass (hasło + 2FA + jednorazowy kod).`,
      ``,
      `## Szczegóły`,
      ``,
      `- **Konto:** ${escapeHtml(ctx.accountEmail)} (${escapeHtml(ctx.role)})`,
      `- **Czas:** ${escapeHtml(formatDateTime(ctx.usedAt))}`,
      ipLine,
      ...(uaLine ? [uaLine] : []),
      `- **Pozostałe kody:** ${ctx.remaining}`,
      ``,
      `Jeśli to **zaplanowana** akcja (np. utrata urządzenia z passkey) — możesz zignorować ten alert. Jeśli **nie** — potraktuj to jako możliwe przejęcie konta: zablokuj konto, wymuś reset hasła i przejrzyj log audytu.`,
    ].join('\n'),
    cta: { label: 'Otwórz log audytu', url: `${ctx.panelUrl}/security/audit` },
    footnote:
      'Ten alert otrzymuje każdy administrator przy każdym użyciu kodu break-glass — nie da się go wyłączyć.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });
  return {
    to: ctx.to,
    tag: 'security.break-glass-used',
    subject: '[Verris] ⚠️ Użyto awaryjnego logowania (break-glass)',
    text,
    html,
  };
}
