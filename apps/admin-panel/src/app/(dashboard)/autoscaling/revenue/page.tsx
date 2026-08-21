import Link from 'next/link';
import { BarChart3, Download } from 'lucide-react';
import { getAutoscalingRevenueReport } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AutoscalingRevenuePage() {
  const result = await getAutoscalingRevenueReport();
  const report = result.ok ? result.data : null;

  const csvRows = report
    ? [
        ['resource', 'revenue_pln_30d'],
        ['CPU', report.byResource.cpu],
        ['RAM', report.byResource.ram],
        ['DISK', report.byResource.disk],
        ['legacy_unallocated', report.byResource.unallocatedLegacy],
        ['TOTAL', report.totalRevenue],
      ]
    : [];
  const csv = csvRows.map((r) => r.join(',')).join('\n');
  const csvDataUri = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/autoscaling" className="text-xs text-muted-foreground hover:text-white">
            ← Cennik autoskalowania
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="h-7 w-7 text-emerald-400" />
            Przychód autoskalowania (30 dni)
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Sumy z portfela (<code className="text-xs">CHARGE_AUTOSCALING</code>). Od kolejnych
            naliczeń godzinowych widać rozbicie CPU / RAM / dysk w metadanych transakcji.
          </p>
        </div>
        {report ? (
          <a
            href={csvDataUri}
            download="autoscaling-revenue-30d.csv"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            <Download className="h-4 w-4" />
            Eksport CSV
          </a>
        ) : null}
      </header>

      {!result.ok || !report ? (
        <p className="text-rose-300 text-sm">{!result.ok ? result.error : 'Brak danych raportu.'}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Łącznie" value={`${report.totalRevenue} ${report.currency}`} />
            <StatCard label="CPU" value={`${report.byResource.cpu} ${report.currency}`} />
            <StatCard label="RAM" value={`${report.byResource.ram} ${report.currency}`} />
            <StatCard label="Dysk" value={`${report.byResource.disk} ${report.currency}`} />
          </div>
          {Number(report.byResource.unallocatedLegacy) > 0 ? (
            <p className="text-xs text-amber-200/90">
              Starsze naliczenia bez rozbicia: {report.byResource.unallocatedLegacy}{' '}
              {report.currency} ({report.chargeCount} transakcji w okresie).
            </p>
          ) : null}
          <section className="rounded-2xl border border-white/10 bg-black/35 p-5">
            <h2 className="text-sm font-bold text-white mb-4">Zdarzenia skalowania (30 dni)</h2>
            {report.scaleEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak zdarzeń w okresie.</p>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase text-muted-foreground border-b border-white/10">
                  <tr>
                    <th className="py-2">Zasób</th>
                    <th className="py-2">Kierunek</th>
                    <th className="py-2 text-right">Liczba</th>
                  </tr>
                </thead>
                <tbody>
                  {report.scaleEvents.map((row, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-2 text-white">{row.resource ?? '—'}</td>
                      <td className="py-2 text-neutral-300">{row.direction}</td>
                      <td className="py-2 text-right font-mono">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-white font-mono">{value}</p>
    </div>
  );
}
