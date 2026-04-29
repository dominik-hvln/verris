"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import type { AutoscalingResource } from "./actions";
import { createPriceRule } from "./actions";

const UNIT_BY_RESOURCE: Record<AutoscalingResource, string> = {
  CPU: "cpu_pct",
  RAM: "ram_mb",
  IO: "io_kbps",
  TRANSFER: "transfer_gb",
};

const HINTS: Record<AutoscalingResource, string> = {
  CPU: "Cena za 1% CPU SPEED na godzinę. Przykład: 0.0002 zł × 100% × 24 h = 0.48 zł/dobę.",
  RAM: "Cena za 1 MB RAM na godzinę. Przykład: 0.000117 zł × 1024 MB × 24 h = 2.87 zł/dobę.",
  IO: "Cena za 1 kbps I/O na godzinę.",
  TRANSFER: "Cena za 1 GB wychodzącego transferu (jednorazowo, nie godzinowo).",
};

export function CreateRuleForm() {
  const router = useRouter();
  const [resource, setResource] = useState<AutoscalingResource>("CPU");
  const [unit, setUnit] = useState<string>(UNIT_BY_RESOURCE.CPU);
  const [pricePerUnit, setPricePerUnit] = useState<string>("0.0002");
  const [thresholdAbove, setThresholdAbove] = useState<string>("0");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const onResourceChange = (next: AutoscalingResource) => {
    setResource(next);
    setUnit(UNIT_BY_RESOURCE[next]);
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const price = Number.parseFloat(pricePerUnit);
    const threshold = Number.parseInt(thresholdAbove, 10);
    if (Number.isNaN(price) || price < 0) {
      setError("Cena musi być nieujemną liczbą");
      return;
    }
    if (Number.isNaN(threshold) || threshold < 0) {
      setError("Próg musi być liczbą całkowitą ≥ 0");
      return;
    }

    startTransition(async () => {
      const res = await createPriceRule({
        resource,
        unit,
        pricePerUnit: price,
        thresholdAbove: threshold,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "Nie udało się utworzyć reguły");
        return;
      }
      setSuccess(true);
      setPricePerUnit("0.0002");
      setThresholdAbove("0");
      setNotes("");
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-white/5 bg-black/40 p-6 space-y-5 h-fit"
    >
      <div>
        <h2 className="text-lg font-bold text-white">Nowa reguła cennika</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Każda reguła obejmuje jeden zasób. Możesz dodać kilka reguł dla różnych progów (tier
          pricing) — wybierana jest ta o najwyższym progu, którego klient nie przekroczył.
        </p>
      </div>

      <Field label="Zasób">
        <select
          value={resource}
          onChange={(e) => onResourceChange(e.target.value as AutoscalingResource)}
          className="w-full rounded-md bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-indigo-400 focus:outline-none"
        >
          <option value="CPU">CPU (%)</option>
          <option value="RAM">RAM (MB)</option>
          <option value="IO">I/O (kbps)</option>
          <option value="TRANSFER">Transfer (GB)</option>
        </select>
      </Field>

      <Field label="Jednostka (kod)">
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          maxLength={32}
          className="w-full rounded-md bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-indigo-400 focus:outline-none font-mono"
        />
      </Field>

      <Field label="Cena za jednostkę (PLN)" hint={HINTS[resource]}>
        <input
          type="number"
          step="0.000001"
          min="0"
          value={pricePerUnit}
          onChange={(e) => setPricePerUnit(e.target.value)}
          className="w-full rounded-md bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-indigo-400 focus:outline-none"
        />
      </Field>

      <Field
        label="Próg od (jednostek)"
        hint="Reguła obowiązuje od tej liczby jednostek wzwyż."
      >
        <input
          type="number"
          min="0"
          step="1"
          value={thresholdAbove}
          onChange={(e) => setThresholdAbove(e.target.value)}
          className="w-full rounded-md bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-indigo-400 focus:outline-none"
        />
      </Field>

      <Field label="Notatka (opcjonalnie)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={2}
          className="w-full rounded-md bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-indigo-400 focus:outline-none"
          placeholder="np. Wprowadzono Q2 2026 po analizie PnL"
        />
      </Field>

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Reguła została zapisana.
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {pending ? "Zapisywanie…" : "Dodaj regułę"}
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
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
        {label}
      </span>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </label>
  );
}
