'use client';

import { Box, ExternalLink } from 'lucide-react';
import { HostingTabShell, DaExternalLink } from '@/components/hosting/HostingTabShell';
import { useHostingLinks, HostingLinksLoading } from '@/components/hosting/hosting-links-context';

interface StagingTabProps {
  serviceId: string;
}

export default function StagingTab({ serviceId: _serviceId }: StagingTabProps) {
  const { links, loading } = useHostingLinks();

  if (loading) {
    return <HostingLinksLoading label="Staging…" />;
  }

  return (
    <HostingTabShell
      title="Środowisko staging"
      description="Subdomeny i kopie plików konfigurujesz w panelu hostingu — np. staging.twojadomena.pl."
      icon={<Box className="h-4 w-4" />}
      actions={
        <>
          {links.domainManageUrl ? (
            <DaExternalLink href={links.domainManageUrl} variant="primary">
              Ustawienia domeny
              <ExternalLink className="h-3 w-3 opacity-70" />
            </DaExternalLink>
          ) : null}
          {links.domainsUrl ? (
            <DaExternalLink href={links.domainsUrl}>
              Wszystkie domeny
              <ExternalLink className="h-3 w-3 opacity-70" />
            </DaExternalLink>
          ) : null}
        </>
      }
    >
      <p className="text-xs text-neutral-400 leading-relaxed">
        Verris nie uruchamia klonów jednym przyciskiem — unikamy pozornych akcji. Staging budujesz przez
        subdomenę, osobny katalog i opcjonalnie kopię bazy w panelu hostingu.
      </p>
    </HostingTabShell>
  );
}
