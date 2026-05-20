'use client';

import { useActionState, useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRightLeft, Check, Loader2, Wallet } from 'lucide-react';
import type { PlanChangePreviewDto } from '@verris/contracts';
import { CREDIT_DISCLAIMER, formatCredits } from '@/lib/credits';
import {
  changePlanAction,
  previewPlanChangeAction,
  type PlanChangeActionState,
} from './actions';

interface TargetPlan {
  id: string;
  slug: string;
  name: string;
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
  priceForInterval: string;
  priceMonthly: string;
  priceYearly: string;
  currency: string;
}

interface Props {
  subscriptionId: string;
  currentPlanId: string;
  currentPlanName: string;
  interval: 'MONTH' | 'YEAR';
  paymentSource: 'STRIPE_CARD' | 'WALLET' | 'MANUAL';
  status: string;
  targetPlans: TargetPlan[];
  initialPreview?: PlanChangePreviewDto | null;
}

export function PlanChangeForm({
  subscriptionId,
  currentPlanId,
  currentPlanName,
  interval,
  paymentSource,
  status,
  targetPlans,
  initialPreview = null,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>(targetPlans[0]?.id ?? currentPlanId);
  const [targetInterval, setTargetInterval] = useState<'MONTH' | 'YEAR'>(interval);
  const [preview, setPreview] = useState<PlanChangePreviewDto | null>(initialPreview);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pendingPreview, startPreview] = useTransition();
  const [state, formAction, pendingChange] = useActionState<PlanChangeActionState, FormData>(
    (prev, formData) => changePlanAction(subscriptionId, prev, formData),
    {},
  );

  const loadPreview = useCallback(
    (planId: string, billingInterval: 'MONTH' | 'YEAR') => {
      if (!planId) {
        setPreview(null);
        setPreviewError(null);
        return;
      }
      if (planId === currentPlanId && billingInterval === interval) {
        setPreview(null);
        setPreviewError(null);
        return;
      }
      startPreview(async () => {
        const res = await previewPlanChangeAction(
          subscriptionId,
          planId,
          billingInterval,
        );
        if (res.ok) {
          setPreview(res.data);
          setPreviewError(null);
        } else {
          setPreview(null);
          setPreviewError(res.error);
        }
      });
    },
    [subscriptionId, currentPlanId, interval],
  );

  const onSelect = (planId: string) => {
    setSelectedId(planId);
    loadPreview(planId, targetInterval);
  };

  const onIntervalChange = (billingInterval: 'MONTH' | 'YEAR') => {
    setTargetInterval(billingInterval);
    loadPreview(selectedId || currentPlanId, billingInterval);
  };

  useEffect(() => {
    if (selectedId) loadPreview(selectedId, targetInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  if (status !== 'ACTIVE') {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6 text-amber-100">
        Zmiana planu jest dostępna tylko dla aktywnej usługi.
      </div>
    );
  }

  if (paymentSource === 'MANUAL') {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-neutral-300">
        Ta usługa ma rozliczenie ręczne — aby zmienić plan, skontaktuj się z supportem.
      </div>
    );
  }

  const canChangeInterval = targetInterval !== interval;
  const effectivePlanId = selectedId || currentPlanId;
  const hasChange = effectivePlanId !== currentPlanId || canChangeInterval;

  if (targetPlans.length === 0 && !canChangeInterval) {
    return (
      <div className="rounded-2xl border border-white/10 p-6 text-neutral-400">
        Brak innych publicznych planów do wyboru.
      </div>
    );
  }

  const selected =
    targetPlans.find((p) => p.id === selectedId) ??
    (effectivePlanId === currentPlanId
      ? {
          id: currentPlanId,
          name: currentPlanName,
          priceMonthly: '',
          priceYearly: '',
          priceForInterval: '',
          currency: preview?.currency ?? 'PLN',
          cpuLimit: 0,
          ramLimitMb: 0,
          diskLimitMb: 0,
          slug: '',
        }
      : undefined);
  const needsReset = preview?.resetsAutoscalingDeltas ?? false;

  const priceForPlan = (plan: TargetPlan, billingInterval: 'MONTH' | 'YEAR') =>
    billingInterval === 'YEAR' ? plan.priceYearly : plan.priceMonthly;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/5 bg-[#0a0a0a] p-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-sky-400" />
          Aktualny plan
        </h2>
        <p className="mt-2 text-white font-semibold">{currentPlanName}</p>
        <p className="text-xs text-neutral-500 mt-1">
          Okres rozliczeniowy: {interval === 'MONTH' ? 'miesięczny' : 'roczny'} · płatność:{' '}
          {paymentSource === 'WALLET' ? 'portfel' : 'karta (Stripe)'}
        </p>
      </div>

      <form action={formAction} className="rounded-2xl border border-white/5 bg-[#0a0a0a] p-6 space-y-6">
        <input type="hidden" name="targetPlanId" value={effectivePlanId} />
        <input type="hidden" name="targetInterval" value={targetInterval} />
        <input type="hidden" name="needsReset" value={needsReset ? '1' : '0'} />

        <div>
          <h2 className="text-lg font-bold text-white">Okres rozliczeniowy</h2>
          <p className="mt-1 text-xs text-neutral-400">
            Zmiana okresu uruchamia nowy cykl rozliczeniowy od chwili zmiany (proration za
            pozostały czas).
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {(['MONTH', 'YEAR'] as const).map((iv) => (
              <label
                key={iv}
                className={`cursor-pointer rounded-xl border px-4 py-2 text-sm transition-colors ${
                  targetInterval === iv
                    ? 'border-sky-400/50 bg-sky-400/10 text-white'
                    : 'border-white/10 text-neutral-400 hover:border-white/20'
                }`}
              >
                <input
                  type="radio"
                  name="intervalChoice"
                  className="sr-only"
                  checked={targetInterval === iv}
                  onChange={() => onIntervalChange(iv)}
                />
                {iv === 'MONTH' ? 'Miesięczny' : 'Roczny'}
                {iv === interval ? (
                  <span className="ml-2 text-[10px] text-neutral-500">(aktualny)</span>
                ) : null}
              </label>
            ))}
          </div>
        </div>

        {targetPlans.length > 0 ? (
        <div>
          <h2 className="text-lg font-bold text-white">Wybierz nowy plan</h2>
          <p className="mt-1 text-xs text-neutral-400">
            Ta sama usługa i konto hostingowe — zmieniamy tylko pakiet i limity.
          </p>
        </div>
        ) : null}

        <div className="grid gap-3">
          {targetPlans.map((plan) => (
            <label
              key={plan.id}
              className={`flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-colors ${
                selectedId === plan.id
                  ? 'border-sky-400/50 bg-sky-400/10'
                  : 'border-white/5 bg-white/[0.02] hover:border-white/15'
              }`}
            >
              <input
                type="radio"
                name="planChoice"
                value={plan.id}
                checked={selectedId === plan.id}
                onChange={() => onSelect(plan.id)}
                className="mt-1 accent-sky-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-white">{plan.name}</span>
                  <span className="text-sm text-neutral-300">
                    {priceForPlan(plan, targetInterval)} {plan.currency}
                    {targetInterval === 'MONTH' ? ' / mies.' : ' / rok'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  CPU {plan.cpuLimit}% · RAM {(plan.ramLimitMb / 1024).toFixed(1)} GB · dysk{' '}
                  {(plan.diskLimitMb / 1024).toFixed(0)} GB
                </p>
              </div>
            </label>
          ))}
        </div>

        {pendingPreview && (
          <p className="text-sm text-neutral-400 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Obliczanie proration…
          </p>
        )}
        {previewError && (
          <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100 flex gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {previewError}
          </div>
        )}

        {preview && selected && hasChange && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3 text-sm">
            <p className="font-semibold text-white">Podsumowanie za pozostały okres</p>
            {preview.intervalChange && preview.newPeriodEnd ? (
              <p className="text-xs text-neutral-400">
                Nowy okres: od teraz do{' '}
                {new Date(preview.newPeriodEnd).toLocaleDateString('pl-PL')}
              </p>
            ) : null}
            {preview.peakDiskUsageMb != null && preview.peakDiskUsageMb > 0 ? (
              <p className="text-xs text-neutral-500">
                Zużycie dysku (48 h): {Math.ceil(preview.peakDiskUsageMb)} MB
              </p>
            ) : null}
            {preview.direction === 'upgrade' && Number(preview.amountDue) > 0 ? (
              <p className="text-neutral-300">
                Dopłata:{' '}
                <span className="text-white font-bold">
                  {formatCredits(preview.amountDue)} ({preview.amountDue} {preview.currency})
                </span>
              </p>
            ) : preview.direction === 'downgrade' && Number(preview.amountCredit) > 0 ? (
              <p className="text-neutral-300">
                Zwrot na portfel:{' '}
                <span className="text-emerald-300 font-bold">
                  {formatCredits(preview.amountCredit)}
                </span>
              </p>
            ) : (
              <p className="text-neutral-400">Bez dodatkowej opłaty za pozostały okres.</p>
            )}
            <p className="text-[11px] text-neutral-500">{CREDIT_DISCLAIMER}</p>
            {preview.paymentSource === 'WALLET' &&
              preview.direction === 'upgrade' &&
              Number(preview.amountDue) > 0 && (
                <Link
                  href="/dashboard/billing"
                  className="inline-flex items-center gap-2 text-xs text-sky-300 hover:text-sky-200"
                >
                  <Wallet className="h-3.5 w-3.5" />
                  Doładuj portfel
                </Link>
              )}
          </div>
        )}

        {needsReset && (
          <label className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 cursor-pointer">
            <input
              type="checkbox"
              name="confirmReset"
              className="mt-0.5 h-5 w-5 rounded accent-amber-500"
            />
            <span className="text-xs text-amber-100/90">
              Rozumiem, że delty autoskalowania zostaną zresetowane, a limity ustawione według
              nowego planu bazowego.
            </span>
          </label>
        )}

        {state.error && (
          <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
            {state.error}
          </div>
        )}
        {state.message && (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100 flex gap-2">
            <Check className="h-4 w-4 shrink-0" />
            {state.message}
          </div>
        )}

        <button
          type="submit"
          disabled={pendingChange || !hasChange || !preview}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {pendingChange ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Zmieniam plan…
            </>
          ) : (
            'Potwierdź zmianę planu'
          )}
        </button>
      </form>
    </div>
  );
}
