import { Leaf, Info } from 'lucide-react';
import type { EcoReportDto } from './data';

/**
 * C5 — raport energetyczny z realnych metryk LVE. Wartości to szacunki —
 * metodologia (współczynniki) jest jawnie pokazana klientowi w stopce karty.
 */
export function EcoReportCard({ report }: { report: EcoReportDto | null }) {
  if (!report || report.samples === 0) {
    return (
      <section className="rounded-2xl border border-white/5 bg-[#0a0a0a] p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-2">
          <Leaf className="h-4 w-4 text-emerald-400" /> Raport energetyczny (30 dni)
        </h2>
        <p className="mt-3 text-sm text-neutral-400">
          Raport pojawi się, gdy zbierzemy pierwsze metryki zużycia Twojej usługi (zwykle do
          godziny od aktywacji).
        </p>
      </section>
    );
  }

  const savedPct =
    report.baselineEnergyKwh > 0
      ? Math.round((report.savedEnergyKwh / report.baselineEnergyKwh) * 100)
      : 0;

  return (
    <section className="rounded-2xl border border-emerald-500/20 bg-[#0a0a0a] p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-2">
          <Leaf className="h-4 w-4 text-emerald-400" /> Raport energetyczny (30 dni)
        </h2>
        {report.ecoModeEnabled && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-200">
            EKO Mode aktywny
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Zużycie energii" value={`${report.energyKwh.toFixed(2)} kWh`} />
        <Stat label="Ślad CO₂e" value={`${report.co2Kg.toFixed(2)} kg`} />
        <Stat
          label="Oszczędność vs VPS 24/7"
          value={`${report.savedEnergyKwh.toFixed(2)} kWh`}
          accent
          sub={savedPct > 0 ? `−${savedPct}%` : undefined}
        />
        <Stat
          label="Ekwiwalent pracy drzewa"
          value={
            report.treeMonthsEquivalent >= 1
              ? `${report.treeMonthsEquivalent.toFixed(1)} mies.`
              : `${Math.round(report.treeMonthsEquivalent * 30)} dni`
          }
          accent
        />
      </div>

      <div className="grid grid-cols-2 gap-4 text-xs text-neutral-500">
        <div>
          Realne zużycie: <span className="text-neutral-300">{report.cpuCoreHours.toFixed(1)} rdzenio-godz. CPU</span>,{' '}
          <span className="text-neutral-300">śr. {report.avgRamGb.toFixed(2)} GB RAM</span>{' '}
          ({report.samples.toLocaleString('pl-PL')} próbek)
        </div>
        <div className="text-right">
          Punkt odniesienia: {report.baselineEnergyKwh.toFixed(2)} kWh (parametry planu 24/7)
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-600 border-t border-white/5 pt-3">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>Wartości szacunkowe. {report.methodology}</span>
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`mt-1 text-xl font-extrabold ${accent ? 'text-emerald-300' : 'text-white'}`}>
        {value}
        {sub && <span className="ml-1.5 text-xs font-semibold text-emerald-400">{sub}</span>}
      </div>
    </div>
  );
}
