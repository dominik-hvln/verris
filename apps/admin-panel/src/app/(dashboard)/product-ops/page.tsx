import { plForm, plural } from "@/lib/pl";
import { getProductOpsDashboard } from "./data";
import { Announcements, Maintenance } from "./notices";
import { FeatureFlags } from "./flags";
import { BladStrony, wynik } from "@/components/blad-strony";

export const dynamic = "force-dynamic";

const rekordy = (n: number) => plural(n, "rekord", "rekordy", "rekordów");

export default async function ProductOpsPage() {
  const w = await wynik(getProductOpsDashboard());
  if (!w.ok) return <BladStrony blad={w.blad} tytul="Product Ops / NOC" />;
  const data = w.dane;
  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Product Ops / NOC</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gotowość do startu (preflight GO-LIVE), flagi funkcji, ogłoszenia i kalendarz prac serwisowych.
        </p>
      </header>

      <section
        className={`rounded-2xl border p-5 ${
          data.preflight.goLiveReady
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-rose-500/30 bg-rose-500/5"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Preflight GO-LIVE</h2>
            <p className="text-sm text-muted-foreground">
              {data.preflight.goLiveReady
                ? "Brak blokerów technicznych w kluczowych obszarach."
                : "Wymagana interwencja przed promocją na LIVE."}
            </p>
          </div>
          <span className="text-2xl font-bold">
            {data.preflight.goLiveReady ? "GOTOWE" : "ZABLOKOWANE"}
          </span>
        </div>
        {data.preflight.blockers.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-sm text-rose-100">
            {data.preflight.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          {Object.entries(data.preflight.metrics).map(([key, value]) => (
            <div key={key} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{key}</p>
              <p className="mt-1 text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4">
        <Panel title="Flagi funkcji">
          <FeatureFlags rows={data.flags} />
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Ogłoszenia dla klientów">
          <Announcements rows={data.announcements} />
        </Panel>
        <Panel title="Prace serwisowe">
          <Maintenance
            rows={data.maintenance}
            servers={data.capacity.map((c) => ({ id: c.id, name: c.name }))}
          />
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Planowanie pojemności">
          {data.capacity.slice(0, 10).map((row) => (
            <Row
              key={row.id}
              title={row.name}
              meta={`${row.risk.toUpperCase()} · konta ${row.activeAccounts} · przydzielone limity: CPU ${(row.cpuCommitted / 100).toLocaleString('pl-PL')} rdz.${row.totalCpuCores ? ` z ${row.totalCpuCores}` : ''} · RAM ${(row.ramCommittedMb / 1024).toFixed(1)}${row.totalMemoryMb ? ` z ${(row.totalMemoryMb / 1024).toFixed(0)}` : ''} GB`}
            />
          ))}
          {data.capacity.length === 0 && <Empty />}
        </Panel>
        <Panel title="Anomalie">
          <Row title="Otwarte incydenty" meta={`${data.anomalies.openIncidents.length} ${plForm(data.anomalies.openIncidents.length, "aktywny", "aktywne", "aktywnych")}`} />
          <Row title="Nieudane migracje (24 h)" meta={rekordy(data.anomalies.failedMigrations.length)} />
          <Row title="Nieudane zakładanie usług (24 h)" meta={rekordy(data.anomalies.failedProvisioning.length)} />
          <Row title="Skoki zużycia (24 h)" meta={rekordy(data.anomalies.usageSpikes.length)} />
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Webhooki — stan">
          {data.webhooks.slice(0, 8).map((hook) => (
            <Row
              key={hook.id}
              title={hook.url}
              meta={`${hook.isActive ? "aktywny" : "wyłączony"} · ${hook.events.join(", ")} · ${hook._count.deliveries} ${plForm(hook._count.deliveries, "dostawa", "dostawy", "dostaw")}`}
            />
          ))}
          {data.webhooks.length === 0 && <Empty />}
        </Panel>
        <Panel title="Dostawy webhooków">
          {data.deliveries.slice(0, 8).map((delivery) => (
            <Row
              key={delivery.id}
              title={`${delivery.event} → ${delivery.endpoint.url}`}
              meta={`${delivery.status} · próby: ${delivery.attempts}${
                delivery.lastError ? ` · ${delivery.lastError}` : ""
              }`}
            />
          ))}
          {data.deliveries.length === 0 && <Empty />}
        </Panel>
      </section>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/30 p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{meta}</p>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-muted-foreground">Brak rekordów.</p>;
}
