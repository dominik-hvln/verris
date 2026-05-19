import { Lock, ShieldCheck } from 'lucide-react';
import { HostingSslForms } from '@/components/hosting/HostingSslForms';
import { HostingPageWrapper } from '../components/hosting-tabs';
import { getHostingDaLinks, getHostingSsl, resolveServiceForHostingPages } from '../hosting-tools-data';
import {
  HostingNoServiceState,
  PanelCard,
  PanelEmptyState,
  PanelFetchError,
} from '@/components/panel';

export const dynamic = 'force-dynamic';

export default async function SslPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const ssl = service ? await getHostingSsl(service.id) : null;
  const links = service ? await getHostingDaLinks(service.id) : null;

  return (
    <HostingPageWrapper
      title="Certyfikaty SSL"
      description="Wystawianie i podgląd certyfikatów dla domen na hostingu."
      currentTab="ssl"
      serviceId={service?.id}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : (
        <PanelCard className="space-y-6">
          <HostingSslForms serviceId={service.id} />
          <div className="flex items-center gap-3 border-t border-white/10 pt-2">
            <ShieldCheck className="h-5 w-5 text-white" aria-hidden />
            <p className="font-semibold text-white">Domeny na koncie (podgląd)</p>
          </div>
          {ssl?.fetchError ? <PanelFetchError message={ssl.fetchError} /> : null}
          {ssl && !ssl.fetchError && ssl.rows.length > 0 ? (
            <div className="space-y-3">
              {ssl.rows.map((cert) => (
                <article key={cert.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-white" aria-hidden />
                    <p className="text-white">{cert.domain}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {cert.issuer} • {cert.status}
                  </p>
                </article>
              ))}
            </div>
          ) : ssl && !ssl.fetchError ? (
            <PanelEmptyState icon={Lock} title="Brak certyfikatów" description="Nie znaleziono certyfikatów SSL na tym koncie." />
          ) : null}
          {links?.sslUrl ? (
            <a
              href={links.sslUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-sm text-indigo-400 hover:underline"
            >
              Otwórz zaawansowany panel SSL →
            </a>
          ) : null}
        </PanelCard>
      )}
    </HostingPageWrapper>
  );
}
