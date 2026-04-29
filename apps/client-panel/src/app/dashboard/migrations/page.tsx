import { ExternalLink, Repeat } from 'lucide-react';
import { HostingTabs } from '../components/hosting-tabs';
import { getHostingMigrationTimeline, resolveServiceForHostingPages } from '../hosting-tools-data';
import { ExternalMigrationForm } from './external-migration-form';

export const dynamic = 'force-dynamic';

export default async function MigrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const timeline = service ? await getHostingMigrationTimeline(service.id) : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Migracje</h1>
        <p className="text-neutral-400 text-sm md:text-base">
          G‑6/G‑7: formularz migracji zewnętrznej i status workerów migracyjnych.
        </p>
      </header>

      <HostingTabs currentTab="migrations" serviceId={service?.id} />

      {!service ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-muted-foreground">
          {serviceId ? 'Nie znaleziono usługi o podanym identyfikatorze.' : 'Brak aktywnej usługi hostingowej.'}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
            <h2 className="text-white font-semibold">Migracja zewnętrzna (FTP / MySQL / IMAP)</h2>
            <p className="text-xs text-neutral-500">
              Po zgłoszeniu worker automatycznie wykonuje backup DirectAdmin i zakłada ticket techniczny.
            </p>
            <ExternalMigrationForm serviceId={service.id} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
            <h2 className="text-white font-semibold">Oś zdarzeń migracji</h2>
            {timeline && timeline.length > 0 ? (
              <div className="space-y-3">
                {timeline.map((row) => (
                  <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-1">
                    <p className="text-sm text-white font-medium flex items-center gap-2">
                      <Repeat className="h-4 w-4 text-cyan-300" />
                      {row.type}
                    </p>
                    <p className="text-xs text-neutral-500">{new Date(row.createdAt).toLocaleString('pl-PL')}</p>
                    {row.details?.ticketId ? (
                      <p className="text-xs text-neutral-300 flex items-center gap-2">
                        Ticket: {String(row.details.ticketId)}
                        <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Brak zgłoszeń migracji dla tej usługi.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

