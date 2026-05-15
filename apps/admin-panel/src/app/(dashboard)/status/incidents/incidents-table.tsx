"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Pencil, Save } from "lucide-react";
import { updateIncident, type IncidentDto } from "../actions";

interface Props {
  incidents: IncidentDto[];
}

export function IncidentsTable({ incidents }: Props) {
  if (incidents.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
        <p className="text-base font-semibold text-white">Brak incydentów</p>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Świetnie. W tym oknie engine nie wykrył 2 kolejnych nieudanych probes na żadnej z
          aktywnych usług.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-black/40 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-white/5 bg-white/[0.02]">
          <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            <th className="px-4 py-3">Serwer / Probe</th>
            <th className="px-4 py-3">Severity</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Czas trwania</th>
            <th className="px-4 py-3">Treść</th>
            <th className="px-4 py-3 text-right">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((incident) => (
            <IncidentRow key={incident.id} incident={incident} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IncidentRow({ incident }: { incident: IncidentDto }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(incident.title);
  const [publicMessage, setPublicMessage] = useState(incident.publicMessage ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const startedAt = new Date(incident.startedAt);
  const resolvedAt = incident.resolvedAt ? new Date(incident.resolvedAt) : null;
  const duration = resolvedAt
    ? Math.round((resolvedAt.getTime() - startedAt.getTime()) / 60000)
    : Math.round((Date.now() - startedAt.getTime()) / 60000);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateIncident(incident.id, {
        title,
        publicMessage: publicMessage.trim() === "" ? null : publicMessage,
      });
      if (!res.ok) {
        setError(res.error ?? "Nie udało się zapisać");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] align-top">
      <td className="px-4 py-4">
        <div className="font-semibold text-white text-xs">
          {incident.probe.server.name ?? incident.probe.server.id}
        </div>
        <div className="text-[11px] text-muted-foreground mt-1 font-mono">
          {incident.probe.kind} → {incident.probe.target}
        </div>
      </td>
      <td className="px-4 py-4">
        {incident.severity === "MAJOR" ? (
          <span className="inline-flex items-center rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-[10px] font-bold text-rose-200">
            Poważny
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold text-amber-200">
            Drobny
          </span>
        )}
      </td>
      <td className="px-4 py-4">
        {incident.status === "OPEN" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-[10px] font-bold text-rose-200">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
            Otwarty
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-200">
            <CheckCircle2 className="h-3 w-3" />
            Rozwiązany
          </span>
        )}
      </td>
      <td className="px-4 py-4 text-xs">
        <div className="text-white font-mono">{duration} min</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          start: {startedAt.toLocaleString("pl-PL")}
        </div>
        {resolvedAt && (
          <div className="text-[11px] text-muted-foreground">
            koniec: {resolvedAt.toLocaleString("pl-PL")}
          </div>
        )}
      </td>
      <td className="px-4 py-4 text-xs max-w-md">
        {editing ? (
          <div className="space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tytuł"
              className="w-full rounded-md bg-black/60 border border-white/10 px-2 py-1 text-white text-xs focus:border-indigo-400 focus:outline-none"
            />
            <textarea
              value={publicMessage}
              onChange={(e) => setPublicMessage(e.target.value)}
              placeholder="Komunikat publiczny (widoczny na status.verris.pl)"
              rows={3}
              className="w-full rounded-md bg-black/60 border border-white/10 px-2 py-1 text-white text-xs focus:border-indigo-400 focus:outline-none"
            />
            {error && <div className="text-[11px] text-rose-300">{error}</div>}
          </div>
        ) : (
          <div>
            <div className="font-semibold text-white">{incident.title}</div>
            {incident.publicMessage && (
              <div className="mt-1 text-[11px] text-muted-foreground line-clamp-3">
                {incident.publicMessage}
              </div>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center justify-end gap-1.5">
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
                onClick={() => {
                  setEditing(false);
                  setTitle(incident.title);
                  setPublicMessage(incident.publicMessage ?? "");
                  setError(null);
                }}
                disabled={pending}
                className="rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-[11px] text-white"
              >
                Anuluj
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white"
            >
              <Pencil className="h-3 w-3" />
              Edytuj
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
