import Link from "next/link";
import { AlertCircle, BarChart3, Gauge } from "lucide-react";
import { listPriceRules } from "./actions";
import { PricingTable } from "./pricing-table";
import { CreateRuleForm } from "./create-rule-form";

export const dynamic = "force-dynamic";

const RESOURCE_LABELS: Record<string, string> = {
  CPU: "CPU (% / godz.)",
  RAM: "RAM (GB / godz.)",
  DISK: "Dysk (GB / godz.)",
  IO: "I/O (kbps) — wycofane",
  TRANSFER: "Transfer (GB) — wycofane",
};

export default async function AutoscalingPricingPage() {
  const result = await listPriceRules();
  const rules = result.ok ? (result.data ?? []) : [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md flex items-center gap-3">
            <Gauge className="h-7 w-7 text-indigo-400" />
            Cennik Autoskalowania
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Stawki za dodatkowe CPU, RAM i dysk ponad plan bazowy. Zmiany wchodzą natychmiast —
            nowe naliczenia użyją zaktualizowanych cen; pozycje już zaksięgowane w portfelu
            pozostają bez zmian.
          </p>
        </div>
        <Link
          href="/autoscaling/revenue"
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20"
        >
          <BarChart3 className="h-4 w-4" />
          Raport przychodu 30d
        </Link>
      </header>

      {!result.ok && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" />
          <span>Nie udało się pobrać cennika: {result.error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-8">
        <PricingTable rules={rules} resourceLabels={RESOURCE_LABELS} />
        <CreateRuleForm />
      </div>
    </div>
  );
}
