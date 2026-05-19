import { FolderKanban } from 'lucide-react';
import { HostingPageWrapper } from '../components/hosting-tabs';
import { getHostingFtp, resolveServiceForHostingPages } from '../hosting-tools-data';
import { FtpAccountsList } from './ftp-accounts-list';
import { HostingNoServiceState, PanelCard, PanelFetchError } from '@/components/panel';

export const dynamic = 'force-dynamic';

export default async function FtpPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const ftp = service ? await getHostingFtp(service.id) : null;

  return (
    <HostingPageWrapper
      title="Konta FTP"
      description="Zarządzaj dostępem FTP do plików na hostingu."
      currentTab="ftp"
      serviceId={service?.id}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : (
        <PanelCard>
          <div className="mb-4 flex items-center gap-3">
            <FolderKanban className="h-5 w-5 text-white" aria-hidden />
            <h2 className="text-lg font-semibold text-white">Konta FTP</h2>
          </div>
          {ftp?.fetchError ? <PanelFetchError message={ftp.fetchError} /> : null}
          {ftp && !ftp.fetchError ? <FtpAccountsList rows={ftp.rows} /> : null}
        </PanelCard>
      )}
    </HostingPageWrapper>
  );
}
