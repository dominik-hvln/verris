import { Database as DatabaseIcon, User } from 'lucide-react';
import { HostingPageWrapper } from '../components/hosting-tabs';
import { getHostingDatabases, resolveServiceForHostingPages } from '../hosting-tools-data';
import {
  HostingNoServiceState,
  PanelCard,
  PanelEmptyState,
  PanelFetchError,
} from '@/components/panel';

export const dynamic = 'force-dynamic';

export default async function DatabasesPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const databases = service ? await getHostingDatabases(service.id) : null;

  return (
    <HostingPageWrapper
      title="Bazy danych"
      description="Lista baz MySQL na Twoim koncie hostingowym."
      currentTab="databases"
      serviceId={service?.id}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : (
        <PanelCard>
          {databases?.fetchError ? <PanelFetchError message={databases.fetchError} /> : null}
          {databases && !databases.fetchError && databases.databases.length > 0 ? (
            <div className="space-y-3">
              {databases.databases.map((db) => (
                <div key={db.name} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2">
                    <DatabaseIcon className="h-4 w-4 text-white" aria-hidden />
                    <p className="text-white">{db.name}</p>
                  </div>
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" aria-hidden />
                    Zarządzanie przez phpMyAdmin w panelu hostingu
                  </p>
                </div>
              ))}
            </div>
          ) : databases && !databases.fetchError ? (
            <PanelEmptyState
              icon={DatabaseIcon}
              title="Brak baz danych"
              description="Na tym koncie nie utworzono jeszcze baz MySQL."
            />
          ) : null}
        </PanelCard>
      )}
    </HostingPageWrapper>
  );
}
