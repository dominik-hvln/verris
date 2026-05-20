'use client';

import { useState } from 'react';
import {
  changeAdminPlanAction,
  previewAdminPlanChangeAction,
  type PlanChangePreview,
} from './plan-change-actions';

type PlanOption = { id: string; name: string; slug: string };

export function PlanChangeForm({
  subscriptionId,
  currentPlanId,
  currentPlanName,
  plans,
  isAdmin,
}: {
  subscriptionId: string;
  currentPlanId: string;
  currentPlanName: string;
  plans: PlanOption[];
  isAdmin: boolean;
}) {
  const candidates = plans.filter((p) => p.id !== currentPlanId);
  const [targetPlanId, setTargetPlanId] = useState(candidates[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [skipBilling, setSkipBilling] = useState(false);
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadPreview = async (planId: string) => {
    if (!planId) {
      setPreview(null);
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await previewAdminPlanChangeAction(subscriptionId, planId);
    setBusy(false);
    if ('error' in res) {
      setPreview(null);
      setMsg({ type: 'err', text: res.error });
    } else {
      setPreview(res.data);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!targetPlanId || reason.trim().length < 3) {
          setMsg({ type: 'err', text: 'Wybierz plan i podaj powód (min. 3 znaki).' });
          return;
        }
        setBusy(true);
        setMsg(null);
        const res = await changeAdminPlanAction({
          subscriptionId,
          targetPlanId,
          reason: reason.trim(),
          skipBilling: isAdmin ? skipBilling : false,
        });
        setBusy(false);
        if ('error' in res) setMsg({ type: 'err', text: res.error });
        else setMsg({ type: 'ok', text: 'Plan został zmieniony. Klient otrzyma e-mail.' });
      }}
    >
      <p className="text-xs text-neutral-400">
        Aktualny plan: <span className="text-white font-medium">{currentPlanName}</span>
      </p>
      <label className="block space-y-1">
        <span className="text-xs text-neutral-400">Nowy plan</span>
        <select
          value={targetPlanId}
          onChange={(e) => {
            setTargetPlanId(e.target.value);
            void loadPreview(e.target.value);
          }}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          disabled={busy || candidates.length === 0}
        >
          {candidates.length === 0 ? (
            <option value="">Brak innych planów</option>
          ) : (
            candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.slug})
              </option>
            ))
          )}
        </select>
      </label>
      {preview ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-neutral-300">
          <p>
            Kierunek: <span className="text-white">{preview.direction}</span>
            {Number(preview.amountDue) > 0 ? (
              <> · dopłata {preview.amountDue} {preview.currency}</>
            ) : null}
            {Number(preview.amountCredit) > 0 ? (
              <> · uznanie {preview.amountCredit} {preview.currency}</>
            ) : null}
          </p>
          {preview.resetsAutoscalingDeltas ? (
            <p className="mt-1 text-amber-200/90">Reset delt autoskalowania.</p>
          ) : null}
        </div>
      ) : null}
      <label className="block space-y-1">
        <span className="text-xs text-neutral-400">Powód (audyt / ticket)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full min-h-[72px] rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          placeholder="Np. zgoda klienta na upgrade, ticket #1234"
        />
      </label>
      {isAdmin ? (
        <label className="flex items-start gap-2 text-xs text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={skipBilling}
            onChange={(e) => setSkipBilling(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Pomiń rozliczenie (portfel / Stripe) — tylko sync DA i DB. Użyj przy korekcie support
            lub rozliczeniu ręcznym.
          </span>
        </label>
      ) : null}
      {msg ? (
        <p className={`text-xs ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>
          {msg.text}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || !targetPlanId}
        className="inline-flex items-center rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-60"
      >
        Zmień plan
      </button>
    </form>
  );
}
