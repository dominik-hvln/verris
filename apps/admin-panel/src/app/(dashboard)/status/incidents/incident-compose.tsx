"use client";

import { Select } from "@/components/select";
import { useState, useTransition, useId } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone } from "lucide-react";
import { composeIncident, type ProbeDto, type ProbeSeverity, type ServerSummary } from "../actions";

/**
 * N-07 — ogłoszenie awarii na status page, gdy monitoring jej nie widzi
 * (albo zanim zauważy). Incydent ręczny nie zamyka się sam po udanej próbie —
 * zamyka go operator przyciskiem „Rozwiąż”.
 */
export function IncidentCompose({ probes, servers }: { probes: ProbeDto[]; servers: ServerSummary[] }) {
  const incFieldId = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [probeId, setProbeId] = useState(probes[0]?.id ?? "");
  const [severity, setSeverity] = useState<ProbeSeverity>("MAJOR");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const serverName = (id: string) => servers.find((s) => s.id === id)?.name ?? id.slice(0, 8);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-100 hover:bg-rose-500/25"
      >
        <Megaphone className="h-4 w-4" /> Ogłoś incydent
      </button>
    );
  }

  const submit = () => {
    if (title.trim().length < 3) return setError("Tytuł musi mieć co najmniej 3 znaki.");
    if (!window.confirm("Opublikować incydent na status.verris.pl? Klienci i webhooki statusu dostaną powiadomienie.")) return;
    setError(null);
    startTransition(async () => {
      const res = await composeIncident({ probeId, severity, title: title.trim(), publicMessage: message.trim() || undefined });
      if (!res.ok) return setError(res.error ?? "Nie udało się opublikować.");
      setOpen(false);
      setTitle("");
      setMessage("");
      router.refresh();
    });
  };

  return (
    <div className="w-full rounded-xl border border-rose-400/30 bg-rose-500/5 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-white">Nowy incydent na status page</h2>
      {probes.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">
            Incydent przypina się do monitora usługi — najpierw dodaj monitor w{" "}
            <a href="/status/probes" className="text-indigo-300 hover:underline">Probes</a>.
          </p>
          <button onClick={() => setOpen(false)} className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white">
            Zamknij
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            {/* Etykiety obok, nie owijające — klik w listę nie może ponownie aktywować przycisku. */}
            <div className="space-y-1 text-xs">
              <label htmlFor={`${incFieldId}-probe`} className="text-muted-foreground">Usługa (monitor)</label>
              <Select
                id={`${incFieldId}-probe`}
                value={probeId}
                onChange={setProbeId}
                className="w-full rounded-md border border-white/10 bg-black/60 px-2 py-2 text-white"
                options={probes.map((p) => ({
                  value: p.id,
                  label: `${serverName(p.serverId)} · ${p.label ?? `${p.kind} → ${p.target}`}`,
                }))}
              />
            </div>
            <div className="space-y-1 text-xs">
              <label htmlFor={`${incFieldId}-severity`} className="text-muted-foreground">Waga</label>
              <Select
                id={`${incFieldId}-severity`}
                value={severity}
                onChange={(v) => setSeverity(v as ProbeSeverity)}
                className="w-full rounded-md border border-white/10 bg-black/60 px-2 py-2 text-white"
                options={[
                  { value: "MAJOR", label: "Poważny" },
                  { value: "MINOR", label: "Drobny" },
                ]}
              />
            </div>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            placeholder="Tytuł, np. Utrudnienia w wysyłce poczty"
            className="w-full rounded-md border border-white/10 bg-black/60 px-2 py-2 text-xs text-white"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={5000}
            rows={3}
            placeholder="Komunikat dla klientów: co nie działa, kogo dotyczy, kiedy kolejna informacja"
            className="w-full rounded-md border border-white/10 bg-black/60 px-2 py-2 text-xs text-white"
          />
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          <div className="flex gap-2">
            <button onClick={submit} disabled={pending} className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50">
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Opublikuj
            </button>
            <button onClick={() => setOpen(false)} disabled={pending} className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white">
              Anuluj
            </button>
          </div>
        </>
      )}
    </div>
  );
}
