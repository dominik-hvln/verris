'use client';

import { useState } from 'react';
import {
  staffChangePlanAction,
  staffPreviewPlanChangeAction,
} from './staff-plan-change-actions';

type PlanOpt = { id: string; name: string; slug: string };

export function StaffPlanChangeForm({
  subscriptionId,
  userId,
  currentPlanId,
  currentPlanName,
  plans,
}: {
  subscriptionId: string;
  userId: string;
  currentPlanId: string;
  currentPlanName: string;
  plans: PlanOpt[];
}) {
  const candidates = plans.filter((p) => p.id !== currentPlanId);
  const [targetPlanId, setTargetPlanId] = useState(candidates[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [previewLine, setPreviewLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const res = await staffChangePlanAction({
          subscriptionId,
          userId,
          targetPlanId,
          reason: reason.trim(),
        });
        setBusy(false);
        setMsg('error' in res ? (res.error ?? 'Błąd') : 'Plan zmieniony. Klient dostanie e-mail.');
      }}
    >
      <p className="text-muted-foreground">
        Plan: <span className="text-white">{currentPlanName}</span>
      </p>
      <select
        value={targetPlanId}
        onChange={async (e) => {
          const id = e.target.value;
          setTargetPlanId(id);
          const p = await staffPreviewPlanChangeAction(subscriptionId, id);
          if ('ok' in p && p.ok) {
            setPreviewLine(
              `${p.data.direction}: dopłata ${p.data.amountDue} / uznanie ${p.data.amountCredit} ${p.data.currency}`,
            );
          } else {
            setPreviewLine(null);
          }
        }}
        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
      >
        {candidates.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {previewLine ? <p className="text-xs text-cyan-200/90">{previewLine}</p> : null}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Powód (ticket / audyt)"
        className="w-full min-h-[64px] rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
      />
      {msg ? <p className="text-xs text-neutral-300">{msg}</p> : null}
      <button
        type="submit"
        disabled={busy || !targetPlanId || reason.trim().length < 3}
        className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        Zmień plan (z rozliczeniem)
      </button>
    </form>
  );
}
