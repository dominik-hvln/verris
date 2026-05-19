'use client';

import { useEffect, useState, useTransition } from 'react';
import { Loader2, Share2 } from 'lucide-react';
import {
  applyReferralProgramAction,
  fetchReferralProgramStatus,
  type ReferralProgramStatus,
} from './actions';

export function ReferralProgramClient() {
  const [data, setData] = useState<ReferralProgramStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    fetchReferralProgramStatus()
      .then(setData)
      .catch(() => setError('Nie udało się pobrać statusu programu.'));
  }, []);

  const onApply = () => {
    setError(null);
    startTransition(async () => {
      const res = await applyReferralProgramAction();
      if (res.ok) {
        const fresh = await fetchReferralProgramStatus();
        setData(fresh);
      } else {
        setError(res.error ?? 'Błąd zgłoszenia.');
      }
    });
  };

  if (!data && !error) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  const panelOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://panel.verris.pl';

  return (
    <div className="space-y-6 max-w-2xl">
      {error ? (
        <p className="text-sm text-rose-200 border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-2">
          {error}
        </p>
      ) : null}

      {!data?.status ? (
        <section className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Dołącz do programu partnerskiego</h2>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Po akceptacji przez zespół Verris otrzymasz osobisty link polecający. Za każdego klienta,
            który zarejestruje się z Twojego linku, oboje otrzymacie punkty EKO.
          </p>
          <label className="flex items-start gap-3 text-sm text-neutral-300">
            <input type="checkbox" required className="mt-1 accent-emerald-500" id="terms" />
            <span>Akceptuję regulamin programu poleceń i zasady wypłat / punktów EKO.</span>
          </label>
          <button
            type="button"
            onClick={onApply}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Zgłoś się do programu
          </button>
        </section>
      ) : null}

      {data?.status === 'PENDING' ? (
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6">
          <p className="text-amber-100 font-medium">Zgłoszenie oczekuje na akceptację</p>
          <p className="text-sm text-amber-200/80 mt-2">
            Zespół Verris rozpatrzy wniosek w ciągu kilku dni roboczych. O decyzji poinformujemy mailowo.
          </p>
        </section>
      ) : null}

      {data?.status === 'REJECTED' ? (
        <section className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-6">
          <p className="text-rose-100 font-medium">Zgłoszenie nie zostało zaakceptowane</p>
          {data.reviewNote ? (
            <p className="text-sm text-rose-200/80 mt-2">{data.reviewNote}</p>
          ) : null}
        </section>
      ) : null}

      {data?.status === 'APPROVED' && data.referralCode ? (
        <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6 space-y-4">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Share2 className="h-5 w-5 text-emerald-400" />
            Twój link polecający
          </div>
          <p className="font-mono text-lg text-emerald-300">{data.referralCode}</p>
          <p className="text-sm text-neutral-400 break-all">
            {panelOrigin}/register?ref={data.referralCode}
          </p>
          <p className="text-xs text-neutral-500">
            Udostępnij link znajomym. Gdy założą konto, punkty EKO przypiszemy automatycznie.
          </p>
        </section>
      ) : null}
    </div>
  );
}
