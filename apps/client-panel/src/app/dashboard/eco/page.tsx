import { Eye, Gift, History, Trees } from 'lucide-react';
import { FeatureNotAvailable } from '@/components/feature-not-available';
import { czyModul } from '@/lib/feature-flags-core';
import { pobierzFlagiAction } from '@/lib/feature-flags-action';
import { getEcoDashboardData } from './eco-data';
import { EcoRedeemForm } from './eco-redeem-form';
import { EcoProgramStatus } from './eco-program-status';

export const dynamic = 'force-dynamic';

import { EcoPointsGuide } from './eco-points-guide';
import { ECO_LEDGER_REASON_LABEL } from '@/lib/eco-point-rules';
import { PanelFetchError, PanelPageHeader } from '@/components/panel';
import { Kpi, KpiStrip, Meter } from '@/components/panel/v2';

function badgeEmbedHtml(src: string, height: number, alt: string): string {
  return `<a href="https://verris.pl" target="_blank" rel="noopener"><img src="${src}" height="${height}" alt="${alt}"></a>`;
}

export default async function EcoProgramPage() {
  // N-12: przełącznik build-time + flaga operatora.
  if (!czyModul(await pobierzFlagiAction(), 'modul.eco')) {
    return (
      <FeatureNotAvailable
        title="Program EKO"
        description="Program EKO nie jest jeszcze dostępny w Twojej ofercie. Hosting, portfel i wsparcie działają bez zmian."
      />
    );
  }

  const dane = await getEcoDashboardData().catch((e: unknown) => e as Error);
  if (dane instanceof Error) {
    return (
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
        <PanelPageHeader title="Program EKO" description="Punkty za oszczędność zasobów i badge na Twoją stronę." />
        <PanelFetchError message={dane.message} />
      </div>
    );
  }
  const { profile, ledger, platform, badgeStats, program } = dane;
  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const badgeSrc = profile.ecoBadgeToken
    ? `${apiBase}/public/badges/eko/${encodeURIComponent(profile.ecoBadgeToken)}.svg`
    : '';
  const variant = (name: string, description: string, query: string, height: number, alt: string) => ({
    name,
    description,
    src: `${badgeSrc}?${query}`,
    height,
    html: badgeEmbedHtml(`${badgeSrc}?${query}`, height, alt),
  });
  const badgeVariants = badgeSrc
    ? [
        variant('EKO · ciemny', 'Do ciemnej stopki. Poziom rośnie razem z Twoimi punktami.', 'motyw=ciemny&wariant=eko', 44, 'EKO hosting Verris'),
        variant('EKO · jasny', 'Do jasnej stopki albo sekcji „Partnerzy”.', 'motyw=jasny&wariant=eko', 44, 'EKO hosting Verris'),
        variant('Znak', 'Mały znak obok logotypów.', 'motyw=ciemny&wariant=znak', 28, 'Hosting Verris'),
        variant('Tekst', 'Dyskretne „hostowane na verris” w stopce.', 'motyw=jasny&wariant=hostowane', 20, 'Hostowane na Verris'),
      ]
    : [];

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 pb-12">
      <PanelPageHeader
        title="Program EKO"
        description="Zbieraj punkty za ekologiczne działania na hostingu — wspieramy sadzenie drzew i pokazujemy Twój postęp."
      />

      <KpiStrip>
        <Kpi label="Twoje punkty" value={profile.ecoPoints} unit="pkt" foot={<span>do wymiany na saldo</span>} />
        <Kpi
          label="Do kolejnego drzewa"
          value={Math.max(0, platform.ecoPointsPerTree - (profile.ecoPoints % platform.ecoPointsPerTree))}
          unit="pkt"
          foot={<span>drzewo co {platform.ecoPointsPerTree} pkt</span>}
        >
          <Meter pct={((profile.ecoPoints % platform.ecoPointsPerTree) / platform.ecoPointsPerTree) * 100} />
        </Kpi>
        <Kpi label="Drzewa łącznie" value={Math.floor(profile.ecoPoints / platform.ecoPointsPerTree)} foot={<span>posadzone z Twoich punktów</span>} />
        <Kpi label="Przelicznik" value={platform.ecoPointsPer10Credits} unit="pkt = 10 K" foot={<span>wymiana na portfel</span>} />
      </KpiStrip>

      <EcoPointsGuide platform={platform} />

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
            Statyczny obrazek z linkiem — działa w każdym kreatorze i w mailach. Każde unikalne wyświetlenie na
            zewnętrznej stronie przybliża Cię do kolejnego punktu EKO. Interaktywne badge (pieczęć zaufania,
            dostępność na żywo, polecenie z prowizją) znajdziesz w usłudze hostingu, w zakładce „Badge na stronę”.
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={variant.src} alt={variant.name} height={variant.height} className="max-w-full" />
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
                  <span className="text-neutral-200">{ECO_LEDGER_REASON_LABEL[row.reason] ?? row.reason}</span>
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
