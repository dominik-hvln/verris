"use client";

import { useId, useState } from "react";
import { Select } from "@/components/select";
import { zlecMigracjeWewnetrznaAction } from "./obsluga-actions";

export interface WezelDocelowy {
  id: string;
  name: string | null;
  region: string | null;
}

const MIN_POWOD = 10;

/**
 * PB-44 — zlecenie migracji wewnętrznej (G-7) przez pracownika obsługi. Worker robi kopię konta i zakłada
 * zgłoszenie do przeniesienia. Wymaga powodu (dziennik) i drugiego kliknięcia (potwierdzenie w panelu,
 * bez okna przeglądarki).
 */
export function MigracjaWewnetrznaForm({
  subscriptionId,
  userId,
  domain,
  wezly,
}: {
  subscriptionId: string;
  userId: string;
  domain: string;
  /** Aktywne węzły poza bieżącym. */
  wezly: WezelDocelowy[];
}) {
  const idPola = useId();
  const [cel, setCel] = useState(wezly[0]?.id ?? "");
  const [powod, setPowod] = useState("");
  const [potwierdz, setPotwierdz] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [zlecono, setZlecono] = useState(false);

  if (wezly.length === 0) {
    return <p className="text-sm text-muted-foreground">Brak innego aktywnego węzła — nie ma dokąd przenieść konta.</p>;
  }

  const nazwa = (w: WezelDocelowy) => `${w.name ?? w.id}${w.region ? ` (${w.region})` : ""}`;
  const wybrany = wezly.find((w) => w.id === cel);
  const gotowe = !!cel && powod.trim().length >= MIN_POWOD && !zlecono;

  const zlec = async () => {
    setBusy(true);
    setMsg(null);
    const r = await zlecMigracjeWewnetrznaAction({ subscriptionId, userId, targetServerId: cel, notes: powod.trim() });
    setBusy(false);
    setPotwierdz(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setZlecono(true);
    setMsg({ ok: true, text: "Zlecono migrację wewnętrzną. Worker przygotuje kopię konta i zgłoszenie — zobaczysz je w historii migracji." });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor={idPola} className="text-xs text-neutral-400">
          Docelowy węzeł
        </label>
        <Select
          id={idPola}
          value={cel}
          onChange={(v) => {
            setCel(v);
            setPotwierdz(false);
          }}
          disabled={busy || zlecono}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          options={wezly.map((w) => ({ value: w.id, label: nazwa(w) }))}
        />
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-neutral-400">Powód (zapisze się w dzienniku, min. {MIN_POWOD} znaków), np. numer zgłoszenia</span>
        <textarea
          value={powod}
          onChange={(e) => setPowod(e.target.value)}
          disabled={busy || zlecono}
          maxLength={1000}
          className="min-h-[60px] w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        />
      </label>
      {potwierdz && wybrany ? (
        <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p>
            Przenieść konto <span className="font-mono">{domain}</span> na węzeł <strong>{nazwa(wybrany)}</strong>? Powstanie kopia konta
            i zgłoszenie do przeniesienia.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={zlec}
              disabled={busy}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
            >
              {busy ? "Zlecanie…" : "Tak, zleć migrację"}
            </button>
            <button
              type="button"
              onClick={() => setPotwierdz(false)}
              disabled={busy}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/10"
            >
              Anuluj
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPotwierdz(true)}
          disabled={!gotowe}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Zleć migrację wewnętrzną
        </button>
      )}
      {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p> : null}
    </div>
  );
}
