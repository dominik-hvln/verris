import { Mail as MailIcon } from 'lucide-react';
import { HostingPageWrapper } from '../components/hosting-tabs';
import { getHostingEmail, resolveServiceForHostingPages } from '../hosting-tools-data';
import {
  HostingNoServiceState,
  PanelCard,
  PanelEmptyState,
  PanelFetchError,
} from '@/components/panel';

export const dynamic = 'force-dynamic';

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const email = service ? await getHostingEmail(service.id) : null;

  return (
    <HostingPageWrapper
      title="Poczta e-mail"
      description="Skrzynki e-mail przypisane do Twojej usługi hostingowej."
      currentTab="email"
      serviceId={service?.id}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : (
        <PanelCard>
          {email?.fetchError ? <PanelFetchError message={email.fetchError} /> : null}
          {email && !email.fetchError && email.rows.length > 0 ? (
            <div className="space-y-3">
              {email.rows.map((box) => (
                <div key={box.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-3">
                    <MailIcon className="h-4 w-4 text-white" aria-hidden />
                    <p className="font-medium text-white">{box.email}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Limit: {box.quotaMb != null ? `${box.quotaMb} MB` : 'brak limitu'}
                  </p>
                </div>
              ))}
            </div>
          ) : email && !email.fetchError ? (
            <PanelEmptyState
              icon={MailIcon}
              title="Brak skrzynek"
              description="Nie znaleziono skrzynek e-mail na tym koncie."
            />
          ) : null}
        </PanelCard>
      )}
    </HostingPageWrapper>
  );
}
