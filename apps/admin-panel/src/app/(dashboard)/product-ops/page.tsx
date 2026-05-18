import { getProductOpsDashboard } from "./data";

export const dynamic = "force-dynamic";

export default async function ProductOpsPage() {
  const data = await getProductOpsDashboard();
  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Product Ops / NOC</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          GO-LIVE preflight, feature flags, changelog i maintenance calendar.
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
                ? "Brak blockerów technicznych w kluczowych obszarach."
                : "Wymagana interwencja przed promocją na LIVE."}
            </p>
          </div>
          <span className="text-2xl font-bold">
            {data.preflight.goLiveReady ? "READY" : "BLOCKED"}
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

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Feature flags">
          {data.flags.slice(0, 8).map((flag) => (
            <Row key={flag.id} title={flag.key} meta={`${flag.enabledDefault ? "ON" : "OFF"} · ${flag.rolloutPercent}%`} />
          ))}
          {data.flags.length === 0 && <Empty />}
        </Panel>
        <Panel title="Changelog / komunikaty">
          {data.announcements.slice(0, 8).map((item) => (
            <Row key={item.id} title={item.title} meta={`${item.kind} · ${item.status}`} />
          ))}
          {data.announcements.length === 0 && <Empty />}
        </Panel>
        <Panel title="Maintenance calendar">
          {data.maintenance.slice(0, 8).map((item) => (
            <Row
              key={item.id}
              title={item.title}
              meta={`${item.status} · ${new Date(item.scheduledStart).toLocaleString("pl-PL")}`}
            />
          ))}
          {data.maintenance.length === 0 && <Empty />}
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
