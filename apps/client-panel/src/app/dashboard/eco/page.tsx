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
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
  const badgeSrc = profile.ecoBadgeToken
    ? `${apiBase}/public/eco/badge/${encodeURIComponent(profile.ecoBadgeToken)}`
    : '';

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

      <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Trees className="h-4 w-4 text-emerald-400" />
          Badge na stronę
        </div>
        <p className="text-sm text-neutral-400">
          Osadź obrazek SVG pokazujący Twój poziom EKO. Skopiuj adres lub wklej znacznik{' '}
          <span className="font-mono text-neutral-300">&lt;img&gt;</span> na swoją stronę.
        </p>
        {badgeSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={badgeSrc} alt="Badge EKO Verris" className="rounded-lg border border-white/10 max-w-full" />
            <label className="block text-xs text-neutral-500 space-y-1">
              HTML
              <textarea
                readOnly
                className="w-full min-h-[72px] rounded-xl border border-white/10 bg-black/50 p-3 text-xs font-mono text-neutral-300"
                value={`<a href="https://verris.pl" target="_blank" rel="noopener"><img src="${badgeSrc}" width="280" height="72" alt="Verris EKO" /></a>`}
              />
            </label>
          </>
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
