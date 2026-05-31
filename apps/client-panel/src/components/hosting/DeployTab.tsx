'use client';

import { Rocket, ExternalLink } from 'lucide-react';
import { HostingTabShell, DaExternalLink } from '@/components/hosting/HostingTabShell';
import { useHostingLinks, HostingLinksLoading } from '@/components/hosting/hosting-links-context';

interface DeployTabProps {
  serviceId: string;
}

export default function DeployTab({ serviceId: _serviceId }: DeployTabProps) {
  const { links, loading } = useHostingLinks();

  if (loading) {
    return <HostingLinksLoading label="Deploy…" />;
  }

  return (
    <HostingTabShell
      title="Wdrożenia (Git / CI)"
      description="Push-to-deploy z webhookiem w tym panelu nie jest jeszcze dostępny."
      icon={<Rocket className="h-4 w-4" />}
      actions={
        links.panelBaseUrl ? (
          <DaExternalLink href={links.panelBaseUrl}>
            Panel hostingu
            <ExternalLink className="h-3 w-3 opacity-70" />
          </DaExternalLink>
        ) : null
      }
    >
      <p className="text-xs text-neutral-400 leading-relaxed">
        Wdrożenia wykonasz przez Git, harmonogram zadań (cron) lub integrację CI/CD.
      </p>
    </HostingTabShell>
  );
}
