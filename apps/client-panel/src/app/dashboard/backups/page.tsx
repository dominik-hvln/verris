import { Archive } from 'lucide-react';
import { HostingPageWrapper } from '../components/hosting-tabs';
import {
  getHostingBackups,
  getHostingRestorePreview,
  resolveServiceForHostingPages,
} from '../hosting-tools-data';
import { BackupNowButton } from './backup-now-button';
import {
  HostingNoServiceState,
  PanelCard,
  PanelEmptyState,
  PanelFetchError,
} from '@/components/panel';

export const dynamic = 'force-dynamic';

export default async function BackupsPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const backups = service ? await getHostingBackups(service.id) : null;
  const preview = service ? await getHostingRestorePreview(service.id).catch(() => null) : null;

  return (
    <HostingPageWrapper
      title="Kopie zapasowe"
      description="Lista kopii i zlecenie pełnego backupu konta hostingowego."
      currentTab="backups"
      serviceId={service?.id}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : (
        <PanelCard className="space-y-4">
          <BackupNowButton serviceId={service.id} />
          {preview?.backup ? (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <p className="text-sm font-semibold text-cyan-100">
                Podgląd przywracania: {preview.backup.fileName}
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                Zakres:{' '}
                {preview.restoreScope
                  .map((item) => `${item.area}${item.count === null ? '' : ` (${item.count})`}`)
                  .join(', ')}
              </p>
              {preview.warnings.map((warning) => (
                <p key={warning} className="mt-1 text-xs text-amber-200">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
          {backups?.fetchError ? <PanelFetchError message={backups.fetchError} /> : null}
          {backups && !backups.fetchError && backups.rows.length > 0 ? (
            <div className="space-y-3">
              {backups.rows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <Archive className="h-4 w-4 text-white" aria-hidden />
                  <p className="text-sm text-white">{row.fileName}</p>
                </div>
              ))}
            </div>
          ) : backups && !backups.fetchError ? (
            <PanelEmptyState
              icon={Archive}
              title="Brak kopii zapasowych"
              description="Nie znaleziono kopii na tym koncie."
            />
          ) : null}
        </PanelCard>
      )}
    </HostingPageWrapper>
  );
}
