import { Archive } from "lucide-react";
import { HostingTabs } from "../components/hosting-tabs";
import {
  getHostingBackups,
  getHostingRestorePreview,
  resolveServiceForHostingPages,
} from "../hosting-tools-data";
import { BackupNowButton } from "./backup-now-button";

export const dynamic = "force-dynamic";

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
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Kopie zapasowe</h1>
        <p className="text-neutral-400 text-sm md:text-base">
          Lista kopii i zlecenie pełnego backupu konta przez DirectAdmin (<span className="font-mono">CMD_API_SITE_BACKUP</span>).
        </p>
      </header>

      <HostingTabs currentTab="backups" serviceId={service?.id} />

      {!service ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-muted-foreground">
          {serviceId
            ? 'Nie znaleziono usługi o podanym identyfikatorze.'
            : 'Brak aktywnej usługi hostingowej.'}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
          <BackupNowButton serviceId={service.id} />
          {preview?.backup ? (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <p className="text-sm font-semibold text-cyan-100">Restore preview: {preview.backup.fileName}</p>
              <p className="mt-1 text-xs text-neutral-400">
                Zakres: {preview.restoreScope.map((item) => `${item.area}${item.count === null ? "" : ` (${item.count})`}`).join(", ")}
              </p>
              {preview.warnings.map((warning) => (
                <p key={warning} className="mt-1 text-xs text-amber-200">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
          {backups?.fetchError ? (
            <p className="text-amber-300 text-sm">{backups.fetchError}</p>
          ) : backups && backups.rows.length > 0 ? (
            <div className="space-y-3">
              {backups.rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center gap-3">
                  <Archive className="h-4 w-4 text-white" />
                  <p className="text-sm text-white">{row.fileName}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Brak kopii zapasowych.</p>
          )}
        </div>
      )}
    </div>
  );
}
