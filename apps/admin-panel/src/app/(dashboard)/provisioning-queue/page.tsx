import { listProvisioningQueue, listNodeTasks } from "./data";
import { RetryButton } from "./retry-button";
import { NodeTasksSection } from "./node-tasks-section";

export const dynamic = "force-dynamic";

interface SearchParams {
  state?: string;
}

const STATES = [
  { value: "", label: "Wszystkie" },
  { value: "active", label: "Aktywne" },
  { value: "waiting", label: "Oczekujące" },
  { value: "delayed", label: "Opóźnione" },
  { value: "failed", label: "Błędne" },
  { value: "completed", label: "Zakończone" },
];

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)} min`;
  return `${(m / 60).toFixed(1)} h`;
}

export default async function ProvisioningQueuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const state = sp.state ?? "";
  const data = await listProvisioningQueue(state || undefined);
  const nodeTasks = await listNodeTasks().catch(() => []);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Kolejka provisioningu</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sprint 5 / R-11+B-7 — BullMQ joby DA, retry, idempotency, dead-letter.
        </p>
      </header>

      {!data.async && (
        <div className="rounded-md border border-yellow-600/40 bg-yellow-500/10 p-4 text-sm text-yellow-100">
          {data.message ?? "Kolejka nie jest aktywna w trybie asynchronicznym."}
          <p className="mt-2 text-xs text-yellow-200/80">
            Aby aktywować, ustaw <code>REDIS_URL</code> w env API i zrestartuj usługę.
          </p>
        </div>
      )}

      {data.async && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {Object.entries(data.counts).map(([k, v]) => (
              <div
                key={k}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-3"
              >
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {k}
                </p>
                <p className="mt-1 text-2xl font-bold">{v}</p>
              </div>
            ))}
          </section>

          <nav className="flex gap-2 flex-wrap">
            {STATES.map((s) => {
              const active = (sp.state ?? "") === s.value;
              const href = s.value ? `/provisioning-queue?state=${s.value}` : "/provisioning-queue";
              return (
                <a
                  key={s.value || "all"}
                  href={href}
                  className={`rounded-md border px-3 py-1 text-xs ${
                    active
                      ? "border-indigo-500/40 bg-indigo-500/20 text-indigo-100"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                  }`}
                >
                  {s.label}
                </a>
              );
            })}
          </nav>

          <section className="rounded-lg border border-white/10 bg-black/30">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10 text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Job ID</th>
                  <th className="px-4 py-3">Subskrypcja</th>
                  <th className="px-4 py-3">Typ</th>
                  <th className="px-4 py-3">Stan</th>
                  <th className="px-4 py-3">Próby</th>
                  <th className="px-4 py-3">Czas trwania</th>
                  <th className="px-4 py-3">Błąd</th>
                  <th className="px-4 py-3 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-xs text-muted-foreground">
                      Brak jobów w wybranym stanie.
                    </td>
                  </tr>
                )}
                {data.rows.map((row) => {
                  const duration =
                    row.processedOn && row.finishedOn ? row.finishedOn - row.processedOn : null;
                  const wallclock =
                    row.processedOn && !row.finishedOn ? Date.now() - row.processedOn : null;
                  return (
                    <tr key={row.id} className="border-b border-white/5">
                      <td className="px-4 py-3 font-mono text-xs">{row.id}</td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-mono text-xs">{row.data.subscriptionId}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {row.data.domain || "(bez domeny)"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {row.subscription?.user.email ?? row.data.userId}
                          </p>
                          {row.subscription?.account && (
                            <p className="text-[11px] text-muted-foreground">
                              DA: {row.subscription.account.daUsername} / node {row.subscription.account.serverId}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs uppercase">{row.data.type}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                          {row.state}
                        </span>
                        {row.subscription?.provisioningStage && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            klient: {row.subscription.provisioningStage}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">{row.attemptsMade}</td>
                      <td className="px-4 py-3 text-xs">
                        {duration != null
                          ? fmtDuration(duration)
                          : wallclock != null
                            ? `${fmtDuration(wallclock)} (w toku)`
                            : "-"}
                      </td>
                      <td className="px-4 py-3 max-w-[300px] truncate text-xs text-red-300">
                        {row.failedReason ? (
                          <>
                            <span className="mr-2 rounded-full border border-red-500/30 px-1.5 py-0.5 text-[10px] uppercase">
                              {row.failedCategory}
                            </span>
                            {row.failedReason}
                          </>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.failedReason ? <RetryButton jobId={row.id} /> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Operacje węzłów</h2>
          <p className="text-sm text-muted-foreground mt-1">
            #13 — instalacje WP/aplikacji, profil hostingu, WAF, PHP, staging. Nieudane operacje
            możesz ponowić (agent węzła podejmie je ponownie).
          </p>
        </div>
        <NodeTasksSection rows={nodeTasks} />
      </section>
    </div>
  );
}
