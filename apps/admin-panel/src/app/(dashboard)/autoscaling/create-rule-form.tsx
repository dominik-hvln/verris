"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import type { AutoscalingCatalogResource } from "./actions";
import { createPriceRule } from "./actions";
import { PricingSimulator } from "./pricing-simulator";

const DEFAULT_PRICE: Record<AutoscalingCatalogResource, string> = {
  CPU: "0.0002",
  RAM: "0.12",
  DISK: "0.05",
};

const HINTS: Record<AutoscalingCatalogResource, string> = {
  CPU: "Cena za 1% CPU na godzinę. Przykład: 0,0002 zł × 100% × 24 h ≈ 0,48 zł/dobę.",
  RAM: "Cena za 1 GB RAM na godzinę. Przykład: 0,12 zł × 1 GB × 24 h ≈ 2,88 zł/dobę.",
  DISK: "Cena za 1 GB dysku na godzinę — osobna stawka, niezależna od RAM.",
};

const UNIT_LABEL: Record<AutoscalingCatalogResource, string> = {
  CPU: "cpu_pct",
  RAM: "ram_gb",
  DISK: "disk_gb",
};

export function CreateRuleForm() {
  const router = useRouter();
  const [resource, setResource] = useState<AutoscalingCatalogResource>("CPU");
  const [pricePerUnit, setPricePerUnit] = useState<string>(DEFAULT_PRICE.CPU);
  const [thresholdAbove, setThresholdAbove] = useState<string>("0");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const onResourceChange = (next: AutoscalingCatalogResource) => {
    setResource(next);
    setPricePerUnit(DEFAULT_PRICE[next]);
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const price = Number.parseFloat(pricePerUnit.replace(",", "."));
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
        pricePerUnit: price,
        thresholdAbove: threshold,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "Nie udało się utworzyć reguły");
        return;
      }
      setSuccess(true);
      setThresholdAbove("0");
      setNotes("");
      setPricePerUnit(DEFAULT_PRICE[resource]);
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-white/5 bg-black/40 p-6 space-y-5 h-fit sticky top-6"
    >
      <div>
        <h2 className="text-lg font-bold text-white">Nowa reguła cennika</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          CPU, RAM i dysk — każda reguła to jeden zasób. Możesz dodać kilka progów (tier
          pricing); przy naliczaniu wybierana jest reguła z najwyższym progiem, który klient
          spełnia.
        </p>
      </div>

      <Field label="Zasób">
        <select
          value={resource}
          onChange={(e) => onResourceChange(e.target.value as AutoscalingCatalogResource)}
          className="w-full rounded-md bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-indigo-400 focus:outline-none"
        >
          <option value="CPU">CPU (%)</option>
          <option value="RAM">RAM (GB)</option>
          <option value="DISK">Dysk (GB)</option>
        </select>
        <p className="mt-1 text-[11px] text-muted-foreground font-mono">
          Jednostka: {UNIT_LABEL[resource]}
        </p>
      </Field>

      <Field label="Cena za jednostkę (PLN / godz.)" hint={HINTS[resource]}>
        <input
          type="text"
          inputMode="decimal"
          value={pricePerUnit}
          onChange={(e) => setPricePerUnit(e.target.value)}
          className="w-full rounded-md bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-indigo-400 focus:outline-none font-mono"
        />
      </Field>

      <Field
        label="Próg od (jednostek)"
        hint="Próg w jednostkach zasobu: % dla CPU, GB dla RAM i dysku (np. dysk od 10 GB wzwyż)."
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

      <PricingSimulator
        resource={resource}
        pricePerUnit={pricePerUnit}
        thresholdAbove={thresholdAbove}
      />

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Reguła została zapisana i jest widoczna w tabeli.
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
