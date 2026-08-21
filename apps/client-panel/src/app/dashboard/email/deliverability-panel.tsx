'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Copy, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { fetchDeliverability, type DeliverabilityCheck, type DeliverabilityReport } from './deliverability-actions';

const ICON = {
  ok: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  fail: <XCircle className="h-4 w-4 text-rose-400" />,
};

export function DeliverabilityPanel({
  serviceId,
  initial,
}: {
  serviceId: string;
  initial: DeliverabilityReport | null;
}) {
  const [report, setReport] = useState<DeliverabilityReport | null>(initial);
  const [pending, startTransition] = useTransition();

  const refresh = () =>
    startTransition(async () => {
      const r = await fetchDeliverability(serviceId);
      if (r) setReport(r);
      else toast.error('Nie udało się sprawdzić dostarczalności');
    });

  const scoreColor =
    !report ? 'text-neutral-400' : report.score >= 80 ? 'text-emerald-400' : report.score >= 50 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
          <p className="text-sm font-semibold text-white">Dostarczalność poczty</p>
          {report ? <span className={`text-sm font-bold ${scoreColor}`}>{report.score}/100</span> : null}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white hover:bg-white/5 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Sprawdź ponownie
        </button>
      </div>

      {!report ? (
        <p className="text-xs text-neutral-500">Brak danych — kliknij „Sprawdź ponownie".</p>
      ) : (
        <>
          <p className="text-[11px] text-neutral-500">
            Domena <span className="font-mono text-neutral-300">{report.domain ?? '—'}</span>
            {report.sendingIp ? <> · IP serwera <span className="font-mono text-neutral-300">{report.sendingIp}</span></> : null}
          </p>
          <div className="space-y-2">
            {report.checks.map((c) => (
              <CheckRow key={c.key} check={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: DeliverabilityCheck }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">{ICON[check.status]}</div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{check.label}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{check.detail}</p>
          {check.suggestion ? (
            <div className="mt-2 rounded-md border border-emerald-400/20 bg-emerald-400/5 p-2">
              <p className="text-[11px] text-emerald-200/80">Zalecany rekord ({check.suggestion.type}, host <span className="font-mono">{check.suggestion.host}</span>):</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-white">{check.suggestion.value}</code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(check.suggestion!.value)}
                  className="shrink-0 p-1.5 rounded border border-white/10 hover:bg-white/5"
                  title="Kopiuj"
                >
                  <Copy className="h-3 w-3 text-neutral-300" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
