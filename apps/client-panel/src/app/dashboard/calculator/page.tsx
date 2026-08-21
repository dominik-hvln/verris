import { listAutoscalingPricing } from './data';
import { AutoscalingCalculator } from './calculator';

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
  const initialCpu = parsePositiveInt(sp.cpu, 50);
  const initialRamGb = parsePositiveFloat(sp.ramGb, 0.5);
  const initialDiskGb = parsePositiveFloat(sp.diskGb, 0);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center p-6 pt-12">
      <div className="w-full max-w-5xl text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400 mb-4 tracking-tight">
          Kalkulator kosztów Verris
        </h1>
        <p className="text-lg text-neutral-400 max-w-2xl mx-auto">
          Sprawdź ile zapłacisz, gdy autoskalowanie tymczasowo doda Ci zasoby ponad
          limit planu. Stawki są takie same jak w Twoim portfelu — pobieramy je z
          aktualnego cennika, więc zobaczysz dokładnie to, co naliczy silnik.
        </p>
      </div>

      {!result.ok && (
        <div className="w-full max-w-3xl mb-8 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Nie udało się pobrać cennika: {result.error}. Wartości poniżej będą
          szacunkowe.
        </div>
      )}

      <div className="w-full relative">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[300px] w-full max-w-3xl mx-auto rounded-full bg-emerald-500/5 blur-[100px] pointer-events-none" />
        <AutoscalingCalculator rules={rules} />
      </div>
    </div>
  );
}
