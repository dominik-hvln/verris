import Link from 'next/link';
import { CheckCircle2, Leaf, Share2, Sparkles } from 'lucide-react';
import type { EcoProgramOverview } from './eco-data';

const REFERRAL_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Oczekuje na akceptację',
  APPROVED: 'Aktywny — możesz polecać hosting',
  REJECTED: 'Zgłoszenie odrzucone',
};

export function EcoProgramStatus({ overview }: { overview: EcoProgramOverview }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <article className="flex h-full flex-col rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-6">
        <div className="flex items-center gap-2 font-semibold text-white">
          <Sparkles className="h-4 w-4 text-emerald-400" aria-hidden />
          Program EKO
        </div>
        <p className="mt-3 text-sm text-neutral-400">
          Status:{' '}
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
            {overview.isEcoProgramParticipant ? (
              <>
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Aktywny
              </>
            ) : (
              'Dołącz — włącz tryb EKO na usłudze lub zbieraj punkty'
            )}
          </span>
        </p>
        <p className="mt-2 text-sm text-neutral-400">
          Twoje punkty: <span className="font-mono font-semibold text-white">{overview.ecoPoints}</span>
        </p>
        <p className="mt-4 text-xs leading-relaxed text-neutral-500">
          Program EKO obejmuje zbieranie punktów (tryb oszczędny na hostingu, badge na stronie, wymiana na
          kredyty). Program partnerski (polecenia) opisujemy osobno.
        </p>
      </article>

      <article className="flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
        <div>
          <div className="flex items-center gap-2 font-semibold text-white">
            <Leaf className="h-4 w-4 text-emerald-400" aria-hidden />
            Tryb EKO na hostingu
          </div>
          <p className="mt-3 text-sm text-neutral-400">
            {overview.hasEcoModeOnActiveService ? (
              <>
                Włączony na{' '}
                <span className="font-medium text-white">
                  {overview.ecoModeOnActiveServices}{' '}
                  {overview.ecoModeOnActiveServices === 1 ? 'usłudze' : 'usługach'}
                </span>
                {overview.ecoModeOnServices > overview.ecoModeOnActiveServices ? (
                  <span className="text-neutral-500">
                    {' '}
                    (łącznie {overview.ecoModeOnServices} z trybem EKO w konfiguracji)
                  </span>
                ) : null}
                . Przy aktywnej usłudze panel może mieć delikatny zielony akcent.
              </>
            ) : overview.ecoModeOnServices > 0 ? (
              <>
                Skonfigurowany na {overview.ecoModeOnServices}{' '}
                {overview.ecoModeOnServices === 1 ? 'usłudze' : 'usługach'}, ale żadna nie jest jeszcze
                aktywna — po uruchomieniu usługi tryb zacznie działać.
              </>
            ) : (
              <>
                Wyłączony na wszystkich usługach. Włącz go przy zakupie lub w{' '}
                <Link href="/dashboard/services" className="text-emerald-400 underline hover:text-emerald-300">
                  szczegółach usługi → autoskalowanie
                </Link>
                .
              </>
            )}
          </p>
        </div>

        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Share2 className="h-4 w-4 text-neutral-400" aria-hidden />
            Program partnerski
          </div>
          <p className="mt-2 text-sm text-neutral-400">
            {overview.referralProgramStatus ? (
              <>
                {REFERRAL_STATUS_LABEL[overview.referralProgramStatus] ?? overview.referralProgramStatus}.{' '}
                <Link href="/dashboard/referral" className="text-emerald-400 underline hover:text-emerald-300">
                  Zarządzaj linkiem polecającym
                </Link>
              </>
            ) : (
              <>
                Nie dołączyłeś jeszcze do programu poleceń.{' '}
                <Link href="/dashboard/referral" className="text-emerald-400 underline hover:text-emerald-300">
                  Zgłoś się do programu partnerskiego
                </Link>
              </>
            )}
          </p>
        </div>
      </article>
    </div>
  );
}
