import { Logo } from './ui';
import { CookiePreferencesButton } from './CookieConsent';
import { footerCols } from '@/lib/site';

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="foot-grid" style={{ gridTemplateColumns: '1.3fr 1fr 1fr 1fr 1fr' }}>
          <div className="foot-brand">
            <Logo />
            <p>Nowoczesny polski hosting z uczciwymi zasadami. Skaluj świadomie.</p>
          </div>
          {footerCols.map((col) => (
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
          <span>© 2026 Verris · Operator: HVLN Dominik Kowalski, Zielona Góra · NIP 9292069367</span>
          <span className="pay">
            Płatności: karta · BLIK · Apple Pay · Google Pay · Stripe · Faktury gotowe na KSeF · SLA
            99,5% z rekompensatami wg regulaminu · <CookiePreferencesButton />
          </span>
        </div>
      </div>
    </footer>
  );
}
