"use client";

import { useEffect, useState, useTransition } from "react";
import { Globe2, Check, AlertCircle } from "lucide-react";
import type { NodeNameserversDto } from "@verris/contracts";
import { fetchNodeNameservers, updateNodeNameservers } from "../actions";

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
    })();
  }, [serverId]);

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
