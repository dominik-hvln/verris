import { Logo } from './ui';
import { CookiePreferencesButton } from './CookieConsent';
import { footerCols } from '@/lib/site';
import { getFooterGlobal } from '@/lib/globals';

const DEFAULT_LEGAL =
  '© 2026 Verris · Operator: HVLN Dominik Kowalski, Zielona Góra · NIP 9292069367';
const DEFAULT_PAY =
  'Płatności: karta · BLIK · Apple Pay · Google Pay · Stripe · SLA 99,5% z automatycznymi rekompensatami wg regulaminu';

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
        <div className="foot-grid" style={{ gridTemplateColumns: '1.3fr 1fr 1fr 1fr 1fr' }}>
          <div className="foot-brand">
            <Logo />
            <p>Nowoczesny polski hosting z uczciwymi zasadami. Skaluj świadomie.</p>
          </div>
          {cols.map((col) => (
            <div className="foot-col" key={col.heading}>
              <h4>{col.heading}</h4>
              {col.links.map((l) => (
                <a key={l.label + l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="foot-bot">
          <span>{legal}</span>
          <span className="pay">
            {pay} · <CookiePreferencesButton />
          </span>
        </div>
      </div>
    </footer>
  );
}
