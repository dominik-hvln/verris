import Link from "next/link";
import { Box, Plus, AlertTriangle, CheckCircle2, EyeOff, EyeIcon, Mail } from "lucide-react";
import { listAdminPlans, type AdminPlanRow } from "./data";

export const dynamic = "force-dynamic";

function formatPrice(value: string, currency: string) {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return `— ${currency}`;
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function PlanRow({ plan }: { plan: AdminPlanRow }) {
  const monthlyOk = !!plan.stripePriceMonthlyId;
  const yearlyOk = !!plan.stripePriceYearlyId;
  const sellable = plan.isActive && plan.isPublic && (monthlyOk || yearlyOk);

  return (
    <tr className="hover:bg-white/5 transition-colors group">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300 font-bold uppercase">
            <Box className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium text-white">{plan.name}</div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {plan.slug} · sortOrder={plan.sortOrder}
            </div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-xs text-white tabular-nums">
        <div>
          <span className="text-muted-foreground">M:</span>{" "}
          {formatPrice(plan.priceMonthly, plan.currency)}
        </div>
        <div>
          <span className="text-muted-foreground">Y:</span>{" "}
          {formatPrice(plan.priceYearly, plan.currency)}
        </div>
      </td>
      <td className="px-6 py-4 text-[11px] text-white space-y-0.5">
        <div className="text-muted-foreground">
          CPU <span className="text-white">{plan.cpuLimit}%</span> · RAM{" "}
          <span className="text-white">{plan.ramLimitMb} MB</span>
        </div>
        <div className="text-muted-foreground">
          Disk <span className="text-white">{plan.diskLimitMb} MB</span> · IO{" "}
          <span className="text-white">{plan.ioLimitKbps} kbps</span>
        </div>
        <div className="text-muted-foreground">
          EP <span className="text-white">{plan.entryProcesses}</span> · NPROC{" "}
          <span className="text-white">{plan.nprocLimit}</span>
        </div>
      </td>
      <td className="px-6 py-4 text-[11px]">
        <StripeIdBadge label="M" id={plan.stripePriceMonthlyId} />
        <StripeIdBadge label="Y" id={plan.stripePriceYearlyId} />
      </td>
      <td className="px-6 py-4">
        <SaleStatus plan={plan} sellable={sellable} />
      </td>
      <td className="px-6 py-4 text-right">
        <Link
          href={`/plans/${plan.id}`}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-200 hover:bg-white/10"
        >
          Edytuj
        </Link>
      </td>
    </tr>
  );
}

function StripeIdBadge({ label, id }: { label: string; id: string | null }) {
  if (!id) {
    return (
      <div className="flex items-center gap-1.5 mb-1">
        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-bold text-amber-300">
          {label}
        </span>
        <span className="text-amber-300/80">brak Price ID</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 mb-1 font-mono">
      <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-bold text-emerald-300">
        {label}
      </span>
      <span className="text-white/80 truncate max-w-[200px]">{id}</span>
    </div>
  );
}

function SaleStatus({ plan, sellable }: { plan: AdminPlanRow; sellable: boolean }) {
  if (!plan.isActive) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
        <AlertTriangle className="h-3 w-3" />
        WYŁĄCZONY
      </span>
    );
  }
  if (!plan.isPublic) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
        <EyeOff className="h-3 w-3" />
        UKRYTY (private)
      </span>
    );
  }
  if (!sellable) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
        <AlertTriangle className="h-3 w-3" />
        BRAK STRIPE PRICE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
      <CheckCircle2 className="h-3 w-3" />
      W SPRZEDAŻY
    </span>
  );
}

export default async function AdminPlansPage() {
  let plans: AdminPlanRow[] | null = null;
  let error: string | null = null;
  try {
    plans = await listAdminPlans();
  } catch (err) {
    error = err instanceof Error ? err.message : "Nie udało się pobrać planów";
  }

  const sellableCount = plans?.filter(
    (p) => p.isActive && p.isPublic && (p.stripePriceMonthlyId || p.stripePriceYearlyId),
  ).length;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">
            Plany produktowe
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Definicje hostingu shared (LVE: CPU, RAM, Disk, IO, EP, NPROC), ceny
            i powiązanie ze Stripe Subscription.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/plans/new"
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-4 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/25"
          >
            <Plus className="h-4 w-4" />
            Nowy plan hostingu
          </Link>
          <Link
            href="/plans/new-email"
            className="inline-flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/15 px-4 py-2 text-sm font-medium text-sky-200 hover:bg-sky-500/25"
          >
            <Mail className="h-4 w-4" />
            Nowy plan poczty
          </Link>
        </div>
      </header>

      <div className="relative rounded-2xl p-[1px] overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-indigo-500/20 to-transparent"></div>
        <div className="relative bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl flex flex-col shadow-2xl">
          <div className="p-6 border-b border-white/10 flex justify-between items-center text-sm">
            <span className="text-muted-foreground">
              {plans
                ? `${plans.length} plan(ów), ${sellableCount ?? 0} w pełnej sprzedaży`
                : "Ładowanie…"}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <EyeIcon className="h-3.5 w-3.5" /> klienci widzą tylko plany w
              statusie „W SPRZEDAŻY"
            </span>
          </div>

          {error ? (
            <div className="p-10 text-center text-sm text-rose-300">{error}</div>
          ) : !plans || plans.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Brak planów. Kliknij „Nowy plan" aby dodać pierwszy.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-white">
                <thead className="bg-white/5 border-b border-white/10 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4 font-medium">Plan</th>
                    <th className="px-6 py-4 font-medium">Cena</th>
                    <th className="px-6 py-4 font-medium">Limity LVE</th>
                    <th className="px-6 py-4 font-medium">Stripe Price IDs</th>
                    <th className="px-6 py-4 font-medium">Status sprzedaży</th>
                    <th className="px-6 py-4 text-right font-medium">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {plans.map((plan) => (
                    <PlanRow key={plan.id} plan={plan} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Każdy zapis Stripe Price ID jest walidowany online przeciwko Stripe API
        (active, currency, kwota, interval). Dezaktywacja planu wyłącza
        widoczność w panelu klienta, ale nie tknie istniejących subskrypcji.
      </p>
    </div>
  );
}
