import { HostingPageWrapper } from '../components/hosting-tabs';
import { getHostingEmail, resolveServiceForHostingPages } from '../hosting-tools-data';
import { fetchClientPlatformConfig } from '../platform-actions';
import { HostingNoServiceState, PanelCard, PanelFetchError } from '@/components/panel';
import { EmailManager } from './email-manager';
import { fetchDeliverability } from './deliverability-actions';
import { DeliverabilityPanel } from './deliverability-panel';

export const dynamic = 'force-dynamic';

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const [email, config, deliverability] = await Promise.all([
    service ? getHostingEmail(service.id) : Promise.resolve(null),
    fetchClientPlatformConfig(),
    service ? fetchDeliverability(service.id) : Promise.resolve(null),
  ]);

  return (
    <HostingPageWrapper
      title="Poczta e-mail"
      description="Skrzynki e-mail Twojej usługi oraz dostęp do webmaila (Roundcube)."
      currentTab="email"
      serviceId={service?.id}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : (
        <div className="space-y-4">
          <PanelCard>
            {email?.fetchError ? <PanelFetchError message={email.fetchError} /> : null}
            {email && !email.fetchError ? (
              <EmailManager
                serviceId={service.id}
                domain={service.account?.domain ?? null}
                rows={email.rows}
                webmailUrl={config.webmailUrl}
              />
            ) : null}
          </PanelCard>
          <DeliverabilityPanel serviceId={service.id} initial={deliverability} />
        </div>
      )}
    </HostingPageWrapper>
  );
}
