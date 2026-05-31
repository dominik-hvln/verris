'use client';

import { ExternalLink, FolderOpen } from 'lucide-react';
import { HostingTabShell, DaExternalLink } from '@/components/hosting/HostingTabShell';
import { useHostingLinks, HostingLinksLoading } from '@/components/hosting/hosting-links-context';

export default function HostingFileManagerTab({ serviceId: _serviceId }: { serviceId: string }) {
  const { links, loading } = useHostingLinks();

  if (loading) {
    return <HostingLinksLoading label="Menedżer plików…" />;
  }

  return (
    <HostingTabShell
      title="Menedżer plików"
      description="Przeglądaj i edytuj pliki swojej strony."
      icon={<FolderOpen className="h-4 w-4" />}
      actions={
        links.fileManagerUrl ? (
          <DaExternalLink href={links.fileManagerUrl} variant="primary">
            Otwórz menedżer plików
            <ExternalLink className="h-3 w-3 opacity-70" />
          </DaExternalLink>
        ) : null
      }
    >
      {links.fileManagerUrl ? (
        <p className="text-xs text-neutral-400">
          Otworzysz menedżer plików głównej domeny usługi.
        </p>
      ) : (
        <p className="text-xs text-amber-200">Brak linku — upewnij się, że usługa jest w pełni aktywna.</p>
      )}
    </HostingTabShell>
  );
}
