import { escapeHtml } from '../mail/templates/_layouts/email-shell.js';

/** O-09 — logo resellera: tylko rastry (SVG może nieść skrypt), najwyżej 100 KB. */
export const LOGO_MAX_BAJTOW = 100 * 1024;

/** Typ po sygnaturze pliku, nie po nazwie ani nagłówku od klienta. `null` = odrzucamy. */
export function typLogo(b: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Znaczniki w nagłówku maila (email-shell) — mailer podmienia to, co między nimi, na blok partnera. */
export const ZNACZNIK_PARTNERA_OD = '<!--verris-partner-->';
export const ZNACZNIK_PARTNERA_DO = '<!--/verris-partner-->';

export interface MarkaPartnera {
  nazwa: string;
  logoUrl: string | null;
}

/** Blok w prawej części nagłówka maila: logo i nazwa partnera + „na infrastrukturze Verris”. */
export function blokPartnera(m: MarkaPartnera): string {
  const logo = m.logoUrl
    ? `<img src="${escapeHtml(m.logoUrl)}" height="28" alt="${escapeHtml(m.nazwa)}" style="display:inline-block;height:28px;max-width:120px;border:0;vertical-align:middle;margin-right:8px;" />`
    : '';
  return (
    `${logo}<span style="font-size:14px;font-weight:700;color:#ffffff;vertical-align:middle;">${escapeHtml(m.nazwa)}</span>` +
    `<br/><span style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#b7d3cc;">na infrastrukturze Verris</span>`
  );
}

/** Podmienia blok w HTML i dopisuje linijkę do wersji tekstowej. Bez znaczników — bez zmian. */
export function wstawMarke(html: string | undefined, text: string | undefined, m: MarkaPartnera): { html?: string; text?: string } {
  const od = html?.indexOf(ZNACZNIK_PARTNERA_OD) ?? -1;
  const doI = html?.indexOf(ZNACZNIK_PARTNERA_DO) ?? -1;
  const nowyHtml =
    html && od >= 0 && doI > od ? html.slice(0, od + ZNACZNIK_PARTNERA_OD.length) + blokPartnera(m) + html.slice(doI) : html;
  const nowyText = text && nowyHtml !== html ? `${text}\n\n— ${m.nazwa}, na infrastrukturze Verris` : text;
  return { html: nowyHtml, text: nowyText };
}
