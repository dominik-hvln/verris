import { HostingPageWrapper } from '../components/hosting-tabs';
import {
  getHostingMigrationBundles,
  resolveServiceForHostingPages,
} from '../hosting-tools-data';
import { MigrationsClient } from './migrations-client';
import { HostingNoServiceState, PanelCard } from '@/components/panel';
import type { MigrationBundleSummary } from './types';

export const dynamic = 'force-dynamic';

export default async function MigrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  let bundles: MigrationBundleSummary[] = [];
  if (service) {
    bundles = await getHostingMigrationBundles(service.id).catch(() => []);
  }

  return (
    <HostingPageWrapper
      title="Migracje"
      description="Przenieś stronę, bazy i pocztę ze starego hostingu — automatycznie i z postępem na żywo."
      currentTab="migrations"
      serviceId={service?.id}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : (
        <div className="space-y-6">
          <PanelCard accent className="text-sm leading-relaxed text-amber-100/90">
            <p className="mb-2 font-semibold">Jak działa migracja</p>
            <ul className="list-inside list-disc space-y-1 text-xs text-amber-100/80">
              <li>
                Podajesz dane do panelu starego hostingu (wykryjemy zawartość) albo ręcznie
                dane FTP / baz / skrzynek.
              </li>
              <li>
                Przenosiny plików, baz MySQL, WordPressa i poczty są <strong>w pełni automatyczne</strong>.
              </li>
              <li>
                Na koniec przełączasz DNS jednym kliknięciem. Do tego czasu stara strona działa bez przerwy.
              </li>
            </ul>
          </PanelCard>
          <MigrationsClient serviceId={service.id} bundles={bundles} />
        </div>
      )}
    </HostingPageWrapper>
  );
}
