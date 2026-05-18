import { Leaf, Share2, Sparkles, Trees } from 'lucide-react';
import { getEcoDashboardData } from './eco-data';
import { ReferralApplyForm } from './referral-apply-form';
import { EcoRedeemForm } from './eco-redeem-form';

export const dynamic = 'force-dynamic';

const REASON_LABEL: Record<string, string> = {
  EKO_FIRST_ENABLE: 'Pierwsze włączenie trybu EKO',
  REFERRAL_REGISTER_REFEREE: 'Polecenie (rejestracja)',
  REFERRAL_REGISTER_REFERRER: 'Polecenie — nowy klient',
  REFERRAL_APPLIED_REFEREE: 'Polecenie (kod dodany)',
  REFERRAL_APPLIED_REFERRER: 'Polecenie — kod wykorzystany',
};

export default async function EcoProgramPage() {
  const { profile, ledger } = await getEcoDashboardData();
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
          width: 280,
          height: 72,
          html: `<a href="https://verris.pl" target="_blank" rel="noopener"><img src="${badgeSrc}?variant=classic&theme=dark" width="280" height="72" alt="Verris EKO hosting" /></a>`,
        },
        {
          name: 'Mini',
          description: 'Mały badge do paska bocznego lub obok logotypów.',
          src: `${badgeSrc}?variant=mini&theme=dark`,
          width: 156,
          height: 28,
          html: `<a href="https://verris.pl" target="_blank" rel="noopener"><img src="${badgeSrc}?variant=mini&theme=dark" width="156" height="28" alt="EKO hosting Verris" /></a>`,
        },
        {
          name: 'Kompaktowy',
          description: 'Krótki komunikat: „Korzystamy z eko hostingu”.',
          src: `${badgeSrc}?variant=compact&theme=light`,
          width: 220,
          height: 44,
          html: `<a href="https://verris.pl" target="_blank" rel="noopener"><img src="${badgeSrc}?variant=compact&theme=light" width="220" height="44" alt="Korzystamy z eko hostingu Verris" /></a>`,
        },
        {
          name: 'Statement',
          description: 'Większy wariant marketingowy na landing page.',
          src: `${badgeSrc}?variant=statement&theme=dark`,
          width: 320,
          height: 84,
          html: `<a href="https://verris.pl" target="_blank" rel="noopener"><img src="${badgeSrc}?variant=statement&theme=dark" width="320" height="84" alt="Nasza strona korzysta z eko hostingu Verris" /></a>`,
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
    <div className="space-y-10 max-w-4xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
          <Leaf className="h-8 w-8 text-emerald-400" />
          Program EKO
        </h1>
        <p className="text-neutral-400 text-sm md:text-base">
          Punkty lojalnościowe, polecenia i badge — powiązane z kontem DirectAdmin (backupy, tryb EKO na usłudze).
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-2">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Sparkles className="h-4 w-4 text-amber-300" />
            Twoje punkty
          </div>
          <p className="text-4xl font-bold text-white tabular-nums">{profile.ecoPoints}</p>
          <p className="text-xs text-neutral-500">
            Tryb EKO na usłudze: {profile.hasActiveEcoSubscription ? 'aktywny (motyw panelu)' : 'nieaktywny'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-3">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Share2 className="h-4 w-4 text-sky-300" />
            Twój kod polecenia
          </div>
          <p className="font-mono text-lg text-emerald-300">{profile.referralCode ?? '—'}</p>
          <p className="text-xs text-neutral-500">
            Link: <span className="text-neutral-300">/register?ref={profile.referralCode ?? ''}</span>
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 space-y-3">
        <h2 className="text-white font-semibold">Wymień punkty na saldo portfela</h2>
        <p className="text-sm text-neutral-400">
          Przelicznik: <span className="font-mono text-neutral-200">100 pkt = 10.00 K</span> (1 zł = 1 kredyt). Zasilenie trafia od razu
          do portfela i jest widoczne w historii transakcji.
        </p>
        <EcoRedeemForm maxPoints={profile.ecoPoints} />
      </div>

      {!profile.referredByUserId ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 space-y-3">
          <h2 className="text-white font-semibold">Masz kod od znajomego?</h2>
          <p className="text-sm text-neutral-400">
            Jeśli nie rejestrowałeś się jeszcze z linkiem polecającym, wpisz kod tutaj (+3 pkt dla Ciebie, +5 dla
            polecającego).
          </p>
          <ReferralApplyForm />
        </div>
      ) : (
        <p className="text-sm text-neutral-500">To konto jest już powiązane z poleceniem.</p>
      )}

      <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-5">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Trees className="h-4 w-4 text-emerald-400" />
          Badge na stronę
        </div>
        <p className="text-sm text-neutral-400">
          Osadź badge pokazujący, że Twoja strona korzysta z eko hostingu. Wybierz mały SVG do stopki,
          większy wariant marketingowy albo interaktywną kartę do osadzenia przez{' '}
          <span className="font-mono text-neutral-300">&lt;iframe&gt;</span>.
        </p>
        {badgeVariants.length > 0 ? (
          <div className="grid gap-4">
            {badgeVariants.map((variant) => (
              <div key={variant.name} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{variant.name}</h3>
                    <p className="mt-1 text-xs text-neutral-500">{variant.description}</p>
                  </div>
                  <div className="flex min-h-[96px] items-center justify-center rounded-xl border border-white/10 bg-black/40 p-4">
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
                </div>
                <label className="mt-4 block space-y-1 text-xs text-neutral-500">
                  HTML
                  <textarea
                    readOnly
                    className="w-full min-h-[88px] rounded-xl border border-white/10 bg-black/50 p-3 text-xs font-mono text-neutral-300"
                    value={variant.html}
                  />
                </label>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-amber-200/80">Brak tokenu badge — odśwież stronę za chwilę.</p>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
        <h2 className="text-white font-semibold">Historia punktów</h2>
        {ledger.length === 0 ? (
          <p className="text-sm text-neutral-500">Brak wpisów.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {ledger.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap justify-between gap-2 border-b border-white/5 pb-2 text-neutral-300"
              >
                <span>{REASON_LABEL[row.reason] ?? row.reason}</span>
                <span className={row.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {row.delta >= 0 ? '+' : ''}
                  {row.delta}
                </span>
                <span className="text-xs text-neutral-500 w-full">
                  {new Date(row.createdAt).toLocaleString('pl-PL')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
