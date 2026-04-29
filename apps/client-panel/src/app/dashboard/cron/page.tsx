import { Clock } from "lucide-react";
import { HostingTabs } from "../components/hosting-tabs";
import { getHostingCron, resolveServiceForHostingPages } from "../hosting-tools-data";

export const dynamic = "force-dynamic";

export default async function CronPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const cron = service ? await getHostingCron(service.id) : null;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Zadania Cron</h1>
        <p className="text-neutral-400 text-sm md:text-base">Harmonogram pobierany z konta DirectAdmin.</p>
      </header>

      <HostingTabs currentTab="cron" serviceId={service?.id} />

      {!service ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-muted-foreground">
          {serviceId
            ? 'Nie znaleziono usługi o podanym identyfikatorze.'
            : 'Brak aktywnej usługi hostingowej.'}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-white" />
            <p className="text-white font-semibold">Harmonogram cron</p>
          </div>
          {cron?.fetchError ? (
            <p className="text-amber-300 text-sm">{cron.fetchError}</p>
          ) : cron && cron.rows.length > 0 ? (
            <div className="space-y-3">
              {cron.rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-xs text-muted-foreground font-mono">{row.schedule}</p>
                  <p className="text-sm text-white font-mono mt-1">{row.command}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Brak zadań cron.</p>
          )}
        </div>
      )}
    </div>
  );
}
