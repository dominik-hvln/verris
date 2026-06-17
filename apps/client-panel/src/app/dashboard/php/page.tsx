import { HostingPageWrapper } from '../components/hosting-tabs';
import { resolveServiceForHostingPages } from '../hosting-tools-data';
import { HostingNoServiceState, PanelCard, PanelFetchError } from '@/components/panel';
import { fetchPhpStatus } from './php-actions';
import { PhpClient } from './php-client';

export const dynamic = 'force-dynamic';

export default async function PhpPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const status = service ? await fetchPhpStatus(service.id) : null;

  return (
    <HostingPageWrapper
      title="Wersja PHP"
      description="Wybierz wersję PHP dla swojego konta hostingowego."
      currentTab="php"
      serviceId={service?.id}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : (
        <PanelCard>
          {!status ? (
            <PanelFetchError message="Nie udało się pobrać konfiguracji PHP dla tej usługi." />
          ) : (
            <PhpClient serviceId={service.id} status={status} />
          )}
        </PanelCard>
      )}
    </HostingPageWrapper>
  );
}
