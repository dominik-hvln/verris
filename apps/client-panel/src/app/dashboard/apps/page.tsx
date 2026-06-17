import { HostingPageWrapper } from '../components/hosting-tabs';
import { resolveServiceForHostingPages } from '../hosting-tools-data';
import { HostingNoServiceState, PanelCard, PanelFetchError } from '@/components/panel';
import { fetchAppsStatus } from './apps-actions';
import { AppsClient } from './apps-client';

export const dynamic = 'force-dynamic';

export default async function AppsPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const status = service ? await fetchAppsStatus(service.id) : null;

  return (
    <HostingPageWrapper
      title="Aplikacje 1-click"
      description="Zainstaluj gotową aplikację (Nextcloud, PrestaShop) na swojej domenie jednym kliknięciem."
      currentTab="apps"
      serviceId={service?.id}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : (
        <PanelCard>
          {!status ? (
            <PanelFetchError message="Nie udało się pobrać katalogu aplikacji." />
          ) : (
            <AppsClient serviceId={service.id} status={status} />
          )}
        </PanelCard>
      )}
    </HostingPageWrapper>
  );
}
