import { Mail as MailIcon } from "lucide-react";
import { HostingTabs } from "../components/hosting-tabs";
import { getHostingEmail, resolveServiceForHostingPages } from "../hosting-tools-data";

export const dynamic = "force-dynamic";

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const email = service ? await getHostingEmail(service.id) : null;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Poczta E-mail</h1>
        <p className="text-neutral-400 text-sm md:text-base">Skrzynki pobierane bezpośrednio z DirectAdmin.</p>
      </header>

      <HostingTabs currentTab="email" serviceId={service?.id} />

      {!service ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-muted-foreground">
          {serviceId
            ? 'Nie znaleziono usługi o podanym identyfikatorze.'
            : 'Brak aktywnej usługi hostingowej.'}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
          {email?.fetchError ? (
            <p className="text-amber-300 text-sm">{email.fetchError}</p>
          ) : email && email.rows.length > 0 ? (
            <div className="space-y-3">
              {email.rows.map((box) => (
                <div key={box.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-3">
                    <MailIcon className="h-4 w-4 text-white" />
                    <p className="text-white font-medium">{box.email}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Limit: {box.quotaMb != null ? `${box.quotaMb} MB` : "brak limitu"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Brak skrzynek e-mail.</p>
          )}
        </div>
      )}
    </div>
  );
}
