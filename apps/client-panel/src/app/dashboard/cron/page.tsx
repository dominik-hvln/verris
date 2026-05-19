import { Clock } from 'lucide-react';
import { HostingPageWrapper } from '../components/hosting-tabs';
import { getHostingCron, resolveServiceForHostingPages } from '../hosting-tools-data';
import {
  HostingNoServiceState,
  PanelCard,
  PanelEmptyState,
  PanelFetchError,
} from '@/components/panel';

export const dynamic = 'force-dynamic';

export default async function CronPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const cron = service ? await getHostingCron(service.id) : null;

  return (
    <HostingPageWrapper
      title="Zadania Cron"
      description="Harmonogram zadań cyklicznych na hostingu."
      currentTab="cron"
      serviceId={service?.id}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : (
        <PanelCard>
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-white" aria-hidden />
            <h2 className="font-semibold text-white">Harmonogram cron</h2>
          </div>
          {cron?.fetchError ? <PanelFetchError message={cron.fetchError} /> : null}
          {cron && !cron.fetchError && cron.rows.length > 0 ? (
            <div className="space-y-3">
              {cron.rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="font-mono text-xs text-muted-foreground">{row.schedule}</p>
                  <p className="mt-1 font-mono text-sm text-white">{row.command}</p>
                </div>
              ))}
            </div>
          ) : cron && !cron.fetchError ? (
            <PanelEmptyState
              icon={Clock}
              title="Brak zadań cron"
              description="Nie skonfigurowano jeszcze zadań cyklicznych."
            />
          ) : null}
        </PanelCard>
      )}
    </HostingPageWrapper>
  );
}
