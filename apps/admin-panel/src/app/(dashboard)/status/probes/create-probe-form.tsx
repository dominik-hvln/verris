"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, AlertCircle } from "lucide-react";
import {
  createProbe,
  type ProbeKind,
  type ProbeSeverity,
  type ServerSummary,
} from "../actions";

interface Props {
  servers: ServerSummary[];
}

const KIND_HINTS: Record<ProbeKind, string> = {
  HTTP: "http://example.com/",
  HTTPS: "https://example.com/",
  SMTP: "mail.example.com:25",
  IMAP: "mail.example.com:143",
  POP3: "mail.example.com:110",
  MYSQL: "db.example.com:3306",
  SSH: "node.example.com:22",
  DA_API: "https://da.example.com:2222/",
  DNS: "example.com",
};

const KIND_DEFAULT_SEVERITY: Record<ProbeKind, ProbeSeverity> = {
  HTTP: "MAJOR",
  HTTPS: "MAJOR",
  MYSQL: "MAJOR",
  DA_API: "MAJOR",
  SMTP: "MINOR",
  IMAP: "MINOR",
  POP3: "MINOR",
  SSH: "MINOR",
  DNS: "MINOR",
};

export function CreateProbeForm({ servers }: Props) {
  const router = useRouter();
  const [serverId, setServerId] = useState<string>(servers[0]?.id ?? "");
  const [kind, setKind] = useState<ProbeKind>("HTTPS");
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [severity, setSeverity] = useState<ProbeSeverity>("MAJOR");
  const [sla, setSla] = useState<string>("99.9000");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onKindChange = (k: ProbeKind) => {
    setKind(k);
    setSeverity(KIND_DEFAULT_SEVERITY[k]);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!serverId) {
      setError("Wybierz serwer");
      return;
    }
    if (target.trim().length < 3) {
      setError("Target musi mieć co najmniej 3 znaki");
      return;
    }
    const slaNum = Number.parseFloat(sla);
    if (Number.isNaN(slaNum) || slaNum < 0 || slaNum > 100) {
      setError("SLA musi być liczbą 0–100");
      return;
    }
    startTransition(async () => {
      const res = await createProbe({
        serverId,
        kind,
        target: target.trim(),
        label: label.trim() || undefined,
        severity,
        declaredSlaPct: slaNum,
        isEnabled: true,
        isPublic,
      });
      if (!res.ok) {
        setError(res.error ?? "Nie udało się dodać probe");
        return;
      }
      setTarget("");
      setLabel("");
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-white/10 bg-black/40 p-5 space-y-4"
    >
      <div className="flex items-center gap-2 text-white font-semibold">
        <Plus className="h-4 w-4 text-indigo-400" />
        Dodaj probe
      </div>

      {servers.length === 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Brak serwerów. Najpierw zarejestruj serwer w sekcji „Węzły & Serwery”.
        </div>
      ) : null}

      <Field label="Serwer">
        <select
          value={serverId}
          onChange={(e) => setServerId(e.target.value)}
          className="w-full rounded-md bg-black/60 border border-white/10 px-2 py-2 text-white text-sm"
        >
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name ?? s.id}
              {s.region ? ` (${s.region})` : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Typ probe">
        <select
          value={kind}
          onChange={(e) => onKindChange(e.target.value as ProbeKind)}
          className="w-full rounded-md bg-black/60 border border-white/10 px-2 py-2 text-white text-sm"
        >
          <option value="HTTPS">HTTPS</option>
          <option value="HTTP">HTTP</option>
          <option value="DA_API">DA-API</option>
          <option value="MYSQL">MySQL</option>
          <option value="SMTP">SMTP</option>
          <option value="IMAP">IMAP</option>
          <option value="POP3">POP3</option>
          <option value="SSH">SSH</option>
          <option value="DNS">DNS</option>
        </select>
      </Field>

      <Field label="Target" hint={KIND_HINTS[kind]}>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={KIND_HINTS[kind]}
          className="w-full rounded-md bg-black/60 border border-white/10 px-2 py-2 text-white text-sm font-mono"
        />
      </Field>

      <Field label="Etykieta (opcjonalna)">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="np. Sklep Główny"
          className="w-full rounded-md bg-black/60 border border-white/10 px-2 py-2 text-white text-sm"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Severity">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as ProbeSeverity)}
            className="w-full rounded-md bg-black/60 border border-white/10 px-2 py-2 text-white text-sm"
          >
            <option value="MINOR">MINOR (drobny)</option>
            <option value="MAJOR">MAJOR (poważny)</option>
          </select>
        </Field>
        <Field label="SLA %">
          <input
            value={sla}
            onChange={(e) => setSla(e.target.value)}
            type="number"
            step="0.0001"
            min="0"
            max="100"
            className="w-full rounded-md bg-black/60 border border-white/10 px-2 py-2 text-white text-sm font-mono"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-white">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
        />
        Pokaż na publicznej stronie statusu
      </label>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || servers.length === 0}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 px-3 py-2.5 text-sm font-bold text-indigo-200 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Dodaj probe
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs">
      <span className="block mb-1 font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
      {hint ? <span className="block mt-1 text-[10px] text-muted-foreground font-mono">{hint}</span> : null}
    </label>
  );
}
