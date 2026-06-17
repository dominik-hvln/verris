import { HostingPageWrapper } from '../components/hosting-tabs';
import { resolveServiceForHostingPages } from '../hosting-tools-data';
import { HostingNoServiceState, PanelCard } from '@/components/panel';
import { FileManagerClient } from './file-manager-client';

export const dynamic = 'force-dynamic';

export default async function FileManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const ready = service && service.account && service.account.status === 'ACTIVE';

  return (
    <HostingPageWrapper
      title="Menedżer plików"
      description="Przeglądaj, edytuj i wgrywaj pliki swojego hostingu — bez FTP."
      currentTab="filemanager"
      serviceId={service?.id}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : !ready ? (
        <PanelCard>
          <p className="py-8 text-center text-sm text-neutral-400">
            Konto hostingowe nie jest jeszcze gotowe. Menedżer plików będzie dostępny po
            zakończeniu provisioningu.
          </p>
        </PanelCard>
      ) : (
        <PanelCard>
          <FileManagerClient serviceId={service.id} domain={service.account!.domain} />
        </PanelCard>
      )}
    </HostingPageWrapper>
  );
}
