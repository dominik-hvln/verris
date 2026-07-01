/**
 * E-3+ / Sprint 3 fundament — wspólny szablon maili Verris.
 *
 * Każdy mail (welcome, faktura, period-ending, ticket, …) renderujemy przez
 * `renderEmailShell({ ... })`, żeby:
 *
 *  1. Brand i typografia są spójne — jeden punkt zmian designu.
 *  2. Footer compliance (dane administratora, link do polityki, unsubscribe)
 *     zawsze obecny — wymóg RODO i pre-warunek deliverability (DMARC).
 *  3. Plaintext fallback generowany automatycznie z tych samych danych —
 *     `multipart/alternative` poprawia score u Gmail/Outlook.
 *
 * Stylowanie inline, bez `<style>` blocku ani tagów `<head>`-only — to
 * konwencja maili HTML, bo wielu klientów mailowych (Outlook desktop,
 * Apple Mail starsze wersje) nie ładuje zewnętrznych ani `<style>`
 * stylesheet'ów konsekwentnie. Layout tabela-based również z tego powodu.
 *
 * Świadomie nie używamy `marked`/`markdown-it` — templates są kontrolowane
 * przez nas (nie userzy), więc minimalistyczny parser wystarcza i nie ma
 * ryzyka XSS-a. Gdy w Sprincie 3 dojdą template'y z dynamic data od user'a
 * (np. zacytowana wiadomość ticket), trzeba dodać escape na poziomie
 * `data` przekazanego do template (już robimy w `escapeHtml`).
 */

export interface EmailShellInput {
  /** Główny nagłówek widoczny pod brandingiem (max ~60 znaków). */
  title: string;
  /**
   * Preheader — pierwszy tekst widoczny w preview u dostawców (Gmail, Inbox).
   * Krótki summary akcji, max ~100 znaków. Nie wyświetla się w treści maila.
   */
  preheader?: string;
  /**
   * Treść maila w naszym minimalistycznym Markdown:
   *   `# H2`, `## H3`, paragrafy oddzielone podwójnym `\n`,
   *   `**bold**`, `*italic*`, `[label](url)`, listy `- item`.
   * Zmienne user'a (np. imię) wstawiać po wcześniejszym `escapeHtml`.
   */
  bodyMarkdown: string;
  /** Opcjonalny CTA przycisk pod treścią. */
  cta?: {
    label: string;
    url: string;
  };
  /**
   * Krótka notatka pod CTA (np. „Link wygasa za 24 godziny" albo
   * „Jeśli to nie Ty, zignoruj tego maila").
   */
  footnote?: string;
  /** Adres odbiorcy — wyświetlany w stopce „Wysłano na: ..." dla audytu. */
  recipientEmail: string;
  /** Adres URL panelu klienta (do linków w stopce). */
  panelUrl: string;
  /**
   * Kategoria maila — dla `MARKETING`/`PRODUCT_UPDATE` doklejamy explicit
   * link „Wypisz się jednym kliknięciem" + nagłówek `List-Unsubscribe`
   * (handled w `TransactionalMailerService`). Default: `TRANSACTIONAL`.
   */
  category?: 'TRANSACTIONAL' | 'SECURITY' | 'MARKETING' | 'PRODUCT_UPDATE';
}

export interface EmailShellOutput {
  /** HTML body — single string with inline styles. */
  html: string;
  /** Plain-text body — generowany z `bodyMarkdown` po stripie składni. */
  text: string;
}

// ------------------------------------------------------------------ palette

/**
 * Barwy spójne z KV panelu Verris (motyw eko/zielony). Źródło prawdy:
 * globals.css paneli — pine/green/mint/paper. Nagłówek maila = ciemny pine
 * (jak sidebar panelu), treść na jasnym „paper" dla czytelności.
 */
const PALETTE = {
  text: '#0c1a14', // verris-pine
  textSecondary: '#3f4a44',
  textMuted: '#737d77',
  background: '#f4f4ee', // verris-paper
  card: '#ffffff',
  border: '#e3e3da',
  borderStrong: '#d3d3c8',
  accent: '#0f7a52', // verris-green (primary)
  accentHover: '#0b5d3e',
  accentSurface: '#eaf7f0', // jasny mint tint
  // Nagłówek (KV) — ciemny gradientowy pine z mint akcentem.
  headerBg: '#0c1a14', // verris-pine
  headerBgAlt: '#0e1f17', // verris-card
  onDark: '#f4f4ee', // paper na ciemnym
  onDarkMuted: '#9aa39c', // verris-stone
  mint: '#34e5a0', // verris-mint (akcent znaku)
  success: '#0f7a52',
  warning: '#b45309',
  danger: '#b91c1c',
} as const;

// ------------------------------------------------------------------ helpers

/** Escape do bezpiecznego umieszczania w atrybutach i tekście HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Bardzo prosty parser inline-markdown na potrzeby naszych templates. */
function renderInline(input: string): string {
  let out = escapeHtml(input);
  // Linki [label](url) — wymuszamy https:, blokujemy javascript:, mailto: ok.
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, rawUrl: string) => {
    const url = rawUrl.trim();
    const safe = /^(https?:|mailto:)/i.test(url) ? url : '#';
    return `<a href="${escapeHtml(safe)}" style="color:${PALETTE.accent};text-decoration:underline;">${label}</a>`;
  });
  // **bold**
  out = out.replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${PALETTE.text};">$1</strong>`);
  // *italic*
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // `code`
  out = out.replace(/`([^`]+)`/g, `<code style="background:${PALETTE.accentSurface};color:${PALETTE.text};padding:1px 6px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.9em;">$1</code>`);
  return out;
}

/** Render block-level markdown — minimalny zestaw potrzebny dla maili. */
function renderBlocks(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      out.push(
        `<h3 style="margin:24px 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:600;color:${PALETTE.text};line-height:1.4;">${renderInline(line.slice(3))}</h3>`,
      );
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      out.push(
        `<h2 style="margin:24px 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:18px;font-weight:700;color:${PALETTE.text};line-height:1.4;">${renderInline(line.slice(2))}</h2>`,
      );
      i++;
      continue;
    }
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(`<li style="margin:4px 0;">${renderInline(lines[i].slice(2))}</li>`);
        i++;
      }
      out.push(
        `<ul style="margin:12px 0;padding-left:22px;color:${PALETTE.textSecondary};font-size:15px;line-height:1.6;">${items.join('')}</ul>`,
      );
      continue;
    }
    // paragraph: skleja kolejne linie aż do pustej
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('# ') && !lines[i].startsWith('- ')) {
      buf.push(lines[i]);
      i++;
    }
    out.push(
      `<p style="margin:0 0 16px;color:${PALETTE.textSecondary};font-size:15px;line-height:1.6;">${renderInline(buf.join('\n').replace(/\n/g, '<br/>'))}</p>`,
    );
  }
  return out.join('\n');
}

/** Zamiana minimalnego markdown na czysty plaintext (bez tagów). */
function toPlaintext(markdown: string, ctx: { cta?: { label: string; url: string }; footnote?: string }): string {
  let txt = markdown
    .replace(/\r\n/g, '\n')
    .replace(/^## (.+)$/gm, '### $1')
    .replace(/^# (.+)$/gm, '## $1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
  if (ctx.cta) {
    txt += `\n\n${ctx.cta.label}: ${ctx.cta.url}`;
  }
  if (ctx.footnote) {
    txt += `\n\n${ctx.footnote}`;
  }
  return txt.trim();
}

// ------------------------------------------------------------------ shell

/**
 * Renderuje pełny mail HTML + plaintext.
 *
 * Używać:
 * ```ts
 * const { html, text } = renderEmailShell({
 *   title: 'Witamy w Verris!',
 *   preheader: 'Twoje konto zostało utworzone — zobacz, co dalej.',
 *   bodyMarkdown: `Cześć **Janie**!\n\nDzięki za rejestrację...`,
 *   cta: { label: 'Otwórz panel', url: 'https://panel.verris.pl' },
 *   footnote: 'Jeśli to nie Ty zarejestrowałeś konto, daj nam znać.',
 *   recipientEmail: 'jan@example.com',
 *   panelUrl: 'https://panel.verris.pl',
 * });
 * ```
 */
export function renderEmailShell(input: EmailShellInput): EmailShellOutput {
  const {
    title,
    preheader,
    bodyMarkdown,
    cta,
    footnote,
    recipientEmail,
    panelUrl,
    category = 'TRANSACTIONAL',
  } = input;

  const safeTitle = escapeHtml(title);
  const safePreheader = preheader ? escapeHtml(preheader) : '';
  const safeFootnote = footnote ? escapeHtml(footnote) : '';
  const bodyHtml = renderBlocks(bodyMarkdown);
  const ctaHtml = cta
    ? `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:24px 0 8px;">
         <tr>
           <td align="center" bgcolor="${PALETTE.accent}" style="border-radius:10px;">
             <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">${escapeHtml(cta.label)}</a>
           </td>
         </tr>
       </table>`
    : '';

  const footnoteHtml = footnote
    ? `<p style="margin:8px 0 0;color:${PALETTE.textMuted};font-size:13px;line-height:1.6;">${safeFootnote}</p>`
    : '';

  const unsubscribeBlock =
    category === 'MARKETING' || category === 'PRODUCT_UPDATE'
      ? `<p style="margin:8px 0 0;color:${PALETTE.textMuted};font-size:12px;line-height:1.5;">
           Otrzymujesz tego maila, ponieważ wyraziłeś zgodę na komunikację marketingową.
           <a href="${escapeHtml(panelUrl)}/dashboard/settings#powiadomienia" style="color:${PALETTE.accent};text-decoration:underline;">Wypisz się jednym kliknięciem</a>.
         </p>`
      : '';

  // Preheader — niewidoczny tekst, który Gmail/Inbox renderują w preview list.
  const preheaderTrick = safePreheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${PALETTE.background};opacity:0;">${safePreheader}</div>`
    : '';

  const html = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:${PALETTE.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${PALETTE.text};">
${preheaderTrick}
<table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="background:${PALETTE.background};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="600" style="max-width:600px;width:100%;background:${PALETTE.card};border:1px solid ${PALETTE.border};border-radius:14px;overflow:hidden;">
        <!-- Header / brand (KV: ciemny pine + mint akcent) -->
        <tr>
          <td bgcolor="${PALETTE.headerBg}" style="padding:22px 32px;background:${PALETTE.headerBg};background-image:linear-gradient(135deg,${PALETTE.headerBg} 0%,${PALETTE.headerBgAlt} 100%);border-bottom:2px solid ${PALETTE.mint};">
            <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%">
              <tr>
                <td>
                  <a href="${escapeHtml(panelUrl)}" style="text-decoration:none;">
                    <span style="display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.045em;color:${PALETTE.onDark};">verris</span><span style="display:inline-block;color:${PALETTE.mint};font-size:22px;font-weight:800;">.</span>
                  </a>
                </td>
                <td align="right">
                  <span style="display:inline-block;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${PALETTE.onDarkMuted};">Skaluj świadomie</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Title -->
        <tr>
          <td style="padding:28px 32px 8px;">
            <h1 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:22px;font-weight:700;line-height:1.3;color:${PALETTE.text};">${safeTitle}</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:8px 32px 24px;">
            ${bodyHtml}
            ${ctaHtml}
            ${footnoteHtml}
          </td>
        </tr>

        <!-- Compliance footer -->
        <tr>
          <td style="padding:20px 32px;background:${PALETTE.background};border-top:1px solid ${PALETTE.border};">
            <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%">
              <tr>
                <td>
                  <p style="margin:0 0 6px;color:${PALETTE.textSecondary};font-size:12px;line-height:1.5;font-weight:600;">Verris — skaluj świadomie</p>
                  <p style="margin:0 0 6px;color:${PALETTE.textMuted};font-size:11px;line-height:1.5;">
                    Kontakt: <a href="mailto:kontakt@verris.pl" style="color:${PALETTE.accent};text-decoration:none;">kontakt@verris.pl</a>
                    &middot; RODO: <a href="mailto:rodo@verris.pl" style="color:${PALETTE.accent};text-decoration:none;">rodo@verris.pl</a>
                  </p>
                  <p style="margin:0;color:${PALETTE.textMuted};font-size:11px;line-height:1.5;">
                    <a href="${escapeHtml(panelUrl)}/legal/privacy" style="color:${PALETTE.textMuted};text-decoration:underline;">Polityka prywatności</a>
                    &middot; <a href="${escapeHtml(panelUrl)}/legal/terms" style="color:${PALETTE.textMuted};text-decoration:underline;">Regulamin</a>
                    &middot; <a href="${escapeHtml(panelUrl)}/dashboard/settings#powiadomienia" style="color:${PALETTE.textMuted};text-decoration:underline;">Preferencje powiadomień</a>
                  </p>
                  ${unsubscribeBlock}
                  <p style="margin:12px 0 0;color:${PALETTE.textMuted};font-size:11px;line-height:1.5;">Wysłano na: ${escapeHtml(recipientEmail)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:16px 0 0;color:${PALETTE.textMuted};font-size:11px;line-height:1.5;text-align:center;">
        © ${new Date().getFullYear()} Verris &middot; Wszelkie prawa zastrzeżone
      </p>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    `Verris — ${title}`,
    preheader ? '' : null,
    preheader ?? null,
    '',
    toPlaintext(bodyMarkdown, { cta, footnote }),
    '',
    '— Zespół Verris',
    '',
    `Kontakt: kontakt@verris.pl · RODO: rodo@verris.pl`,
    `Polityka prywatności: ${panelUrl}/legal/privacy`,
    `Preferencje powiadomień: ${panelUrl}/dashboard/settings#powiadomienia`,
    `Wysłano na: ${recipientEmail}`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  return { html, text };
}
