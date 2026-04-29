import { AlertCircle, Network } from "lucide-react";
import { HostingTabs } from "../components/hosting-tabs";
import { getHostingDns, resolveServiceForHostingPages } from "../hosting-tools-data";

export const dynamic = "force-dynamic";

export default async function DnsPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string; zone?: string }>;
}) {
  const { serviceId, zone } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const dns = service ? await getHostingDns(service.id, zone) : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Strefa DNS</h1>
        <p className="text-neutral-400 text-sm md:text-base">
          Rekordy DNS pobierane bezpośrednio z konta DirectAdmin przypisanego do usługi.
        </p>
      </header>

      <HostingTabs currentTab="dns" serviceId={service?.id} dnsZone={zone} />
      {!service ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-muted-foreground">
          {serviceId
            ? 'Nie znaleziono usługi o podanym identyfikatorze.'
            : 'Brak aktywnej usługi hostingowej.'}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Network className="h-5 w-5 text-white" />
            <div>
              <p className="text-white font-semibold">Domena: {dns?.domain ?? "—"}</p>
              <p className="text-xs text-muted-foreground">Usługa: {service.planName}</p>
            </div>
          </div>
          {dns?.fetchError ? (
            <p className="text-amber-300 text-sm">{dns.fetchError}</p>
          ) : dns && dns.records.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-white/10">
                    <th className="py-2 pr-4">Host</th>
                    <th className="py-2 pr-4">Typ</th>
                    <th className="py-2 pr-4">Wartość</th>
                    <th className="py-2">TTL</th>
                  </tr>
                </thead>
                <tbody>
                  {dns.records.map((record) => (
                    <tr key={record.id} className="border-b border-white/5">
                      <td className="py-2 pr-4 text-white">{record.name}</td>
                      <td className="py-2 pr-4 text-neutral-300">{record.type}</td>
                      <td className="py-2 pr-4 text-neutral-300">{record.value}</td>
                      <td className="py-2 text-neutral-300">{record.ttl ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              Brak rekordów DNS.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
