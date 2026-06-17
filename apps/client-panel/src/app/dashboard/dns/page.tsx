import { Network } from 'lucide-react';
import { HostingPageWrapper } from '../components/hosting-tabs';
import { getHostingDns, resolveServiceForHostingPages } from '../hosting-tools-data';
import { DnsManager } from './dns-manager';
import { HostingNoServiceState, PanelCard, PanelFetchError } from '@/components/panel';

export const dynamic = 'force-dynamic';

export default async function DnsPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string; zone?: string }>;
}) {
  const { serviceId, zone } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const dns = service ? await getHostingDns(service.id, zone) : null;

  return (
    <HostingPageWrapper
      title="Strefa DNS"
      description="Rekordy DNS przypisane do Twojej usługi hostingowej."
      currentTab="dns"
      serviceId={service?.id}
      dnsZone={zone}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : (
        <PanelCard className="space-y-4">
          <div className="flex items-center gap-3">
            <Network className="h-5 w-5 text-white" aria-hidden />
            <div>
              <p className="font-semibold text-white">Domena: {dns?.domain ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Usługa: {service.planName}</p>
            </div>
          </div>
          {dns?.fetchError ? <PanelFetchError message={dns.fetchError} /> : null}
          {dns && !dns.fetchError ? (
            <DnsManager serviceId={service.id} domain={dns.domain} records={dns.records} />
          ) : null}
        </PanelCard>
      )}
    </HostingPageWrapper>
  );
}
