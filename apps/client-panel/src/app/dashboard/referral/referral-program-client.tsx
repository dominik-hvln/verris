'use client';

import { useEffect, useState, useTransition } from 'react';
import { Loader2, Share2, Wallet, Banknote, Gift, Users2, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  applyReferralProgramAction,
  fetchReferralProgramStatus,
  fetchPartnerOverview,
  fetchPartnerCommissions,
  fetchPartnerPayouts,
  requestWalletPayoutAction,
  requestBankPayoutAction,
  type ReferralProgramStatus,
  type PartnerOverview,
  type PartnerCommission,
  type PartnerPayout,
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

      {data?.status === 'APPROVED' ? <PartnerEarnings /> : null}
    </div>
  );
}

const pln = (n: number) => `${n.toFixed(2)} K`;

function PartnerEarnings() {
  const [ov, setOv] = useState<PartnerOverview | null>(null);
  const [commissions, setCommissions] = useState<PartnerCommission[]>([]);
  const [payouts, setPayouts] = useState<PartnerPayout[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [iban, setIban] = useState('');
  const [pending, startTransition] = useTransition();

  const reload = () => {
    Promise.all([fetchPartnerOverview(), fetchPartnerCommissions(), fetchPartnerPayouts()])
      .then(([o, c, p]) => { setOv(o); setCommissions(c); setPayouts(p); })
      .catch(() => setErr('Nie udało się pobrać danych programu.'));
  };
  useEffect(reload, []);

  const doWallet = () => {
    setErr(null); setOk(null);
    startTransition(async () => {
      const r = await requestWalletPayoutAction();
      if (r.ok) { setOk(`Wypłacono ${pln(r.amount ?? 0)} do portfela.`); reload(); }
      else setErr(r.error ?? 'Błąd wypłaty.');
    });
  };
  const doBank = () => {
    setErr(null); setOk(null);
    startTransition(async () => {
      const r = await requestBankPayoutAction(iban);
      if (r.ok) { setOk(`Zlecono wypłatę ${pln(r.amount ?? 0)} na konto — czeka na realizację.`); setIban(''); reload(); }
      else setErr(r.error ?? 'Błąd zlecenia wypłaty.');
    });
  };

  if (!ov) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" /></div>;
  }

  return (
    <div className="space-y-5">
      {err ? <p className="flex items-center gap-2 text-sm text-rose-200 border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-2"><AlertCircle className="h-4 w-4" /> {err}</p> : null}
      {ok ? <p className="flex items-center gap-2 text-sm text-emerald-200 border border-emerald-500/30 bg-emerald-500/10 rounded-xl px-4 py-2"><CheckCircle2 className="h-4 w-4" /> {ok}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Wallet className="h-4 w-4" />} label="Do wypłaty" value={pln(ov.earnings.available)} accent />
        <StatCard icon={<Clock className="h-4 w-4" />} label={`Oczekuje (karencja ${ov.config.holdDays} dni)`} value={pln(ov.earnings.pending)} />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Wypłacone łącznie" value={pln(ov.earnings.paid)} />
        <StatCard icon={<Users2 className="h-4 w-4" />} label="Polecenia (płacący / wszyscy)" value={`${ov.referrals.paying} / ${ov.referrals.total}`} />
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">Zasady programu</h3>
        <ul className="text-sm text-neutral-400 space-y-1">
          <li>• Prowizja <span className="text-emerald-300 font-medium">{ov.config.commissionPct}%</span> od każdej płatności poleconego klienta (recurring).</li>
          {ov.config.freeHostingThreshold > 0 ? (
            <li>• Bonus <span className="text-emerald-300 font-medium">{pln(ov.config.freeHostingCredit)}</span> za każde <span className="text-emerald-300 font-medium">{ov.config.freeHostingThreshold}</span> aktywnych (płacących) poleceń.</li>
          ) : null}
          <li>• Prowizja dojrzewa po {ov.config.holdDays} dniach (ochrona przed zwrotami), potem trafia do „Do wypłaty".</li>
          <li>• Minimalna wypłata na konto bankowe: {pln(ov.config.minPayout)}. Wypłata do portfela — bez limitu.</li>
        </ul>
        {ov.milestone.threshold > 0 && ov.milestone.nextAt != null ? (
          <div className="pt-1">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-1"><Gift className="h-3.5 w-3.5 text-emerald-400" /> Do kolejnego bonusu</span>
              <span>{ov.milestone.payingCount} / {ov.milestone.nextAt} poleceń</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (ov.milestone.payingCount / ov.milestone.nextAt) * 100)}%` }} />
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">Wypłata zarobków</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={doWallet} disabled={pending || !ov.payout.canRequestWallet} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Wypłać do portfela ({pln(ov.earnings.available)})
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
          <div className="flex-1 min-w-[220px]">
            <label className="mb-1 block text-xs text-neutral-500">Numer konta (IBAN) do wypłaty przelewem</label>
            <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="PL00 0000 0000 0000 0000 0000 0000" className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
          </div>
          <button onClick={doBank} disabled={pending || !ov.payout.canRequestBank || iban.trim().length < 15} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-40">
            <Banknote className="h-4 w-4" /> Zleć wypłatę na konto
          </button>
        </div>
        {!ov.payout.canRequestBank ? (
          <p className="text-xs text-neutral-500">Wypłata na konto dostępna od {pln(ov.config.minPayout)} dostępnych prowizji.</p>
        ) : null}
        {ov.earnings.reserved > 0 ? (
          <p className="text-xs text-amber-300/80">{pln(ov.earnings.reserved)} zarezerwowane na oczekujące zlecenia wypłaty.</p>
        ) : null}
      </section>

      {payouts.length > 0 ? (
        <section className="rounded-2xl border border-white/10 bg-black/30 p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Historia wypłat</h3>
          <div className="space-y-1.5 text-sm">
            {payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5 last:border-0">
                <span className="text-neutral-300">{new Date(p.requestedAt).toLocaleDateString('pl-PL')} · {p.method === 'WALLET' ? 'Portfel' : 'Przelew'}</span>
                <span className="font-mono tabular-nums text-white">{pln(Number(p.amount))}</span>
                <PayoutBadge status={p.status} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {commissions.length > 0 ? (
        <section className="rounded-2xl border border-white/10 bg-black/30 p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Ostatnie prowizje</h3>
          <div className="space-y-1.5 text-sm">
            {commissions.slice(0, 20).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5 last:border-0">
                <span className="truncate text-neutral-300">{new Date(c.createdAt).toLocaleDateString('pl-PL')} · {c.kind === 'MILESTONE_BONUS' ? 'Bonus' : `Prowizja ${c.pct ?? ''}%`}</span>
                <span className="font-mono tabular-nums text-emerald-300">+{pln(Number(c.amount))}</span>
                <CommissionBadge status={c.status} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-black/30'}`}>
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">{icon} {label}</div>
      <p className={`mt-1.5 text-xl font-bold ${accent ? 'text-emerald-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function PayoutBadge({ status }: { status: PartnerPayout['status'] }) {
  const m: Record<PartnerPayout['status'], { l: string; c: string }> = {
    REQUESTED: { l: 'W toku', c: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
    PAID: { l: 'Wypłacono', c: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
    REJECTED: { l: 'Odrzucono', c: 'bg-rose-500/10 text-rose-300 border-rose-500/30' },
  };
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${m[status].c}`}>{m[status].l}</span>;
}

function CommissionBadge({ status }: { status: PartnerCommission['status'] }) {
  const m: Record<PartnerCommission['status'], { l: string; c: string }> = {
    PENDING: { l: 'Karencja', c: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
    AVAILABLE: { l: 'Dostępna', c: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
    PAID: { l: 'Wypłacona', c: 'bg-white/10 text-neutral-300 border-white/20' },
    CANCELED: { l: 'Anulowana', c: 'bg-rose-500/10 text-rose-300 border-rose-500/30' },
  };
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${m[status].c}`}>{m[status].l}</span>;
}
