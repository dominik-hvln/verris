"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Pencil, PowerOff, Save, XCircle } from "lucide-react";
import type { AutoscalingCatalogResource, PriceRuleDto } from "./actions";
import { deactivatePriceRule, updatePriceRule } from "./actions";
import { PricingSimulator } from "./pricing-simulator";

const CATALOG_ORDER: AutoscalingCatalogResource[] = ["CPU", "RAM", "DISK"];

interface Props {
  rules: PriceRuleDto[];
  resourceLabels: Record<string, string>;
}

export function PricingTable({ rules, resourceLabels }: Props) {
  const catalogRules = rules.filter((r) =>
    CATALOG_ORDER.includes(r.resource as AutoscalingCatalogResource),
  );
  const legacyRules = rules.filter(
    (r) => !CATALOG_ORDER.includes(r.resource as AutoscalingCatalogResource),
  );

  const byResource = useMemo(() => {
    const map = new Map<AutoscalingCatalogResource, PriceRuleDto[]>();
    for (const res of CATALOG_ORDER) map.set(res, []);
    for (const rule of catalogRules) {
      const key = rule.resource as AutoscalingCatalogResource;
      if (map.has(key)) map.get(key)!.push(rule);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          a.thresholdAbove - b.thresholdAbove ||
          Number(b.isActive) - Number(a.isActive),
      );
    }
    return map;
  }, [catalogRules]);

  // Wczesny return MUSI stać po wszystkich hookach. Wcześniej stał przed
  // useMemo powyżej, więc przy pustej liście reguł hook nie wykonywał się
  // wcale — a po dodaniu pierwszej stawki React widział inną liczbę hooków
  // niż w poprzednim renderze i komponent się wywalał.
  if (rules.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
        <p className="text-base font-semibold text-white">Brak reguł cennika</p>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Dodaj pierwszą stawkę po prawej — bez aktywnych reguł silnik autoskalowania nie zaczyna
          naliczać kosztów za CPU/RAM/dysk.
        </p>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      {CATALOG_ORDER.map((resource) => {
        const group = byResource.get(resource) ?? [];
        if (group.length === 0) {
          return (
            <section
              key={resource}
              className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] px-5 py-4"
            >
              <h3 className="text-sm font-bold text-white">
                {resourceLabels[resource] ?? resource}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Brak reguł — dodaj stawkę w formularzu po prawej.
              </p>
            </section>
          );
        }
        return (
          <section
            key={resource}
            className="rounded-2xl border border-white/5 bg-black/40 overflow-hidden"
          >
            <div className="border-b border-white/5 bg-white/[0.02] px-5 py-3">
              <h3 className="text-sm font-bold text-white">
                {resourceLabels[resource] ?? resource}
              </h3>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-white/5 text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5">Cena / jedn. / h</th>
                  <th className="px-5 py-2.5">Próg od</th>
                  <th className="px-5 py-2.5">Notatka</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {group.map((rule) => (
                  <RuleRow key={rule.id} rule={rule} />
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      {legacyRules.length > 0 ? (
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
          <div className="border-b border-amber-500/20 px-5 py-3">
            <h3 className="text-sm font-bold text-amber-100">Archiwum (I/O, transfer)</h3>
            <p className="text-xs text-amber-200/70 mt-0.5">
              Wycofane z katalogu — pozostają tylko do podglądu historycznego.
            </p>
          </div>
          <table className="w-full text-sm opacity-80">
            <tbody>
              {legacyRules.map((rule) => (
                <RuleRow key={rule.id} rule={rule} readonly />
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

function RuleRow({ rule, readonly = false }: { rule: PriceRuleDto; readonly?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(rule.pricePerUnit);
  const [threshold, setThreshold] = useState(String(rule.thresholdAbove));
  const [notes, setNotes] = useState(rule.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pending, startTransition] = useTransition();

  const cancel = () => {
    setPrice(rule.pricePerUnit);
    setThreshold(String(rule.thresholdAbove));
    setNotes(rule.notes ?? "");
    setEditing(false);
    setError(null);
    setSavedFlash(false);
  };

  const save = () => {
    setError(null);
    setSavedFlash(false);
    const parsedPrice = Number.parseFloat(price.replace(",", "."));
    const parsedThreshold = Number.parseInt(threshold, 10);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setError("Cena musi być nieujemną liczbą");
      return;
    }
    if (Number.isNaN(parsedThreshold) || parsedThreshold < 0) {
      setError("Próg musi być nieujemną liczbą całkowitą");
      return;
    }
    startTransition(async () => {
      const res = await updatePriceRule(rule.id, {
        pricePerUnit: parsedPrice,
        thresholdAbove: parsedThreshold,
        notes: notes.trim(),
      });
      if (!res.ok) {
        setError(res.error ?? "Nie udało się zapisać zmian");
        return;
      }
      setEditing(false);
      setSavedFlash(true);
      router.refresh();
    });
  };

  const toggleActive = () => {
    startTransition(async () => {
      const res = rule.isActive
        ? await deactivatePriceRule(rule.id)
        : await updatePriceRule(rule.id, { isActive: true });
      if (!res.ok) setError(res.error ?? "Nie udało się zaktualizować statusu");
      else router.refresh();
    });
  };

  return (
    <>
    <tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] align-top">
      <td className="px-5 py-4">
        {editing ? (
          <div className="space-y-1">
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              type="text"
              inputMode="decimal"
              className="w-full max-w-[10rem] rounded-md bg-black/60 border border-white/10 px-2 py-1 text-white text-sm font-mono focus:border-indigo-400 focus:outline-none"
            />
            <span className="text-[10px] text-muted-foreground">
              {rule.currency} / {formatUnitLabel(rule.unit)} / godz.
            </span>
          </div>
        ) : (
          <div>
            <div className="font-mono text-white">{formatPrice(rule.pricePerUnit)}</div>
            <div className="text-xs text-muted-foreground">
              {rule.currency} / {rule.unit} / godz.
            </div>
          </div>
        )}
      </td>
      <td className="px-5 py-4">
        {editing ? (
          <input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            type="number"
            min="0"
            className="w-20 rounded-md bg-black/60 border border-white/10 px-2 py-1 text-white text-sm focus:border-indigo-400 focus:outline-none"
          />
        ) : (
          <span className="text-muted-foreground">{rule.thresholdAbove}</span>
        )}
      </td>
      <td className="px-5 py-4 max-w-[14rem]">
        {editing ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-md bg-black/60 border border-white/10 px-2 py-1 text-white text-xs focus:border-indigo-400 focus:outline-none resize-y min-h-[2.5rem]"
            placeholder="Notatka wewnętrzna"
          />
        ) : (
          <span className="text-xs text-muted-foreground line-clamp-2">
            {rule.notes || "—"}
          </span>
        )}
      </td>
      <td className="px-5 py-4">
        {rule.isActive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-200">
            <CheckCircle2 className="h-3 w-3" /> Aktywna
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <XCircle className="h-3 w-3" /> Wyłączona
          </span>
        )}
      </td>
      <td className="px-5 py-4">
        {readonly ? (
          <span className="text-xs text-muted-foreground">Tylko podgląd</span>
        ) : (
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={save}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 px-3 py-1 text-xs font-bold text-indigo-200 disabled:opacity-50"
                  >
                    {pending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    Zapisz
                  </button>
                  <button
                    type="button"
                    onClick={cancel}
                    disabled={pending}
                    className="rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1 text-xs text-white disabled:opacity-50"
                  >
                    Anuluj
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(true);
                      setSavedFlash(false);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1 text-xs font-medium text-white"
                  >
                    <Pencil className="h-3 w-3" />
                    Edytuj
                  </button>
                  <button
                    type="button"
                    onClick={toggleActive}
                    disabled={pending}
                    className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium border disabled:opacity-50 ${
                      rule.isActive
                        ? "border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
                        : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
                    }`}
                  >
                    <PowerOff className="h-3 w-3" />
                    {rule.isActive ? "Wyłącz" : "Włącz"}
                  </button>
                </>
              )}
            </div>
            {error && <p className="text-xs text-rose-300">{error}</p>}
            {savedFlash && !editing && (
              <p className="text-xs text-emerald-300">Zapisano.</p>
            )}
          </div>
        )}
      </td>
    </tr>
    {editing && CATALOG_ORDER.includes(rule.resource as AutoscalingCatalogResource) ? (
      <tr className="border-b border-white/5 bg-indigo-500/[0.03]">
        <td colSpan={5} className="px-5 py-3">
          <PricingSimulator
            resource={rule.resource as AutoscalingCatalogResource}
            pricePerUnit={price}
            thresholdAbove={threshold}
          />
        </td>
      </tr>
    ) : null}
    </>
  );
}

function formatUnitLabel(unit: string): string {
  if (unit === "cpu_pct") return "1% CPU";
  if (unit === "ram_gb") return "1 GB RAM";
  if (unit === "disk_gb") return "1 GB dysku";
  if (unit === "ram_mb") return "1 MB RAM (legacy)";
  if (unit === "disk_mb") return "1 MB dysku (legacy)";
  return unit;
}

function formatPrice(value: string): string {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return value;
  if (n === 0) return "0";
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}
