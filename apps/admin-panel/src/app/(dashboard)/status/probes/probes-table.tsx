"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, EyeOff, Loader2, Save, Trash2, XCircle } from "lucide-react";
import {
  deleteProbe,
  updateProbe,
  type ProbeDto,
  type ProbeKind,
  type ProbeSeverity,
  type ServerSummary,
} from "../actions";

interface Props {
  probes: ProbeDto[];
  servers: ServerSummary[];
}

const KIND_LABELS: Record<ProbeKind, string> = {
  HTTP: "HTTP",
  HTTPS: "HTTPS",
  SMTP: "SMTP",
  IMAP: "IMAP",
  POP3: "POP3",
  MYSQL: "MySQL",
  SSH: "SSH",
  DA_API: "DA-API",
  DNS: "DNS",
};

export function ProbesTable({ probes, servers }: Props) {
  const serverMap = new Map(servers.map((s) => [s.id, s.name ?? s.id] as const));

  if (probes.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
        <p className="text-base font-semibold text-white">Brak probes</p>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Dodaj pierwszą probe po prawej. Bez probes ani publiczna strona statusu, ani engine
          incydentów nie zaczną pracować.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-black/40 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-white/5 bg-white/[0.02]">
          <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            <th className="px-4 py-3">Serwer</th>
            <th className="px-4 py-3">Kind</th>
            <th className="px-4 py-3">Target</th>
            <th className="px-4 py-3">Severity</th>
            <th className="px-4 py-3">SLA</th>
            <th className="px-4 py-3">Stan</th>
            <th className="px-4 py-3 text-right">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {probes.map((probe) => (
            <ProbeRow
              key={probe.id}
              probe={probe}
              serverName={serverMap.get(probe.serverId) ?? probe.serverId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProbeRow({ probe, serverName }: { probe: ProbeDto; serverName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(probe.target);
  const [label, setLabel] = useState(probe.label ?? "");
  const [severity, setSeverity] = useState<ProbeSeverity>(probe.severity);
  const [sla, setSla] = useState<string>(probe.declaredSlaPct);
  const [isEnabled, setIsEnabled] = useState(probe.isEnabled);
  const [isPublic, setIsPublic] = useState(probe.isPublic);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setTarget(probe.target);
    setLabel(probe.label ?? "");
    setSeverity(probe.severity);
    setSla(probe.declaredSlaPct);
    setIsEnabled(probe.isEnabled);
    setIsPublic(probe.isPublic);
    setEditing(false);
    setError(null);
  };

  const save = () => {
    setError(null);
    const slaNum = Number.parseFloat(sla);
    if (Number.isNaN(slaNum) || slaNum < 0 || slaNum > 100) {
      setError("SLA musi być liczbą 0–100 (np. 99.9000)");
      return;
    }
    startTransition(async () => {
      const res = await updateProbe(probe.id, {
        target,
        label: label.trim() === "" ? null : label,
        severity,
        declaredSlaPct: slaNum,
        isEnabled,
        isPublic,
      });
      if (!res.ok) {
        setError(res.error ?? "Nie udało się zapisać");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  const onDelete = () => {
    if (!confirm(`Usunąć probe ${KIND_LABELS[probe.kind]} → ${probe.target}?`)) return;
    startTransition(async () => {
      const res = await deleteProbe(probe.id);
      if (!res.ok) setError(res.error ?? "Nie udało się usunąć");
      else router.refresh();
    });
  };

  return (
    <tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
      <td className="px-4 py-4 align-top">
        <div className="font-semibold text-white text-xs">{serverName}</div>
        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{probe.serverId.slice(0, 8)}…</div>
      </td>
      <td className="px-4 py-4 align-top">
        <span className="inline-flex items-center rounded-md border border-indigo-400/30 bg-indigo-400/10 px-2 py-0.5 text-[11px] font-bold text-indigo-200">
          {KIND_LABELS[probe.kind]}
        </span>
      </td>
      <td className="px-4 py-4 align-top">
        {editing ? (
          <div className="space-y-1.5">
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full rounded-md bg-black/60 border border-white/10 px-2 py-1 text-white text-xs font-mono focus:border-indigo-400 focus:outline-none"
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="etykieta (opcjonalne)"
              className="w-full rounded-md bg-black/60 border border-white/10 px-2 py-1 text-white text-xs focus:border-indigo-400 focus:outline-none"
            />
          </div>
        ) : (
          <div>
            <code className="text-xs font-mono text-white break-all">{probe.target}</code>
            {probe.label ? (
              <div className="text-[11px] text-muted-foreground mt-0.5">{probe.label}</div>
            ) : null}
          </div>
        )}
      </td>
      <td className="px-4 py-4 align-top">
        {editing ? (
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as ProbeSeverity)}
            className="rounded-md bg-black/60 border border-white/10 px-2 py-1 text-white text-xs"
          >
            <option value="MINOR">MINOR</option>
            <option value="MAJOR">MAJOR</option>
          </select>
        ) : (
          <SeverityBadge severity={probe.severity} />
        )}
      </td>
      <td className="px-4 py-4 align-top">
        {editing ? (
          <input
            value={sla}
            onChange={(e) => setSla(e.target.value)}
            type="number"
            step="0.0001"
            min="0"
            max="100"
            className="w-24 rounded-md bg-black/60 border border-white/10 px-2 py-1 text-white text-xs font-mono"
          />
        ) : (
          <span className="font-mono text-xs text-muted-foreground">
            {Number(probe.declaredSlaPct).toFixed(4)}%
          </span>
        )}
      </td>
      <td className="px-4 py-4 align-top">
        {editing ? (
          <div className="space-y-1 text-[11px]">
            <label className="flex items-center gap-1.5 text-white">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
              />
              Aktywna
            </label>
            <label className="flex items-center gap-1.5 text-white">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              Publiczna
            </label>
          </div>
        ) : (
          <ProbeStateBadge enabled={probe.isEnabled} isPublic={probe.isPublic} failures={probe.consecutiveFailures} />
        )}
      </td>
      <td className="px-4 py-4 align-top">
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
          {editing ? (
            <>
              <button
                onClick={save}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 px-2.5 py-1 text-[11px] font-bold text-indigo-200 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Zapisz
              </button>
              <button
                onClick={reset}
                disabled={pending}
                className="rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-[11px] text-white"
              >
                Anuluj
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white"
              >
                Edytuj
              </button>
              <button
                onClick={onDelete}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md border border-rose-400/30 bg-rose-400/10 hover:bg-rose-400/20 px-2.5 py-1 text-[11px] font-medium text-rose-200 disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Usuń
              </button>
            </>
          )}
        </div>
        {error && <div className="mt-2 text-right text-[11px] text-rose-300">{error}</div>}
      </td>
    </tr>
  );
}

function SeverityBadge({ severity }: { severity: ProbeSeverity }) {
  if (severity === "MAJOR") {
    return (
      <span className="inline-flex items-center rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[10px] font-bold text-rose-200">
        Poważny
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">
      Drobny
    </span>
  );
}

function ProbeStateBadge({
  enabled,
  isPublic,
  failures,
}: {
  enabled: boolean;
  isPublic: boolean;
  failures: number;
}) {
  if (!enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
        <XCircle className="h-3 w-3" /> Wyłączona
      </span>
    );
  }
  return (
    <div className="space-y-1 text-[10px]">
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-bold text-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Aktywna
      </span>
      {!isPublic && (
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-medium text-muted-foreground">
          <EyeOff className="h-3 w-3" /> Wewn.
        </span>
      )}
      {failures > 0 && (
        <span className="inline-flex items-center rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 font-bold text-rose-200">
          {failures}× fail
        </span>
      )}
    </div>
  );
}
