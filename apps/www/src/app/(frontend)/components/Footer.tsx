import Link from 'next/link';
import { Logo } from './ui';
import { CookiePreferencesButton } from './CookieConsent';
import { footerCols, legalLinks, ZAMOW } from '@/lib/site';
import { getFooterGlobal } from '@/lib/globals';
import { odCeny } from '@/lib/ceny';
import { pobierzCeny } from '@/lib/ceny-api';
import { DANE_SPRZEDAWCY } from '@/lib/sprzedawca';

/**
 * A2-09 (beta 3.11): dane sprzedawcy zawsze z kodu (lib/sprzedawca.ts) — pełny adres i e-mail są obowiązkiem
 * informacyjnym, więc nie zależą od pola w CMS. Pole „Linia prawna” w CMS nie jest już używane.
 */
export const LINIA_PRAWNA = `© 2026 Verris · Operator: ${DANE_SPRZEDAWCY} · Wszystkie ceny brutto (z VAT 23%)`;
/** Decyzja 1 (3.11): rekompensata SLA automatycznie. Wartość w CMS poprawia migracja 20261103_120000_stopka_sla_automatycznie. */
export const DEFAULT_PAY =
  'Płatności: karta · BLIK · Przelewy24 · Paynow · SLA 99,5% z rekompensatami przyznawanymi automatycznie wg regulaminu';

// Stopka całego verris.pl: kolumny z CMS (global Footer) albo z lib/site.ts; na telefonie dwie kolumny linków.
type Col = { heading: string; links: { label: string; href: string }[] };

export async function Footer() {
  const ceny = await pobierzCeny();
  const g = (await getFooterGlobal()) as {
    columns?: { heading?: string; links?: { label?: string; href?: string }[] }[];
    payLine?: string;
  } | null;

  // Kolumny z CMS, jeśli uzupełnione; inaczej stałe z lib/site.ts.
  const cols: Col[] =
    g?.columns && g.columns.length > 0
      ? g.columns.map((c) => ({
          heading: c.heading || '',
          links: (c.links || []).map((l) => ({ label: l.label || '', href: l.href || '#' })),
        }))
      : footerCols;

  const legal = LINIA_PRAWNA;
  const pay = g?.payLine || DEFAULT_PAY;

  return (
    <footer>
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-brand">
            <Logo />
            <p>Polski hosting dla firm, sklepów i WordPressa. Dane w UE. Skaluj świadomie.</p>
            <a className="btn btn-primary btn-sm foot-cta" href={ZAMOW} data-event="cta_click" data-cta="footer">
              Zamów hosting {odCeny(ceny.hosting)}
            </a>
          </div>
          {cols.map((col) => (
            <div className="foot-col" key={col.heading}>
              <h2>{col.heading}</h2>
              {col.links.map((l) => (
                <a key={l.label + l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="foot-bot">
          <span>
            {legal} ·{' '}
            {legalLinks.map((l) => (
              <span key={l.label}>
                <a href={l.href}>{l.label}</a> ·{' '}
              </span>
            ))}
            <Link href="/zglos-naduzycie">Zgłoś nadużycie</Link>
          </span>
          <span className="pay">
            {pay} · <CookiePreferencesButton />
          </span>
        </div>
      </div>
    </footer>
  );
}
