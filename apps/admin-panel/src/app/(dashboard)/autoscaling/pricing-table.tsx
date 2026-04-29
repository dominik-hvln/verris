"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PowerOff, Save, XCircle } from "lucide-react";
import type { PriceRuleDto } from "./actions";
import { deactivatePriceRule, updatePriceRule } from "./actions";

interface Props {
  rules: PriceRuleDto[];
  resourceLabels: Record<PriceRuleDto["resource"], string>;
}

export function PricingTable({ rules, resourceLabels }: Props) {
  if (rules.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
        <p className="text-base font-semibold text-white">Brak reguł cennika</p>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Dodaj pierwszą stawkę po prawej — bez aktywnych reguł silnik autoskalowania nie zaczyna
          naliczać kosztów.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-black/40 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-white/5 bg-white/[0.02]">
          <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            <th className="px-5 py-3">Zasób</th>
            <th className="px-5 py-3">Jednostka</th>
            <th className="px-5 py-3">Cena za jedn.</th>
            <th className="px-5 py-3">Próg od</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3 text-right">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} resourceLabel={resourceLabels[rule.resource]} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RuleRow({
  rule,
  resourceLabel,
}: {
  rule: PriceRuleDto;
  resourceLabel: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState<string>(rule.pricePerUnit);
  const [threshold, setThreshold] = useState<string>(String(rule.thresholdAbove));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cancel = () => {
    setPrice(rule.pricePerUnit);
    setThreshold(String(rule.thresholdAbove));
    setEditing(false);
    setError(null);
  };

  const save = () => {
    setError(null);
    const parsedPrice = Number.parseFloat(price);
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
      });
      if (!res.ok) {
        setError(res.error ?? "Nie udało się zapisać zmian");
        return;
      }
      setEditing(false);
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
    <tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
      <td className="px-5 py-4">
        <div className="font-semibold text-white">{rule.resource}</div>
        <div className="text-xs text-muted-foreground">{resourceLabel}</div>
      </td>
      <td className="px-5 py-4 text-muted-foreground">
        <code className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-xs">
          {rule.unit}
        </code>
      </td>
      <td className="px-5 py-4">
        {editing ? (
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            type="number"
            step="0.000001"
            min="0"
            className="w-36 rounded-md bg-black/60 border border-white/10 px-2 py-1 text-white text-sm focus:border-indigo-400 focus:outline-none"
          />
        ) : (
          <div>
            <div className="font-mono text-white">
              {Number(rule.pricePerUnit).toFixed(6)}
            </div>
            <div className="text-xs text-muted-foreground">{rule.currency}</div>
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
            className="w-24 rounded-md bg-black/60 border border-white/10 px-2 py-1 text-white text-sm focus:border-indigo-400 focus:outline-none"
          />
        ) : (
          <span className="text-muted-foreground">{rule.thresholdAbove}</span>
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
        <div className="flex items-center justify-end gap-2">
          {editing ? (
            <>
              <button
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
                onClick={() => setEditing(true)}
                className="rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1 text-xs font-medium text-white"
              >
                Edytuj
              </button>
              <button
                onClick={toggleActive}
                disabled={pending}
                title={rule.isActive ? "Dezaktywuj" : "Aktywuj"}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium border disabled:opacity-50 ${
                  rule.isActive
                    ? "border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
                    : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
                }`}
              >
                <PowerOff className="h-3 w-3" />
                {rule.isActive ? "Dezaktywuj" : "Aktywuj"}
              </button>
            </>
          )}
        </div>
        {error && (
          <div className="mt-2 text-right text-xs text-rose-300">{error}</div>
        )}
      </td>
    </tr>
  );
}
