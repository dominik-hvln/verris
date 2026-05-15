import { Activity, AlertCircle } from "lucide-react";
import { listProbes, listServersForProbes } from "../actions";
import { ProbesTable } from "./probes-table";
import { CreateProbeForm } from "./create-probe-form";

export const dynamic = "force-dynamic";

export default async function StatusProbesPage() {
  const [probesResult, serversResult] = await Promise.all([
    listProbes(),
    listServersForProbes(),
  ]);
  const probes = probesResult.ok ? probesResult.data ?? [] : [];
  const servers = serversResult.ok ? serversResult.data ?? [] : [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md flex items-center gap-3">
            <Activity className="h-7 w-7 text-indigo-400" />
            Status & Probes
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Konfiguracja monitorów dostępności (HTTP/HTTPS/SMTP/IMAP/POP3/MySQL/SSH/DA-API/DNS).
            Wyniki zasilają publiczną stronę <code className="text-xs">status.verris.pl</code>{" "}
            oraz banner incydentu w panelu klienta.
          </p>
        </div>
      </header>

      {!probesResult.ok && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" />
          <span>Nie udało się pobrać probes: {probesResult.error}</span>
        </div>
      )}
      {!serversResult.ok && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertCircle className="h-4 w-4" />
          <span>
            Nie udało się pobrać listy serwerów: {serversResult.error}. Bez serwerów nie da się
            dodać nowej probe.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-8">
        <ProbesTable probes={probes} servers={servers} />
        <CreateProbeForm servers={servers} />
      </div>
    </div>
  );
}
