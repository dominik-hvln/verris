import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StaffApiError } from "@/lib/staff-api";
import { staffApi } from "@/lib/staff-api";
import { staffGetAdminSubscription } from "@/lib/crm-subscription-data";
import { PlanChangeTicketTemplate } from "./ticket-template";
import { StaffPlanChangeForm } from "./staff-plan-change-form";
import { StaffDiagnosticsPanel } from "./diagnostics-panel";

export const dynamic = "force-dynamic";

const SUB_STATUS_PL: Record<string, string> = {
  PENDING_PAYMENT: "Oczekuje płatności",
  PROVISIONING: "Provisioning",
  ACTIVE: "Aktywna",
  SUSPENDED: "Zawieszona",
  CANCELED: "Anulowana",
  EXPIRED: "Wygasła",
  PAST_DUE: "Zaległa",
};

export default async function StaffSubscriptionReadonlyPage({
  params,
}: {
  params: Promise<{ userId: string; subscriptionId: string }>;
}) {
  const { userId, subscriptionId } = await params;

  let sub: Awaited<ReturnType<typeof staffGetAdminSubscription>>;
  let eligiblePlans: { id: string; name: string; slug: string }[] = [];
  try {
    sub = await staffGetAdminSubscription(subscriptionId);
    if (sub.status === "ACTIVE" && sub.account) {
      eligiblePlans = await staffApi<{ id: string; name: string; slug: string }[]>(
        `/admin/subscriptions/${subscriptionId}/plan/eligible-plans`,
      );
    }
  } catch (e) {
    if (e instanceof StaffApiError && e.status === 401) redirect("/login");
    if (e instanceof StaffApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }

  if (sub.user.id !== userId) {
    notFound();
  }

  const customerName =
    [sub.user.firstName, sub.user.lastName].filter(Boolean).join(" ").trim() || sub.user.email;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={`/crm/${userId}`}
          className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-cyan-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Profil klienta
        </Link>
      </div>

      <header className="rounded-2xl border border-white/10 bg-black/35 p-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          {sub.plan.name}
          {sub.serviceTag ?? sub.account?.daUsername ? (
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-sm font-normal text-neutral-300">
              {sub.serviceTag ?? sub.account?.daUsername}
            </span>
          ) : null}
        </h1>
        <p className="mt-1 font-mono text-xs text-neutral-500">{sub.id}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Klient:{" "}
          <Link href={`/crm/${userId}`} className="text-cyan-300 hover:underline">
            {customerName}
          </Link>
        </p>
        <dl className="mt-6 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Status</dt>
            <dd className="mt-1 text-sm text-white">
              <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-xs">
                {SUB_STATUS_PL[sub.status] ?? sub.status}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Cena / okres</dt>
            <dd className="mt-1 text-sm text-white">
              {String(sub.priceAmount)} {sub.currency} · {sub.interval}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Koniec okresu</dt>
            <dd className="mt-1 text-sm text-white">
              {sub.currentPeriodEnd
                ? new Date(sub.currentPeriodEnd).toLocaleString("pl-PL")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Autoscaling</dt>
            <dd className="mt-1 text-sm text-white">{sub.autoscalingEnabled ? "Tak" : "Nie"}</dd>
          </div>
        </dl>
      </header>

      <StaffDiagnosticsPanel subscriptionId={subscriptionId} />

      <section className="rounded-2xl border border-white/10 bg-black/30">
        <h2 className="border-b border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
          Konto hostingowe
        </h2>
        {sub.account ? (
          <div className="p-4 text-sm text-white">
            <p className="font-mono text-cyan-100/90">{sub.account.domain}</p>
            <p className="mt-1 text-xs text-muted-foreground">DA: {sub.account.daUsername}</p>
            <p className="mt-1 text-xs text-muted-foreground">Status konta: {sub.account.status}</p>
            {sub.account.server ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Węzeł:{" "}
                {sub.account.server.name ?? sub.account.server.hostname ?? sub.account.server.id}
                {sub.account.server.region ? ` · ${sub.account.server.region}` : ""}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="p-6 text-sm text-muted-foreground">Brak konta hostingowego.</p>
        )}
      </section>

      {sub.status === "ACTIVE" && sub.account && eligiblePlans.length > 0 ? (
        <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white">Zmiana planu</h2>
          <StaffPlanChangeForm
            subscriptionId={sub.id}
            userId={userId}
            currentPlanId={sub.plan.id}
            currentPlanName={sub.plan.name}
            plans={eligiblePlans}
          />
          <PlanChangeTicketTemplate
            domain={sub.account.domain}
            fromPlan={sub.plan.name}
            toPlan="[nowy plan — uzupełnij po zmianie]"
          />
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-black/30">
        <h2 className="border-b border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
          Zdarzenia (ostatnie {sub.events.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-white">
            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Czas</th>
                <th className="px-4 py-2">Typ</th>
                <th className="px-4 py-2">Szczegóły</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sub.events.map((ev) => (
                <tr key={ev.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                    {new Date(ev.createdAt).toLocaleString("pl-PL")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{ev.type}</td>
                  <td className="max-w-md truncate px-4 py-2 font-mono text-[11px] text-neutral-400">
                    {safeJson(ev.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sub.events.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Brak zdarzeń.</p>
        ) : null}
      </section>
    </div>
  );
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
