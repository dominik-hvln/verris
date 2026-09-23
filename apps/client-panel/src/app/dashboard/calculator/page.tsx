import { listAutoscalingPricing } from './data';
import { AutoscalingCalculator } from './calculator';
import { PanelPageHeader } from '@/components/panel';

export const dynamic = 'force-dynamic';

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parsePositiveFloat(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ cpu?: string; ramGb?: string; diskGb?: string }>;
}) {
  const result = await listAutoscalingPricing();
  const rules = result.ok ? result.rules : [];
  const sp = await searchParams;
  // Górne granice = zakresy suwaków kalkulatora; parametr z adresu nie może ich przekroczyć.
  const initialCpu = Math.min(parsePositiveInt(sp.cpu, 50), 400);
  const initialRamGb = Math.min(parsePositiveFloat(sp.ramGb, 0.5), 32);
  const initialDiskGb = Math.min(parsePositiveFloat(sp.diskGb, 0), 500);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
      <PanelPageHeader
        title="Kalkulator kosztów"
        description="Sprawdź, ile zapłacisz, gdy autoskalowanie doda Ci zasoby ponad limit planu. Stawki są te same, co w portfelu — pobrane z aktualnego cennika."
      />

      {!result.ok && (
        <p className="m-0 rounded-[10px] bg-warn-soft px-4 py-3 text-sm text-warn">
          Nie udało się pobrać cennika: {result.error}. Wartości poniżej będą szacunkowe.
        </p>
      )}

      {/* Link z autoskalowania (`?cpu=…&ramGb=…&diskGb=…`) otwiera kalkulator na wartościach klienta. */}
      <AutoscalingCalculator
        rules={rules}
        initialCpuPercent={initialCpu}
        initialRamGb={initialRamGb}
        initialDiskGb={initialDiskGb}
      />
    </div>
  );
}
