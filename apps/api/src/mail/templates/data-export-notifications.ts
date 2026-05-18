import type { MailMessage } from '../mailer.interface';
import { renderEmailShell, escapeHtml } from './_layouts/email-shell';

const DAY_FORMATTER = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDateTimePl(d: Date): string {
  return DAY_FORMATTER.format(d).replace(',', '');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export interface DataExportReadyContext {
  to: string;
  firstName: string | null;
  downloadUrl: string;
  expiresAt: Date;
  sizeBytes: number;
  panelUrl: string;
}

export function dataExportReadyTemplate(ctx: DataExportReadyContext): MailMessage {
  const greeting = ctx.firstName ? `Cześć **${escapeHtml(ctx.firstName)}**,` : 'Cześć,';
  const expiresStr = formatDateTimePl(ctx.expiresAt);
  const sizeStr = formatBytes(ctx.sizeBytes);

  const { html, text } = renderEmailShell({
    title: 'Twój eksport danych jest gotowy',
    preheader: `Plik ZIP (${sizeStr}) — link aktywny do ${expiresStr}.`,
    bodyMarkdown: [
      greeting,
      ``,
      `Przygotowaliśmy paczkę zawierającą wszystkie dane osobowe, jakie Verris przechowuje na Twój temat (RODO art. 20 — prawo do przenoszenia danych).`,
      ``,
      `## Szczegóły eksportu`,
      ``,
      `- **Format:** ZIP (deflate), wewnątrz pliki JSON oraz folder \`attachments/\` z załącznikami z ticketów.`,
      `- **Rozmiar:** ${escapeHtml(sizeStr)}`,
      `- **Link wygasa:** ${escapeHtml(expiresStr)}`,
      ``,
      `Po wygaśnięciu linku możesz wygenerować nowy eksport w sekcji **Ustawienia → Prywatność i dane**.`,
      ``,
      `## Co znajdziesz w paczce`,
      ``,
      `- profile (e-mail, dane do faktury, flagi),`,
      `- subskrypcje, konta hostingowe, faktury,`,
      `- historia portfela i kredytów,`,
      `- tickety, ich odpowiedzi i fizyczne pliki załączników,`,
      `- log audytowy operacji na koncie,`,
      `- historia zgód RODO oraz preferencji marketingowych.`,
      ``,
      `Hash hasła, sekrety 2FA oraz hasła kont DirectAdmin są oznaczone w plikach jako \`[REDACTED]\` — to wartości techniczne, których nigdy nie udostępniamy.`,
    ].join('\n'),
    cta: {
      label: 'Pobierz paczkę',
      url: ctx.downloadUrl,
    },
    footnote:
      'Link jest osobistym, jednorazowym tokenem — nie udostępniaj go nikomu. Jeśli to nie Ty zgłaszałeś żądanie, daj nam znać: rodo@verris.pl.',
    recipientEmail: ctx.to,
    panelUrl: ctx.panelUrl,
    category: 'TRANSACTIONAL',
  });

  return {
    to: ctx.to,
    tag: 'rodo.data-export-ready',
    subject: '[Verris] Twoja kopia danych jest gotowa do pobrania',
    text,
    html,
  };
}
