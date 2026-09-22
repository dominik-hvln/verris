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
      <svg className="wm" viewBox="0 0 273.11 80.81" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M20.02 79.49 0 26.76H19.14L30.71 66.85H29.44L40.97 26.76H60.11L40.14 79.49ZM86.03 80.81Q78.21 80.81 71.75 77.42Q65.28 74.02 61.42 67.8Q57.56 61.57 57.56 53.03Q57.56 44.58 61.32 38.4Q65.08 32.23 71.53 28.83Q77.97 25.44 86.03 25.44Q90.47 25.44 95.04 26.76Q99.6 28.08 103.46 31.45Q107.32 34.81 109.66 40.89Q112 46.97 112 56.45H68.55V47.46H96.72L95.45 49.85Q95.06 45.26 93.67 42.43Q92.28 39.6 90.2 38.31Q88.13 37.01 85.54 37.01Q81.97 37.01 79.7 39.11Q77.43 41.21 76.36 44.85Q75.29 48.49 75.29 53.12Q75.29 60.11 77.8 64.31Q80.31 68.51 85.88 68.51Q89.3 68.51 91.84 66.72Q94.38 64.94 95.84 61.08L111.08 64.7Q109.22 70.46 105.24 74.02Q101.26 77.59 96.18 79.2Q91.11 80.81 86.03 80.81ZM116.93 79.49V26.76H133.58V38.92L132.85 37.26Q135.43 31.2 139.9 28.32Q144.37 25.44 149.94 25.44Q151.5 25.44 153.16 25.68Q154.82 25.93 156.48 26.51L155.36 40.82Q151.99 39.89 148.96 39.89Q146.22 39.89 143.59 40.8Q140.95 41.7 138.8 43.82Q136.65 45.95 135.36 49.66Q134.07 53.37 134.07 58.98V79.49ZM158.72 79.49V26.76H175.37V38.92L174.63 37.26Q177.22 31.2 181.69 28.32Q186.16 25.44 191.72 25.44Q193.29 25.44 194.95 25.68Q196.61 25.93 198.27 26.51L197.14 40.82Q193.78 39.89 190.75 39.89Q188.01 39.89 185.38 40.8Q182.74 41.7 180.59 43.82Q178.44 45.95 177.15 49.66Q175.86 53.37 175.86 58.98V79.49ZM201.48 79.49V26.76H218.62V79.49ZM210.08 21.48Q205.1 21.48 202.21 18.6Q199.33 15.72 199.33 10.74Q199.33 5.76 202.21 2.88Q205.1 0 210.08 0Q215.06 0 217.94 2.88Q220.82 5.76 220.82 10.74Q220.82 15.72 217.94 18.6Q215.06 21.48 210.08 21.48ZM248.59 80.81Q242.54 80.81 237 79.15Q231.46 77.49 227.65 73.88Q223.84 70.26 222.86 64.4L238.05 61.38Q238.44 65.14 240.78 67.09Q243.12 69.04 247.86 69.04Q252.4 69.04 254.4 67.48Q256.41 65.92 256.41 63.87Q256.41 62.06 254.75 60.52Q253.09 58.98 248.64 58.35L244.44 57.76Q241.56 57.37 238.19 56.64Q234.82 55.91 231.8 54.37Q228.77 52.83 226.87 50.05Q224.96 47.27 224.96 42.77Q224.96 37.5 227.79 33.62Q230.62 29.74 235.8 27.59Q240.98 25.44 247.91 25.44Q253.92 25.44 259.07 27.15Q264.22 28.86 267.76 32.25Q271.3 35.64 272.32 40.72L257.33 43.8Q256.99 42.19 256.16 40.6Q255.33 39.01 253.55 37.96Q251.77 36.91 248.59 36.91Q245.18 36.91 243.37 38.21Q241.56 39.5 241.56 41.5Q241.56 43.21 242.88 44.26Q244.2 45.31 246.35 45.92Q248.5 46.53 250.99 46.92L256.06 47.66Q260.26 48.24 264.17 49.95Q268.08 51.66 270.59 54.88Q273.11 58.11 273.11 63.33Q273.11 69.09 269.88 73Q266.66 76.9 261.09 78.86Q255.53 80.81 248.59 80.81Z" fill="currentColor" />
      </svg>
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
