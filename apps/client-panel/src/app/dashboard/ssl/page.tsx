import { Lock, ShieldCheck } from "lucide-react";
import { HostingSslForms } from "@/components/hosting/HostingSslForms";
import { HostingTabs } from '../components/hosting-tabs';
import { getHostingDaLinks, getHostingSsl, resolveServiceForHostingPages } from "../hosting-tools-data";

export const dynamic = "force-dynamic";

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
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Certyfikaty SSL</h1>
        <p className="text-neutral-400 text-sm md:text-base">Widok certyfikatów i przejście do panelu SSL w DirectAdmin.</p>
      </header>

      <HostingTabs currentTab="ssl" serviceId={service?.id} />

      {!service ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-muted-foreground">
          {serviceId
            ? 'Nie znaleziono usługi o podanym identyfikatorze.'
            : 'Brak aktywnej usługi hostingowej.'}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-6">
          <HostingSslForms serviceId={service.id} />
          <div className="flex items-center gap-3 pt-2 border-t border-white/10">
            <ShieldCheck className="h-5 w-5 text-white" />
            <p className="text-white font-semibold">Domeny na koncie (podgląd)</p>
          </div>
          {ssl?.fetchError ? (
            <p className="text-amber-300 text-sm">{ssl.fetchError}</p>
          ) : ssl && ssl.rows.length > 0 ? (
            <div className="space-y-3">
              {ssl.rows.map((cert) => (
                <div key={cert.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-white" />
                    <p className="text-white">{cert.domain}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{cert.issuer} • {cert.status}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Brak danych o certyfikatach.</p>
          )}
          {links?.sslUrl ? (
            <a href={links.sslUrl} target="_blank" rel="noreferrer" className="text-sm text-indigo-400 hover:underline inline-block">
              Otwórz panel SSL w DirectAdmin →
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}
