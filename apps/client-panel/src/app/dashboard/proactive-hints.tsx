import Link from 'next/link';
import { ArrowRight, CheckCircle2, Compass, Sparkles } from 'lucide-react';
import { listServices } from './services/data';

/**
 * Asystent Verris — „co dalej". Autorski mechanizm Verris analizuje stan
 * Twoich usług (DNS, SSL, kopie, obciążenie, autoskalowanie, provisioning) i
 * podpowiada najważniejszy następny krok, prowadząc za rękę. Działa na danych,
 * które API już wylicza per usługa (recommendations) — bez dodatkowych zapytań.
 *
 * (Wcześniej: SUP-3 „Rzeczy do zrobienia". Teraz spójna, prowadząca forma.)
 */
export async function ProactiveHints() {
  let services: Awaited<ReturnType<typeof listServices>> = [];
  try {
    services = await listServices();
  } catch {
    return null;
  }
  if (services.length === 0) return null;

  const items = services
    .flatMap((s) =>
      (s.recommendations ?? [])
        .filter((r) => r.severity === 'warning' || r.severity === 'critical')
        .map((r) => ({
          serviceId: s.id,
          productKind: s.productKind,
          domain: s.account?.domain ?? s.planName,
          ...r,
        })),
    )
    .sort((a, b) => (b.severity === 'critical' ? 1 : 0) - (a.severity === 'critical' ? 1 : 0));

  // Wszystko gra — krótki, pozytywny stan (nie zostawiamy klienta bez sygnału).
  if (items.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] px-5 py-4">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Asystent Verris: wszystko pod kontrolą</p>
          <p className="text-xs text-neutral-400">
            Nie widzimy nic pilnego. Monitorujemy DNS, SSL, kopie i obciążenie — damy znać, gdy coś będzie wymagać uwagi.
          </p>
        </div>
      </section>
    );
  }

  const [next, ...rest] = items;
  const nextCritical = next.severity === 'critical';

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/[0.07] to-transparent p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="rounded-xl border border-violet-400/30 bg-violet-400/10 p-2 text-violet-200">
          <Compass className="h-4 w-4" />
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            Asystent Verris
            <Sparkles className="h-3.5 w-3.5 text-violet-300" />
          </h2>
          <p className="text-xs text-neutral-400">Podpowiadamy, co zrobić dalej.</p>
        </div>
      </div>

      {/* Najważniejszy następny krok — wyróżniony, z konkretną akcją. */}
      <Link
        href={`/dashboard/services/${next.serviceId}?kind=${next.productKind}`}
        className={`group flex items-start gap-3 rounded-xl border px-4 py-4 transition-colors ${
          nextCritical
            ? 'border-rose-500/30 bg-rose-500/[0.06] hover:bg-rose-500/10'
            : 'border-amber-500/25 bg-amber-500/[0.06] hover:bg-amber-500/10'
        }`}
      >
        <span
          className={`mt-0.5 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            nextCritical ? 'bg-rose-500/20 text-rose-200' : 'bg-amber-500/20 text-amber-100'
          }`}
        >
          Następny krok
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            {next.title} <span className="font-normal text-neutral-500">· {next.domain}</span>
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-neutral-300">{next.body}</p>
        </div>
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-white">
          Przejdź <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>

      {rest.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Kolejne sugestie
          </p>
          {rest.slice(0, 4).map((it, i) => (
            <Link
              key={`${it.serviceId}-${i}`}
              href={`/dashboard/services/${it.serviceId}?kind=${it.productKind}`}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-neutral-400 hover:bg-white/[0.03] hover:text-white"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${it.severity === 'critical' ? 'bg-rose-400' : 'bg-amber-400'}`}
              />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-neutral-200">{it.title}</span> · {it.domain}
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-neutral-600 group-hover:text-white" />
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
