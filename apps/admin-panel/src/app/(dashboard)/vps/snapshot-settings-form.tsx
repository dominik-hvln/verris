"use client";

import { useActionState } from "react";
import { Camera, Loader2, Save } from "lucide-react";
import { updateVpsSnapshotSettingsAction, type VpsSnapshotSettings } from "./actions";

/** Q-08 — snapshoty VPS: cena za GB miesięcznie (pusta = klient ich nie widzi) i limit na serwer. */
export function SnapshotSettingsForm({ initial }: { initial: VpsSnapshotSettings }) {
  const [state, action, pending] = useActionState(updateVpsSnapshotSettingsAction, {});

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-6 max-w-2xl">
      <legend className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-violet-300">
        <Camera className="h-4 w-4" /> Snapshoty VPS
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-neutral-300">Cena za GB miesięcznie (K)</span>
          <input
            type="text"
            inputMode="decimal"
            name="pricePerGbMonthly"
            defaultValue={initial.pricePerGbMonthly ?? ""}
            placeholder="np. 0,06"
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-neutral-300">Limit snapshotów na serwer</span>
          <input
            type="number"
            name="limit"
            min={1}
            max={20}
            defaultValue={initial.limit}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
          />
        </label>
      </div>
      <p className="text-[11px] text-neutral-500">
        Dostawca liczy snapshoty za GB miesięcznie. Opłata dolicza się z dołu do odnowienia VPS-a (pełny miesiąc za każdy
        snapshot przechowywany w minionym okresie). Pusta cena = snapshoty wyłączone i ukryte w panelu klienta.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-700 hover:bg-violet-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Zapisz
        </button>
        {state.ok ? <span className="text-xs text-emerald-300">Zapisano.</span> : null}
        {state.error ? <span className="text-xs text-rose-300">{state.error}</span> : null}
      </div>
    </form>
  );
}
