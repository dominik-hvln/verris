"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, Loader2, Play } from "lucide-react";
import type { StaffCustomerProfile } from "@/lib/crm-profile-data";
import { staffRunDnsTlsDiagnosticAction } from "./actions";

interface Props {
  userId: string;
  subscriptions: StaffCustomerProfile["subscriptions"];
}

export function StaffDnsTlsPanel({ userId, subscriptions }: Props) {
  const withAccount = useMemo(
    () => subscriptions.filter((s) => s.account?.domain),
    [subscriptions],
  );
  const [subscriptionId, setSubscriptionId] = useState(() => withAccount[0]?.id ?? "");
  const [domainOverride, setDomainOverride] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    setRaw(null);
    startTransition(async () => {
      const dom = domainOverride.trim();
      const res = await staffRunDnsTlsDiagnosticAction(userId, {
        subscriptionId: dom ? undefined : subscriptionId || undefined,
        domain: dom || undefined,
      });
      if (res.ok === false) {
        setError(res.error);
        return;
      }
      setRaw(JSON.stringify(res.data, null, 2));
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-black/30">
      <h2 className="border-b border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
        Diagnostyka DNS + TLS
      </h2>
      <div className="space-y-4 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Sprawdzenie rekordów DNS i certyfikatu na porcie 443 dla domeny konta hostingowego. Każde uruchomienie
          jest zapisywane w audycie.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Subskrypcja (domena DA)
            </span>
            <select
              value={subscriptionId}
              onChange={(e) => setSubscriptionId(e.target.value)}
              disabled={!!domainOverride.trim() || withAccount.length === 0}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {withAccount.length === 0 ? (
                <option value="">Brak konta z domeną</option>
              ) : null}
              {withAccount.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.plan.name} — {s.account?.domain}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Lub domena ręcznie (FQDN konta)
            </span>
            <input
              value={domainOverride}
              onChange={(e) => setDomainOverride(e.target.value)}
              placeholder="np. example.pl"
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
            />
          </label>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={run}
          disabled={pending || (!domainOverride.trim() && !subscriptionId)}
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/35 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Uruchom
        </button>

        {raw ? (
          <pre className="max-h-[28rem] overflow-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-[11px] text-neutral-200">
            {raw}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
