import { Database as DatabaseIcon, User } from 'lucide-react';
import { HostingTabs } from '../components/hosting-tabs';
import { getHostingDatabases, resolveServiceForHostingPages } from "../hosting-tools-data";

export const dynamic = "force-dynamic";

export default async function DatabasesPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const databases = service ? await getHostingDatabases(service.id) : null;

  return (
    <div className="space-y-8">
      <div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Bazy danych</h1>
          <p className="text-neutral-400 text-sm md:text-base">Lista baz z konta DirectAdmin.</p>
        </div>
      </div>

      <HostingTabs currentTab="databases" serviceId={service?.id} />

      {!service ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-muted-foreground">
          {serviceId
            ? 'Nie znaleziono usługi o podanym identyfikatorze.'
            : 'Brak aktywnej usługi hostingowej.'}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
          {databases?.fetchError ? (
            <p className="text-amber-300 text-sm">{databases.fetchError}</p>
          ) : databases && databases.databases.length > 0 ? (
            <div className="space-y-3">
              {databases.databases.map((db) => (
                <div key={db.name} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2">
                    <DatabaseIcon className="h-4 w-4 text-white" />
                    <p className="text-white">{db.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Dostęp przez DirectAdmin/phpMyAdmin
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Brak baz danych.</p>
          )}
        </div>
      )}
    </div>
  );
}
