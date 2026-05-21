import Link from 'next/link';
import { Eye, Gift, History, Leaf, Trees } from 'lucide-react';
import { FeatureNotAvailable } from '@/components/feature-not-available';
import { isClientFeatureEnabled } from '@/lib/client-features';
import { getEcoDashboardData } from './eco-data';
import { EcoRedeemForm } from './eco-redeem-form';
import { EcoTreeProgress } from './eco-tree-progress';
import { EcoProgramStatus } from './eco-program-status';

export const dynamic = 'force-dynamic';

const REASON_LABEL: Record<string, string> = {
  EKO_FIRST_ENABLE: 'Pierwsze włączenie trybu EKO',
  BADGE_IMPRESSION: 'Wyświetlenia badge na stronie',
  REFERRAL_REGISTER_REFEREE: 'Polecenie (rejestracja)',
  REFERRAL_REGISTER_REFERRER: 'Polecenie — nowy klient',
  REFERRAL_APPLIED_REFEREE: 'Polecenie (kod dodany)',
  REFERRAL_APPLIED_REFERRER: 'Polecenie — kod wykorzystany',
};

function badgeEmbedHtml(
  badgeSrc: string,
  opts: { src: string; width: number; height: number; alt: string },
): string {
  const pixel = `${badgeSrc}/impression.gif`;
  return `<a href="https://verris.pl" target="_blank" rel="noopener" style="position:relative;display:inline-block"><img src="${opts.src}" width="${opts.width}" height="${opts.height}" alt="${opts.alt}" /><img src="${pixel}" width="1" height="1" alt="" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none" /></a>`;
}

export default async function EcoProgramPage() {
  if (!isClientFeatureEnabled('eco')) {
    return (
      <FeatureNotAvailable
        title="Program EKO"
        description="Program EKO nie jest jeszcze dostępny w Twojej ofercie. Hosting, portfel i wsparcie działają bez zmian."
      />
    );
  }

  const { profile, ledger, platform, badgeStats, program } = await getEcoDashboardData();
  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const badgeSrc = profile.ecoBadgeToken
    ? `${apiBase}/public/eco/badge/${encodeURIComponent(profile.ecoBadgeToken)}`
    : '';
  const badgeVariants = badgeSrc
    ? [
        {
          name: 'Klasyczny',
          description: 'Najlepszy do stopki albo sekcji „Partnerzy”.',
          src: `${badgeSrc}?variant=classic&theme=dark`,
          width: 292,
          height: 76,
          html: badgeEmbedHtml(badgeSrc, {
            src: `${badgeSrc}?variant=classic&theme=dark`,
            width: 292,
            height: 76,
            alt: 'Verris EKO hosting',
          }),
        },
        {
          name: 'Mini',
          description: 'Mały badge do paska bocznego lub obok logotypów.',
          src: `${badgeSrc}?variant=mini&theme=dark`,
          width: 168,
          height: 32,
          html: badgeEmbedHtml(badgeSrc, {
            src: `${badgeSrc}?variant=mini&theme=dark`,
            width: 168,
            height: 32,
            alt: 'EKO hosting Verris',
          }),
        },
        {
          name: 'Kompaktowy',
          description: 'Krótki komunikat: „Korzystamy z eko hostingu”.',
          src: `${badgeSrc}?variant=compact&theme=light`,
          width: 240,
          height: 48,
          html: badgeEmbedHtml(badgeSrc, {
            src: `${badgeSrc}?variant=compact&theme=light`,
            width: 240,
            height: 48,
            alt: 'Korzystamy z eko hostingu Verris',
          }),
        },
        {
          name: 'Statement',
          description: 'Większy wariant marketingowy na landing page.',
          src: `${badgeSrc}?variant=statement&theme=dark`,
          width: 336,
          height: 88,
          html: badgeEmbedHtml(badgeSrc, {
            src: `${badgeSrc}?variant=statement&theme=dark`,
            width: 336,
            height: 88,
            alt: 'Nasza strona korzysta z eko hostingu Verris',
          }),
        },
        {
          name: 'Interaktywny iframe',
          description: 'Karta z efektem hover, dobra do sekcji „O technologii”.',
          src: `${badgeSrc}/embed?theme=dark`,
          width: 360,
          height: 132,
          html: `<iframe src="${badgeSrc}/embed?theme=dark" title="Nasza strona korzysta z eko hostingu Verris" width="360" height="132" loading="lazy" style="border:0;max-width:100%;"></iframe>`,
          iframe: true,
        },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-1 pb-12 sm:px-2">
      <header className="mx-auto max-w-2xl text-center">
        <div className="mb-4 inline-flex items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3">
          <Leaf className="h-8 w-8 text-emerald-400" aria-hidden />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Program EKO</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400 md:text-base">
          Zbieraj punkty za ekologiczne działania na hostingu — wspieramy sadzenie drzew i pokazujemy Twój postęp w
          prosty sposób.
        </p>
      </header>

      <EcoTreeProgress points={profile.ecoPoints} pointsPerTree={platform.ecoPointsPerTree} />

      <EcoProgramStatus overview={program} />

      <article className="w-full rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 md:p-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 font-semibold text-white">
              <Gift className="h-4 w-4 text-emerald-400" aria-hidden />
              Wymień punkty na saldo portfela
            </div>
            <p className="text-sm text-neutral-400">
              Przelicznik:{' '}
              <span className="font-mono text-neutral-200">
                {platform.ecoPointsPer10Credits} pkt = 10,00 K
              </span>
              . Zasilenie trafia od razu do portfela i jest widoczne w historii transakcji.
            </p>
          </div>
          <p className="text-sm text-neutral-500 lg:text-right">
            Dostępne:{' '}
            <span className="font-mono font-semibold text-emerald-300">{profile.ecoPoints} pkt</span>
          </p>
        </div>
        <EcoRedeemForm maxPoints={profile.ecoPoints} />
      </article>


      <section className="rounded-2xl border border-white/10 bg-black/30 p-6 md:p-8">
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <article className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-400/90">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              Wyświetlenia badge
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-white">{badgeStats.impressions}</p>
            <p className="mt-1 text-xs text-neutral-500">Unikalne odsłony (max 1 / IP / godz.)</p>
          </article>
          <article className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Do następnego punktu</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-white">
              {badgeStats.impressionsUntilNextPoint}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Przyznajemy 1 pkt co {badgeStats.impressionsPerPoint} wyświetleń
            </p>
          </article>
          <article className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Punkty z badge</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-400">
              +{badgeStats.pointsEarnedFromBadge}
            </p>
            <p className="mt-1 text-xs text-neutral-500">Łącznie z osadzenia na stronie</p>
          </article>
        </div>

        <div className="mx-auto mb-8 max-w-2xl text-center">
          <div className="mb-2 flex items-center justify-center gap-2 text-white font-semibold">
            <Trees className="h-5 w-5 text-emerald-400" aria-hidden />
            Badge na stronę
          </div>
          <p className="text-sm text-neutral-400">
            Osadź badge pokazujący, że Twoja strona korzysta z eko hostingu. Wybierz mały SVG do stopki, większy
            wariant marketingowy albo interaktywną kartę przez{' '}
            <span className="font-mono text-neutral-300">&lt;iframe&gt;</span>. Każde unikalne wyświetlenie na
            zewnętrznej stronie przybliża Cię do kolejnego punktu EKO.
          </p>
        </div>

        {badgeVariants.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2">
            {badgeVariants.map((variant) => (
              <article
                key={variant.name}
                className="flex flex-col rounded-2xl border border-white/10 bg-black/40 p-5"
              >
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-white">{variant.name}</h3>
                  <p className="mt-1 text-xs text-neutral-500">{variant.description}</p>
                </div>
                <div className="flex min-h-[120px] flex-1 items-center justify-center rounded-xl border border-white/10 bg-black/50 p-4">
                  {variant.iframe ? (
                    <iframe
                      src={variant.src}
                      title={variant.name}
                      width={variant.width}
                      height={variant.height}
                      loading="lazy"
                      className="max-w-full"
                      style={{ border: 0 }}
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={variant.src}
                      alt={variant.name}
                      width={variant.width}
                      height={variant.height}
                      className="max-w-full"
                    />
                  )}
                </div>
                <label className="mt-4 block space-y-1 text-xs text-neutral-500">
                  HTML
                  <textarea
                    readOnly
                    className="w-full min-h-[72px] rounded-xl border border-white/10 bg-black/50 p-3 text-xs font-mono text-neutral-300"
                    value={variant.html}
                  />
                </label>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-amber-200/80">Brak tokenu badge — odśwież stronę za chwilę.</p>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-6 md:p-8">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <History className="h-5 w-5 text-neutral-400" aria-hidden />
            Historia punktów
          </h2>
          <p className="text-sm text-neutral-500">{ledger.length} wpisów</p>
        </div>
        {ledger.length === 0 ? (
          <p className="text-center text-sm text-neutral-500 py-8">Brak wpisów — zacznij zbierać punkty EKO.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {ledger.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-white/5 bg-black/20 px-4 py-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-neutral-200">{REASON_LABEL[row.reason] ?? row.reason}</span>
                  <span
                    className={`shrink-0 font-mono font-semibold tabular-nums ${
                      row.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {row.delta >= 0 ? '+' : ''}
                    {row.delta}
                  </span>
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  {new Date(row.createdAt).toLocaleString('pl-PL')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
