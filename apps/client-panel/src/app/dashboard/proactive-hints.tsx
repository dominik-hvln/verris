import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { listServices } from './services/data';

/**
 * SUP-3 — proactive "things to do" surfaced on the dashboard. Aggregates the
 * per-service recommendations (DNS/SSL/backup/autoscaling/provisioning, health)
 * that the API already computes, so customers fix issues before they become
 * support tickets.
 */
export async function ProactiveHints() {
  let services: Awaited<ReturnType<typeof listServices>> = [];
  try {
    services = await listServices();
  } catch {
    return null;
  }

  const items = services
    .flatMap((s) =>
      (s.recommendations ?? [])
        .filter((r) => r.severity === 'warning' || r.severity === 'critical')
        .map((r) => ({ serviceId: s.id, domain: s.account?.domain ?? s.planName, ...r })),
    )
    .sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1))
    .slice(0, 6);

  if (services.length === 0) return null;

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-white">Wszystko w porządku</h2>
        </div>
        <p className="mt-1 text-sm text-neutral-400">
          Nie wykryliśmy żadnych pilnych rzeczy do zrobienia w Twoich usługach.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-amber-400" />
        <h2 className="text-base font-semibold text-white">Rzeczy do zrobienia</h2>
        <span className="text-xs text-neutral-500">({items.length})</span>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <Link
            key={`${it.serviceId}-${i}`}
            href={`/dashboard/services/${it.serviceId}`}
            className={`group flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
              it.severity === 'critical'
                ? 'border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/10'
                : 'border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10'
            }`}
          >
            <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${it.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">
                {it.title} <span className="text-neutral-500">· {it.domain}</span>
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">{it.body}</p>
            </div>
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600 group-hover:text-white" />
          </Link>
        ))}
      </div>
    </section>
  );
}
