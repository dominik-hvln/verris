"use client";

import { useEffect, useState, useTransition } from "react";
import { Globe2, Check, AlertCircle, Sparkles, Loader2 } from "lucide-react";
import type { NodeNameserversDto } from "@verris/contracts";
import {
  fetchNodeNameservers,
  updateNodeNameservers,
  fetchNodeDnsStatus,
  provisionNodeNameservers,
  type NsProvisionResultDto,
} from "../actions";

const STEP_STATUS_STYLE: Record<NsProvisionResultDto["steps"][number]["status"], string> = {
  created: "text-emerald-300",
  updated: "text-emerald-300",
  unchanged: "text-muted-foreground",
  skipped: "text-amber-300",
  error: "text-rose-300",
};

const SOURCE_LABEL: Record<NodeNameserversDto["effective"]["source"], string> = {
  node: "ustawione na węźle",
  platform: "dziedziczone z platformy",
  none: "brak — konta użyją NS z DirectAdmin",
};

export function NameserversForm({ serverId }: { serverId: string }) {
  const [data, setData] = useState<NodeNameserversDto | null>(null);
  const [ns1, setNs1] = useState("");
  const [ns2, setNs2] = useState("");
  const [ns3, setNs3] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  const [ovhConfigured, setOvhConfigured] = useState(false);
  const [ipv6, setIpv6] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<NsProvisionResultDto | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetchNodeNameservers(serverId);
      if (res.data) {
        setData(res.data);
        setNs1(res.data.ns1 ?? "");
        setNs2(res.data.ns2 ?? "");
        setNs3(res.data.ns3 ?? "");
      } else {
        setError(res.error ?? "Nie udało się pobrać NS.");
      }
      const status = await fetchNodeDnsStatus();
      setOvhConfigured(Boolean(status.data?.ovhConfigured));
    })();
  }, [serverId]);

  const provision = async () => {
    setProvisionError(null);
    setProvisionResult(null);
    setProvisioning(true);
    try {
      const res = await provisionNodeNameservers(serverId, ipv6.trim() || undefined);
      if (res.data) {
        setProvisionResult(res.data);
        setNs1(res.data.ns1);
        setNs2(res.data.ns2);
        const refreshed = await fetchNodeNameservers(serverId);
        if (refreshed.data) setData(refreshed.data);
      } else {
        setProvisionError(res.error ?? "Nie udało się wykonać automatu OVH.");
      }
    } finally {
      setProvisioning(false);
    }
  };

  const save = () => {
    setError(null);
    setOk(false);
    startTransition(async () => {
      const res = await updateNodeNameservers(serverId, { ns1, ns2, ns3 });
      if (res.data) {
        setData(res.data);
        setNs1(res.data.ns1 ?? "");
        setNs2(res.data.ns2 ?? "");
        setNs3(res.data.ns3 ?? "");
        setOk(true);
      } else {
        setError(res.error ?? "Nie udało się zapisać NS.");
      }
    });
  };

  const eff = data?.effective;
  const plat = data?.platformDefault;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Globe2 className="h-4 w-4 text-emerald-300" /> Serwery nazw (NS) węzła
      </div>
      <p className="text-xs text-muted-foreground">
        Te NS trafiają do każdego konta zakładanego na tym węźle (DA <code>ns1/ns2</code>). Zostaw
        puste, aby dziedziczyć platformowy domyślny zestaw. Na start możesz wskazać NS od OVH; po
        zbudowaniu własnego klastra wpiszesz <code>ns1/ns2/ns3.verris.pl</code>.
      </p>

      {eff ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs">
          <span className="text-muted-foreground">Aktualnie efektywne ({SOURCE_LABEL[eff.source]}): </span>
          <span className="font-mono text-white">
            {eff.ns1 || "—"}
            {eff.ns2 ? `, ${eff.ns2}` : ""}
            {eff.ns3 ? `, ${eff.ns3}` : ""}
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="ns1" value={ns1} onChange={setNs1} placeholder={plat?.ns1 || "ns1.verris.pl"} />
        <Field label="ns2" value={ns2} onChange={setNs2} placeholder={plat?.ns2 || "ns2.verris.pl"} />
        <Field label="ns3 (opc.)" value={ns3} onChange={setNs3} placeholder={plat?.ns3 || "ns3.verris.pl"} />
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 text-sm text-rose-300">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      ) : null}
      {ok ? (
        <p className="flex items-center gap-1.5 text-sm text-emerald-300">
          <Check className="h-4 w-4" /> Zapisano serwery nazw węzła.
        </p>
      ) : null}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-50"
      >
        {pending ? "Zapisywanie…" : "Zapisz NS"}
      </button>

      <div className="mt-2 space-y-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.04] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Sparkles className="h-4 w-4 text-violet-300" /> Automat OVH — podepnij NS (glue + strefa)
        </div>
        <p className="text-xs text-muted-foreground">
          Tworzy/uzgadnia rekordy <code>A</code>/<code>AAAA</code> i wpisy <em>glue</em> w OVH dla
          markowych NS węzła (<code>ns1.&lt;węzeł&gt;.{data?.platformDefault?.ns1?.split(".").slice(-2).join(".") || "verris.pl"}</code>),
          a następnie przypisuje je do węzła. Działa idempotentnie. IPv4 brane jest z konfiguracji węzła.
        </p>

        {ovhConfigured ? (
          <>
            <label className="block max-w-sm">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
                IPv6 węzła (opcjonalnie — włącza AAAA)
              </span>
              <input
                value={ipv6}
                onChange={(e) => setIpv6(e.target.value)}
                placeholder="2001:41d0:…"
                spellCheck={false}
                autoCapitalize="off"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white placeholder:text-muted-foreground/50 focus:border-violet-400/50 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void provision()}
              disabled={provisioning}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm font-medium text-violet-100 hover:bg-violet-400/20 disabled:opacity-50"
            >
              {provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {provisioning ? "Podpinanie w OVH…" : "Podepnij NS w OVH"}
            </button>
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-amber-300">
            <AlertCircle className="h-4 w-4" /> Integracja OVH nieskonfigurowana (ustaw OVH_APP_KEY /
            OVH_APP_SECRET / OVH_CONSUMER_KEY). Możesz wpisać NS ręcznie powyżej.
          </p>
        )}

        {provisionError ? (
          <p className="flex items-center gap-1.5 text-sm text-rose-300">
            <AlertCircle className="h-4 w-4" /> {provisionError}
          </p>
        ) : null}

        {provisionResult ? (
          <div className="space-y-1 rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
            <div className={provisionResult.ok ? "text-emerald-300" : "text-amber-300"}>
              {provisionResult.ok
                ? "Gotowe — NS podpięte w OVH."
                : "Zakończono z ostrzeżeniami — sprawdź kroki poniżej."}
            </div>
            <div className="text-muted-foreground">
              {provisionResult.ns1}, {provisionResult.ns2} → {provisionResult.ipv4}
              {provisionResult.ipv6 ? `, ${provisionResult.ipv6}` : ""}
            </div>
            <ul className="mt-1 space-y-0.5">
              {provisionResult.steps.map((s, i) => (
                <li key={i} className={STEP_STATUS_STYLE[s.status]}>
                  • {s.step} — {s.status}
                  {s.detail ? <span className="text-muted-foreground"> ({s.detail})</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white placeholder:text-muted-foreground/50 focus:border-emerald-400/50 focus:outline-none"
      />
    </label>
  );
}
