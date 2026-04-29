import { FolderOpen } from "lucide-react";
import { HostingTabs } from "../components/hosting-tabs";
import { getHostingDaLinks, resolveServiceForHostingPages } from "../hosting-tools-data";

export const dynamic = "force-dynamic";

export default async function FileManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const links = service ? await getHostingDaLinks(service.id) : null;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Menedżer plików</h1>
        <p className="text-neutral-400 text-sm md:text-base">
          Dostęp do panelu plików realizowany przez natywny File Manager w DirectAdmin.
        </p>
      </header>
      <HostingTabs currentTab="filemanager" serviceId={service?.id} />
      <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
        {!service ? (
          <p className="text-sm text-muted-foreground">
            {serviceId
              ? "Nie znaleziono usługi o podanym identyfikatorze."
              : "Brak aktywnej usługi hostingowej."}
          </p>
        ) : links?.fileManagerUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-white" />
              <p className="text-white font-semibold">DirectAdmin File Manager</p>
            </div>
            <a
              href={links.fileManagerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-indigo-400 hover:underline"
            >
              Otwórz menedżer plików →
            </a>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Brak linku do menedżera plików.</p>
        )}
      </div>
    </div>
  );
}
