import { FolderKanban } from "lucide-react";
import { HostingTabs } from "../components/hosting-tabs";
import { getHostingFtp, resolveServiceForHostingPages } from "../hosting-tools-data";

export const dynamic = "force-dynamic";

export default async function FtpPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const ftp = service ? await getHostingFtp(service.id) : null;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Konta FTP</h1>
        <p className="text-neutral-400 text-sm md:text-base">Konta pobierane bezpośrednio z DirectAdmin.</p>
      </header>
      <HostingTabs currentTab="ftp" serviceId={service?.id} />

      {!service ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-muted-foreground">
          {serviceId
            ? 'Nie znaleziono usługi o podanym identyfikatorze.'
            : 'Brak aktywnej usługi hostingowej.'}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
          <div className="flex items-center gap-3 mb-4">
            <FolderKanban className="h-5 w-5 text-white" />
            <h3 className="text-lg font-semibold text-white">Konta FTP</h3>
          </div>
          {ftp?.fetchError ? (
            <p className="text-amber-300 text-sm">{ftp.fetchError}</p>
          ) : ftp && ftp.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-white/10">
                    <th className="py-2 pr-4">Użytkownik</th>
                    <th className="py-2 pr-4">Katalog</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ftp.rows.map((row) => (
                    <tr key={row.id} className="border-b border-white/5">
                      <td className="py-2 pr-4 text-white">{row.username}</td>
                      <td className="py-2 pr-4 text-neutral-300">{row.path}</td>
                      <td className="py-2 text-neutral-300">{row.suspended ? "Zawieszone" : "Aktywne"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Brak kont FTP.</p>
          )}
        </div>
      )}
    </div>
  );
}
