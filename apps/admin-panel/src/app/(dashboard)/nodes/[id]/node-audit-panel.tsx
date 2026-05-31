"use client";

import { useCallback, useState, useTransition } from "react";
import {
  Loader2,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  HelpCircle,
  RefreshCw,
  Wrench,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type {
  AuditCheckDto,
  AuditCheckStatus,
  NodeAuditReportDto,
  RepairRisk,
} from "@verris/contracts";
import { fetchNodeAudit, repairNode } from "../actions";

const STATUS_META: Record<
  AuditCheckStatus,
  { label: string; cls: string; Icon: typeof ShieldCheck }
> = {
  OK: { label: "OK", cls: "text-emerald-200 bg-emerald-500/15 border-emerald-500/30", Icon: ShieldCheck },
  WARN: { label: "Ostrzeżenie", cls: "text-amber-200 bg-amber-500/15 border-amber-500/30", Icon: AlertTriangle },
  FAIL: { label: "Błąd", cls: "text-rose-200 bg-rose-500/15 border-rose-500/30", Icon: XCircle },
  UNKNOWN: { label: "Nieznane", cls: "text-zinc-300 bg-zinc-500/15 border-zinc-500/30", Icon: HelpCircle },
};

const RISK_META: Record<RepairRisk, { label: string; cls: string }> = {
  safe: { label: "bezinwazyjna", cls: "text-emerald-200 border-emerald-500/30 bg-emerald-500/10" },
  caution: { label: "ostrożna", cls: "text-amber-200 border-amber-500/30 bg-amber-500/10" },
  danger: { label: "ryzykowna", cls: "text-rose-200 border-rose-500/30 bg-rose-500/10" },
};

export function NodeAuditPanel({ serverId, serverName }: { serverId: string; serverName: string | null }) {
  const [report, setReport] = useState<NodeAuditReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [hasRun, setHasRun] = useState(false);

  const runAudit = useCallback(() => {
    setError(null);
    startLoad(async () => {
      const res = await fetchNodeAudit(serverId);
      if (res.error || !res.data) {
        setError(res.error ?? "Nie udało się uruchomić audytu");
        return;
      }
      setReport(res.data);
      setHasRun(true);
    });
  }, [serverId]);

  const onCheckRevalidated = useCallback((updated: AuditCheckDto) => {
    setReport((prev) => {
      if (!prev) return prev;
      const checks = prev.checks.map((c) => (c.id === updated.id ? updated : c));
      return { ...prev, checks, status: worstStatus(checks.map((c) => c.status)) };
    });
  }, []);

  const safeRepairs = report?.checks.filter((c) => c.repair && c.repair.risk === "safe") ?? [];

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Wrench className="h-4 w-4 text-indigo-300" /> Audyt i naprawa węzła
          </div>
          <p className="mt-1 text-xs text-muted-foreground max-w-xl">
            Walidator dwufazowy (istnienie → zgodność z planem i dokumentacją DA/CloudLinux).
            Audyt jest <strong className="text-white">bezinwazyjny</strong> (tylko odczyt) — można go
            uruchomić na węźle produkcyjnym z klientami. Naprawy wykonujesz świadomie, pojedynczo.
          </p>
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 px-3.5 py-2 text-sm font-medium transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {report ? "Sprawdź ponownie" : "Uruchom audyt"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <XCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {!hasRun && !loading && (
        <p className="text-sm text-muted-foreground">
          Kliknij „Uruchom audyt”, aby sprawdzić pakiety DA, język, hostname/daHost, DNS, TLS i agenta.
        </p>
      )}

      {report && (
        <>
          <div className="flex items-center justify-between gap-4 flex-wrap rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center gap-3">
              <StatusBadge status={report.status} />
              <div className="text-xs text-muted-foreground">
                Wygenerowano {new Date(report.generatedAt).toLocaleString("pl-PL")} • agent{" "}
                {report.stackVersions.agent ?? "—"}
              </div>
            </div>
            {safeRepairs.length > 0 && (
              <BulkSafeRepair
                serverId={serverId}
                checks={safeRepairs}
                onRevalidated={onCheckRevalidated}
              />
            )}
          </div>

          <ul className="space-y-3">
            {report.checks.map((check) => (
              <CheckRow
                key={check.id}
                serverId={serverId}
                serverName={serverName}
                check={check}
                onRevalidated={onCheckRevalidated}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: AuditCheckStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${meta.cls}`}>
      <Icon className="h-3.5 w-3.5" /> {meta.label}
    </span>
  );
}

function CheckRow({
  serverId,
  serverName,
  check,
  onRevalidated,
}: {
  serverId: string;
  serverName: string | null;
  check: AuditCheckDto;
  onRevalidated: (c: AuditCheckDto) => void;
}) {
  const [open, setOpen] = useState(check.status !== "OK");
  const meta = STATUS_META[check.status];
  const Icon = meta.Icon;

  return (
    <li className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <Icon className={`h-4 w-4 shrink-0 ${meta.cls.split(" ")[0]}`} />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-white truncate">{check.title}</span>
            <span className="block text-xs text-muted-foreground truncate">{check.summary}</span>
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <StatusBadge status={check.status} />
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-white/10 px-4 py-3 space-y-3">
          {check.records.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1 pr-3 font-medium">Pole</th>
                    <th className="py-1 pr-3 font-medium">Oczekiwane</th>
                    <th className="py-1 pr-3 font-medium">Rzeczywiste</th>
                  </tr>
                </thead>
                <tbody>
                  {check.records.map((r, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="py-1 pr-3 text-muted-foreground">{r.label}</td>
                      <td className="py-1 pr-3 text-white/80">{r.expected ?? "—"}</td>
                      <td
                        className={`py-1 pr-3 font-medium ${
                          r.ok === undefined ? "text-white/80" : r.ok ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {r.actual ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {check.docAttestation.length > 0 && (
            <div className="space-y-1.5">
              {check.docAttestation.map((doc, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-[11px] text-muted-foreground"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-indigo-300 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white/90">{doc.vendor}</strong>: {doc.statement}
                    {doc.verifiedAt ? ` (zweryfikowano ${doc.verifiedAt})` : ""}
                    {doc.reference ? (
                      <>
                        {" "}
                        <a
                          href={normalizeRef(doc.reference)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-indigo-300 hover:text-indigo-200 underline"
                        >
                          dokumentacja <ExternalLink className="h-3 w-3" />
                        </a>
                      </>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}

          {check.repair && (
            <RepairControl
              serverId={serverId}
              serverName={serverName}
              repair={check.repair}
              onRevalidated={onRevalidated}
            />
          )}
        </div>
      )}
    </li>
  );
}

function RepairControl({
  serverId,
  serverName,
  repair,
  onRevalidated,
}: {
  serverId: string;
  serverName: string | null;
  repair: NonNullable<AuditCheckDto["repair"]>;
  onRevalidated: (c: AuditCheckDto) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, startRepair] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const risk = RISK_META[repair.risk];

  const run = () => {
    setResult(null);
    startRepair(async () => {
      const res = await repairNode(serverId, repair.actionId, confirmText || undefined);
      if (res.error || !res.data) {
        setResult({ ok: false, message: res.error ?? "Naprawa nie powiodła się" });
        return;
      }
      setResult({ ok: res.data.ok, message: res.data.message });
      if (res.data.check) onRevalidated(res.data.check);
      setConfirming(false);
      setConfirmText("");
    });
  };

  const onClick = () => {
    if (repair.requiresConfirmation && !confirming) {
      setConfirming(true);
      return;
    }
    if (repair.risk === "danger" && confirmText.trim() !== (repair.confirmValue ?? serverName ?? "")) {
      setResult({ ok: false, message: `Wpisz dokładnie nazwę węzła, aby potwierdzić: ${repair.confirmValue ?? serverName ?? ""}` });
      return;
    }
    run();
  };

  return (
    <div className={`rounded-lg border px-3 py-2.5 space-y-2 ${risk.cls}`}>
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium uppercase tracking-wide">
          {risk.label}
        </span>
        <span className="font-medium text-white">{repair.label}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-white/80">{repair.description}</p>
      {repair.warning && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {repair.warning}
        </p>
      )}

      {confirming && repair.risk === "danger" && (
        <div className="space-y-1">
          <label className="block text-[11px] text-white/80">
            Wpisz nazwę węzła <code className="text-white">{repair.confirmValue ?? serverName}</code>, aby
            potwierdzić:
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full rounded-md bg-black/40 border border-white/15 px-2 py-1 text-xs text-white outline-none focus:border-rose-400"
            placeholder={repair.confirmValue ?? serverName ?? ""}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onClick}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-60 px-2.5 py-1.5 text-xs font-medium transition-colors"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
          {confirming ? "Potwierdź i napraw" : repair.requiresConfirmation ? "Napraw…" : "Napraw"}
        </button>
        {confirming && (
          <button
            onClick={() => {
              setConfirming(false);
              setConfirmText("");
            }}
            className="text-xs text-muted-foreground hover:text-white"
          >
            Anuluj
          </button>
        )}
      </div>

      {result && (
        <p className={`text-[11px] ${result.ok ? "text-emerald-300" : "text-rose-300"}`}>{result.message}</p>
      )}
    </div>
  );
}

function BulkSafeRepair({
  serverId,
  checks,
  onRevalidated,
}: {
  serverId: string;
  checks: AuditCheckDto[];
  onRevalidated: (c: AuditCheckDto) => void;
}) {
  const [busy, startBulk] = useTransition();
  const [done, setDone] = useState<string | null>(null);

  const run = () => {
    setDone(null);
    startBulk(async () => {
      let ok = 0;
      for (const check of checks) {
        if (!check.repair) continue;
        const res = await repairNode(serverId, check.repair.actionId);
        if (res.data?.ok) {
          ok += 1;
          if (res.data.check) onRevalidated(res.data.check);
        }
      }
      setDone(`Naprawiono ${ok}/${checks.length} bezpiecznych niezgodności.`);
    });
  };

  return (
    <div className="flex items-center gap-2">
      {done && <span className="text-[11px] text-emerald-300">{done}</span>}
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-60 px-2.5 py-1.5 text-xs font-medium text-emerald-200 transition-colors"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        Napraw wszystkie bezpieczne ({checks.length})
      </button>
    </div>
  );
}

function worstStatus(statuses: AuditCheckStatus[]): AuditCheckStatus {
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.includes("WARN")) return "WARN";
  if (statuses.length > 0 && statuses.every((s) => s === "UNKNOWN")) return "UNKNOWN";
  return "OK";
}

/** Repo-relative references become GitHub-less local hints; keep external URLs as-is. */
function normalizeRef(ref: string): string {
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  return `https://github.com/verris/ekohost/blob/main/${ref}`;
}
