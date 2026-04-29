import { AlertCircle, Gauge } from "lucide-react";
import type { PriceRuleDto } from "./actions";
import { listPriceRules } from "./actions";
import { PricingTable } from "./pricing-table";
import { CreateRuleForm } from "./create-rule-form";

export const dynamic = "force-dynamic";

const RESOURCE_LABELS: Record<PriceRuleDto["resource"], string> = {
  CPU: "CPU (% / godz.)",
  RAM: "RAM (MB / godz.)",
  IO: "I/O (kbps / godz.)",
  TRANSFER: "Transfer (GB)",
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
            Stawki nakładane na klienta gdy CloudLinux LVE zwiększa limity konta. Zmiany wchodzą
            natychmiast — nowe naliczenia użyją zaktualizowanych cen, istniejące pozycje w portfelu
            pozostają bez zmian.
          </p>
        </div>
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
