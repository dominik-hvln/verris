import { FolderOpen } from 'lucide-react';
import { HostingPageWrapper } from '../components/hosting-tabs';
import { getHostingDaLinks, resolveServiceForHostingPages } from '../hosting-tools-data';
import { HostingNoServiceState, PanelCard, PanelEmptyState } from '@/components/panel';

export const dynamic = 'force-dynamic';

export default async function FileManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const links = service ? await getHostingDaLinks(service.id) : null;

  return (
    <HostingPageWrapper
      title="Menedżer plików"
      description="Przejdź do panelu plików na hostingu."
      currentTab="filemanager"
      serviceId={service?.id}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : (
        <PanelCard>
          {links?.fileManagerUrl ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-white" aria-hidden />
                <p className="font-semibold text-white">Panel plików</p>
              </div>
              <a
                href={links.fileManagerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-indigo-400 hover:underline"
              >
                Otwórz menedżer plików →
              </a>
            </div>
          ) : (
            <PanelEmptyState
              icon={FolderOpen}
              title="Brak linku"
              description="Nie udało się wygenerować adresu menedżera plików."
            />
          )}
        </PanelCard>
      )}
    </HostingPageWrapper>
  );
}
