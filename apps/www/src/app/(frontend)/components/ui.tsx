import { PANEL } from '@/lib/site';
import { breadcrumbList } from '@/lib/schema';

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export function Logo() {
  return (
    <a className="logo" href="/" aria-label="Verris — strona główna">
      <svg viewBox="20 24 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M26 30 L40 30 L50 52 L60 30 L74 30 L50 78 Z M44 55 L56 55 L50 69 Z"
          fill="#0F7A52"
          fillRule="evenodd"
        />
        <path d="M44 55 L56 55 L50 69 Z" fill="none" stroke="#34E5A0" strokeWidth="1.6" />
      </svg>
      <span className="wm">verris</span>
    </a>
  );
}

type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="crumbs" aria-label="Ścieżka">
      <JsonLd data={breadcrumbList(items)} />
      <a href="/">Home</a>
      {items.map((c, i) => (
        <span key={i} style={{ display: 'contents' }}>
          <span className="sep" aria-hidden="true">
            ›
          </span>
          {c.href ? <a href={c.href}>{c.label}</a> : <span className="cur">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function SubHero({
  eyebrow,
  title,
  lead,
  crumbs,
  primary,
  secondary,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  crumbs: Crumb[];
  primary?: { label: string; href: string; conv?: string; plan?: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <section className="subhero">
      <div className="bg-pat" aria-hidden="true" />
      <div className="wrap">
        <div className="subhero-inner">
          <Breadcrumbs items={crumbs} />
          <span className="eyebrow" style={{ marginTop: 18 }}>
            {eyebrow}
          </span>
          <h1>{title}</h1>
          <p className="lead">{lead}</p>
          {(primary || secondary) && (
            <div className="hero-cta">
              {primary && (
                <a
                  className="btn btn-primary"
                  href={primary.href}
                  data-event="cta_click"
                  data-cta="subhero"
                  data-conv={primary.conv}
                  data-plan={primary.plan}
                >
                  {primary.label}
                </a>
              )}
              {secondary && (
                <a className="btn btn-ghost" href={secondary.href} data-event="cta_click" data-cta="subhero-alt">
                  {secondary.label}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function CTABand({
  title,
  text,
  primaryLabel = 'Załóż konto',
  primaryHref = PANEL,
  secondary,
}: {
  title: string;
  text: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondary?: { label: string; href: string };
}) {
  return (
    <section>
      <div className="wrap">
        <div className="ctaband rv">
          <h2>{title}</h2>
          <p>{text}</p>
          <div className="hero-cta" style={{ justifyContent: 'center' }}>
            <a className="btn btn-primary" href={primaryHref} data-event="cta_click" data-cta="ctaband" data-conv="checkout_intent">
              {primaryLabel}
            </a>
            {secondary && (
              <a className="btn btn-ghost" href={secondary.href} data-event="cta_click" data-cta="ctaband-alt">
                {secondary.label}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
