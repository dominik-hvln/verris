import Link from "next/link";
import { adminApi } from "@/lib/api";
import { listAdminPlans } from "../../plans/data";
import { InternalMigrationForm } from "./internal-migration-form";
import { PlanChangeForm } from "./plan-change-form";

export const dynamic = "force-dynamic";

type SubscriptionDetail = {
  id: string;
  status: string;
  interval: string;
  priceAmount: string;
  currency: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
  plan: { id: string; name: string; slug: string; cpuLimit: number; ramLimitMb: number; diskLimitMb: number };
  account: null | {
    id: string;
    domain: string;
    daUsername: string;
    status: string;
    server: null | { id: string; name: string | null; region: string | null };
  };
  events: Array<{ id: string; type: string; createdAt: string }>;
};

type AdminServerRow = { id: string; name: string | null; region: string | null; status: string };
type MigrationRow = { id: string; type: string; createdAt: string; details: Record<string, unknown> | null };

export default async function AdminSubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail: SubscriptionDetail | null = null;
  let servers: AdminServerRow[] = [];
  let migrations: MigrationRow[] = [];
  let plans: Awaited<ReturnType<typeof listAdminPlans>> = [];
  let error: string | null = null;
  try {
    [detail, servers, migrations, plans] = await Promise.all([
      adminApi<SubscriptionDetail>(`/admin/subscriptions/${id}`),
      adminApi<AdminServerRow[]>("/admin/servers"),
      adminApi<MigrationRow[]>(`/admin/subscriptions/${id}/migrations`),
      listAdminPlans(),
    ]);
  } catch {
    error = "Nie udało się wczytać subskrypcji (sprawdź ID i sesję).";
  }

  return (
    <div className="space-y-4">
      <Link href="/subscriptions" className="text-xs text-muted-foreground hover:text-white">
        ← Lista subskrypcji
      </Link>
      <h1 className="text-2xl font-bold text-white">Subskrypcja</h1>
      {error ? (
        <p className="text-rose-300 text-sm">{error}</p>
      ) : !detail ? (
        <p className="text-muted-foreground text-sm">Brak danych.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/35 p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Klient</p>
              <p className="text-white">{detail.user.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <p className="text-white">{detail.status}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Plan</p>
              <p className="text-white">{detail.plan.name} ({detail.plan.slug})</p>
            </div>
            <div>
              <p className="text-muted-foreground">Cena</p>
              <p className="text-white">{detail.priceAmount} {detail.currency} / {detail.interval}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Okres</p>
              <p className="text-white">
                {detail.currentPeriodStart ? new Date(detail.currentPeriodStart).toLocaleDateString("pl-PL") : "—"} -{" "}
                {detail.currentPeriodEnd ? new Date(detail.currentPeriodEnd).toLocaleDateString("pl-PL") : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Konto hostingowe</p>
              <p className="text-white">
                {detail.account ? `${detail.account.domain} (${detail.account.daUsername})` : "Brak konta"}
              </p>
            </div>
          </div>

          {detail.status === "ACTIVE" && detail.account ? (
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
              <h2 className="text-sm font-semibold text-white mb-3">Zmiana planu (PC‑3)</h2>
              <PlanChangeForm
                subscriptionId={detail.id}
                currentPlanId={detail.plan.id}
                currentPlanName={detail.plan.name}
                plans={plans.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name, slug: p.slug }))}
                isAdmin
              />
            </div>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-black/35 p-4">
            <h2 className="text-sm font-semibold text-white mb-3">Migracja wewnętrzna (G‑7)</h2>
            <InternalMigrationForm
              subscriptionId={detail.id}
              currentServerId={detail.account?.server?.id ?? null}
              servers={servers.filter((s) => s.status === "ACTIVE")}
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-black/35 p-4">
            <h2 className="text-sm font-semibold text-white mb-3">Timeline migracji</h2>
            {migrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak zdarzeń migracji.</p>
            ) : (
              <div className="space-y-2">
                {migrations.map((row) => (
                  <div key={row.id} className="text-xs text-neutral-300 border-b border-white/5 pb-2">
                    <p className="font-medium text-white">{row.type}</p>
                    <p className="text-muted-foreground">{new Date(row.createdAt).toLocaleString("pl-PL")}</p>
                    {row.details?.ticketId ? (
                      <p className="text-neutral-400">Ticket: {String(row.details.ticketId)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/35 p-4">
            <h2 className="text-sm font-semibold text-white mb-3">Ostatnie zdarzenia</h2>
            {detail.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak zdarzeń.</p>
            ) : (
              <div className="space-y-2">
                {detail.events.map((event) => (
                  <div key={event.id} className="text-xs text-neutral-300 border-b border-white/5 pb-2">
                    <p className="font-medium text-white">{event.type}</p>
                    <p className="text-muted-foreground">{new Date(event.createdAt).toLocaleString("pl-PL")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
