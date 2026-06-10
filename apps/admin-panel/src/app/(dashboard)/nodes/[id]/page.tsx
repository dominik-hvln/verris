import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Server, AlertCircle, Cpu, MemoryStick, HardDrive, Clock, Globe } from "lucide-react";
import { fetchServer } from "../actions";
import { ApproveServerButton } from "./approve-button";
import { BootstrapScriptPanel } from "./bootstrap-script-panel";
import { DirectAdminConfigForm } from "./directadmin-form";
import { HostingProfilePanel } from "./hosting-profile-panel";
import { NodeStackReadinessPanel } from "./node-stack-readiness-panel";
import { MaintenanceToggle } from "./maintenance-toggle";
import { NodeAuditPanel } from "./node-audit-panel";
import { NodeInsightsPanel } from "./node-insights-panel";
import { NameserversForm } from "./nameservers-form";

export const dynamic = "force-dynamic";

export default async function ServerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: server, error } = await fetchServer(id);
  if (!server) {
    if (error?.toLowerCase().includes("not found")) notFound();
    return (
      <div className="space-y-4">
        <Link href="/nodes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Wróć do listy
        </Link>
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200 text-sm flex gap-2 items-center">
          <AlertCircle className="h-4 w-4" /> {error ?? "Nie znaleziono węzła"}
        </div>
      </div>
    );
  }

  const isPending = server.status === "PENDING_APPROVAL";
  const canBootstrap = server.status === "INIT" || server.status === "PENDING_APPROVAL";

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href="/nodes"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Lista węzłów
        </Link>
      </div>

      <header className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 flex items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
            <Server className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">
              {server.name ?? "(bez nazwy)"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {server.status === "INIT" ? "Oczekuje na pierwszy handshake" : server.ipAddress}
              {server.region ? ` • ${server.region}` : ""} • status:{" "}
              <strong className="text-white">{server.status}</strong>
            </p>
          </div>
        </div>

        {isPending && <ApproveServerButton serverId={server.id} />}
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoCard
          icon={<Cpu className="h-4 w-4" />}
          label="CPU"
          value={server.totalCpuCores ? `${server.totalCpuCores} rdzeni` : "—"}
          sub={`alok. ${server.allocatedCpu}%`}
        />
        <InfoCard
          icon={<MemoryStick className="h-4 w-4" />}
          label="RAM"
          value={server.totalMemoryMb ? formatMb(server.totalMemoryMb) : "—"}
          sub={`alok. ${formatMb(server.allocatedMemory)}`}
        />
        <InfoCard
          icon={<HardDrive className="h-4 w-4" />}
          label="Dysk"
          value={server.totalDiskMb ? formatMb(server.totalDiskMb) : "—"}
          sub={`alok. ${formatMb(server.allocatedDisk)}`}
        />
        <InfoCard
          icon={<Clock className="h-4 w-4" />}
          label="Heartbeat"
          value={server.lastHeartbeatAt ? new Date(server.lastHeartbeatAt).toLocaleString("pl-PL") : "brak"}
          sub={server.agentVersion ? `agent ${server.agentVersion}` : undefined}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Globe className="h-4 w-4 text-indigo-300" /> Tożsamość węzła
          </div>
          <DefRow label="ID" value={<code className="font-mono text-xs">{server.id}</code>} />
          <DefRow label="Hostname" value={server.hostname ?? "—"} />
          <DefRow
            label="Ostatni handshake"
            value={server.lastHandshakeAt ? new Date(server.lastHandshakeAt).toLocaleString("pl-PL") : "brak"}
          />
          <DefRow label="Liczba kont" value={String(server._count?.accounts ?? 0)} />
          {server.notes && <DefRow label="Notatki" value={server.notes} />}
        </div>

        {canBootstrap && <BootstrapScriptPanel serverId={server.id} />}
      </section>

      {(server.status === "ACTIVE" || server.status === "MAINTENANCE") && (
        <div id="zuzycie" className="scroll-mt-24">
          <NodeInsightsPanel serverId={server.id} />
        </div>
      )}

      <MaintenanceToggle
        serverId={server.id}
        status={server.status}
        maintenanceReason={server.maintenanceReason}
        maintenanceStartedAt={server.maintenanceStartedAt}
      />

      <div id="directadmin" className="scroll-mt-24">
        <DirectAdminConfigForm
          serverId={server.id}
          initial={{
            daHost: server.daHost ?? "",
            daPort: server.daPort ?? 2222,
            daUsername: server.daUsername ?? "",
            daUseTls: server.daUseTls,
            daAllowInvalidCert: server.daAllowInvalidCert ?? false,
            daPasswordSet: server.daPasswordSet,
          }}
        />
      </div>

      <div id="nameservers" className="scroll-mt-24">
        <NameserversForm serverId={server.id} />
      </div>

      {(server.status === "ACTIVE" || server.status === "MAINTENANCE") && (
        <NodeStackReadinessPanel serverId={server.id} serverStatus={server.status} />
      )}

      <div id="hosting-profile" className="scroll-mt-24">
        <HostingProfilePanel serverId={server.id} serverStatus={server.status} />
      </div>

      {(server.status === "ACTIVE" || server.status === "MAINTENANCE") && (
        <div id="audyt" className="scroll-mt-24">
          <NodeAuditPanel serverId={server.id} serverName={server.name} />
        </div>
      )}
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/40 backdrop-blur-md p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function DefRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm border-b border-white/5 pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-white truncate min-w-0">{value}</span>
    </div>
  );
}

function formatMb(mb: number | null | undefined): string {
  if (!mb) return "0 MB";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}
