import Link from 'next/link';
import { Logo } from './ui';
import { CookiePreferencesButton } from './CookieConsent';
import { footerCols } from '@/lib/site';
import { getFooterGlobal } from '@/lib/globals';

const DEFAULT_LEGAL =
  '© 2026 Verris · Operator: HVLN Dominik Kowalski, Zielona Góra · NIP 9292069367';
const DEFAULT_PAY =
  'Płatności: karta · BLIK · Przelewy24 · Paynow · SLA 99,5% z rekompensatami na wniosek wg regulaminu';

// Stopka całego verris.pl: kolumny z CMS (global Footer) albo z lib/site.ts; na telefonie dwie kolumny linków.
type Col = { heading: string; links: { label: string; href: string }[] };

export async function Footer() {
  const g = (await getFooterGlobal()) as {
    columns?: { heading?: string; links?: { label?: string; href?: string }[] }[];
    legalLine?: string;
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

  const legal = g?.legalLine || DEFAULT_LEGAL;
  const pay = g?.payLine || DEFAULT_PAY;

  return (
    <footer>
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-brand">
            <Logo />
            <p>Hosting z autoskalowaniem. Polska firma, dane w EOG.</p>
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
          <span>{legal} · <Link href="/zglos-naduzycie">Zgłoś nadużycie</Link></span>
          <span className="pay">
            {pay} · <CookiePreferencesButton />
          </span>
        </div>
      </div>
    </footer>
  );
}
