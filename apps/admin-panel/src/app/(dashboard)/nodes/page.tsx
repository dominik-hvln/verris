import Link from "next/link";
import { Server, Plus, Cpu, MemoryStick, HardDrive, Clock, AlertCircle, Gauge } from "lucide-react";
import type { ServerSummaryDto, ServerStatus } from "@verris/contracts";
import { fetchServers } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminNodesPage() {
  const { data: servers, error } = await fetchServers();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">
            Węzły &amp; Serwery
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Zarządzanie flotą serwerów obliczeniowych: inicjalizacja, akceptacja, konfiguracja
            DirectAdmin i monitoring obciążenia.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/nodes/wizard"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-all shadow-[0_0_15px_rgba(99,102,241,0.4)]"
        >
          <Plus className="h-4 w-4" />
          Wizard nowego węzła
        </Link>
        <Link
          href="/nodes/capacity"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-white border border-white/10 rounded-lg"
        >
          <Gauge className="h-4 w-4" />
          Pojemność floty
        </Link>
        <Link
          href="/nodes/init"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-white border border-white/10 rounded-lg"
        >
          Szybka inicjalizacja
        </Link>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" />
          <span>Nie udało się pobrać listy węzłów: {error}</span>
        </div>
      )}

      <Summary servers={servers} />

      {servers.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {servers.map((server) => (
            <ServerCard key={server.id} server={server} />
          ))}
        </div>
      )}
    </div>
  );
}

function Summary({ servers }: { servers: ServerSummaryDto[] }) {
  const counts = servers.reduce<Record<ServerStatus, number>>(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    { INIT: 0, PENDING_APPROVAL: 0, ACTIVE: 0, MAINTENANCE: 0, OFFLINE: 0, DEPROVISIONING: 0 },
  );

  const items: { label: string; value: number; tone: string }[] = [
    { label: "Aktywne", value: counts.ACTIVE, tone: "emerald" },
    { label: "Oczekujące akceptacji", value: counts.PENDING_APPROVAL, tone: "amber" },
    { label: "Inicjalizowane", value: counts.INIT, tone: "indigo" },
    { label: "Konserwacja", value: counts.MAINTENANCE, tone: "slate" },
    { label: "Offline", value: counts.OFFLINE, tone: "rose" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-white/5 bg-black/30 backdrop-blur-md p-4"
        >
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className={`text-2xl font-semibold mt-1 text-${item.tone}-300`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 backdrop-blur-md p-10 text-center">
      <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
        <Server className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Nie masz jeszcze żadnych węzłów</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Aby zacząć, dodaj pierwszy węzeł — wygenerujemy jednorazowy skrypt bootstrap, który
        zainicjalizuje serwer i zarejestruje go w panelu.
      </p>
      <Link
        href="/nodes/wizard"
        className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors"
      >
        <Plus className="h-4 w-4" />
        Uruchom wizard węzła
      </Link>
    </div>
  );
}

function ServerCard({ server }: { server: ServerSummaryDto }) {
  const accent = statusAccent(server.status);

  const ramAlloc = server.totalMemoryMb
    ? Math.min(100, Math.round((server.allocatedMemory / server.totalMemoryMb) * 100))
    : 0;

  return (
    <Link
      href={`/nodes/${server.id}`}
      className="group relative overflow-hidden rounded-2xl p-[1px] transition-all hover:scale-[1.01] duration-300"
    >
      <div
        className={`absolute inset-0 bg-linear-to-br ${accent.gradient} rounded-2xl blur-lg opacity-30 group-hover:opacity-50 transition-all`}
      />
      <div className="relative flex h-full flex-col gap-5 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 p-6 shadow-2xl">
        <div className="flex justify-between items-start gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`h-10 w-10 flex items-center justify-center rounded-xl ${accent.bg}`}>
              <Server className={`h-5 w-5 ${accent.text}`} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-white truncate">
                {server.name ?? "(bez nazwy)"}
              </h3>
              <p className="text-xs text-muted-foreground truncate">
                {server.status === "INIT"
                  ? "oczekuje na bootstrap"
                  : server.ipAddress}
                {server.region ? ` • ${server.region}` : ""}
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border ${accent.badge}`}
          >
            {statusLabel(server.status)}
          </span>
        </div>

        {server.status === "MAINTENANCE" && server.maintenanceReason ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            <strong className="text-amber-100">Powód maintenance:</strong>{" "}
            {server.maintenanceReason}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Stat
            icon={<Cpu className="h-3 w-3" />}
            label="CPU"
            value={server.totalCpuCores ? `${server.totalCpuCores} rdzeni` : "—"}
          />
          <Stat
            icon={<MemoryStick className="h-3 w-3" />}
            label="RAM"
            value={server.totalMemoryMb ? `${formatMb(server.totalMemoryMb)}` : "—"}
            barPct={ramAlloc}
          />
          <Stat
            icon={<HardDrive className="h-3 w-3" />}
            label="Dysk"
            value={server.totalDiskMb ? formatMb(server.totalDiskMb) : "—"}
          />
          <Stat
            icon={<Clock className="h-3 w-3" />}
            label="Heartbeat"
            value={formatRelative(server.lastHeartbeatAt)}
          />
        </div>

        <div className="border-t border-white/10 pt-4 flex justify-between items-center text-xs">
          <span className="text-muted-foreground">
            {server._count?.accounts ?? 0} kont na serwerze
          </span>
          <span className="text-indigo-400 group-hover:underline">Szczegóły →</span>
        </div>
      </div>
    </Link>
  );
}

function Stat({
  icon,
  label,
  value,
  barPct,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  barPct?: number;
}) {
  return (
    <div className="bg-white/5 border border-white/5 rounded-xl p-3">
      <p className="text-xs text-muted-foreground flex items-center gap-2">
        {icon} {label}
      </p>
      <p className="text-sm font-medium text-white mt-1 truncate">{value}</p>
      {typeof barPct === "number" && (
        <div className="h-1 w-full bg-white/10 rounded-full mt-2">
          <div
            className="h-full bg-emerald-500 rounded-full"
            style={{ width: `${barPct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function statusLabel(status: ServerStatus): string {
  switch (status) {
    case "INIT":
      return "Inicjalizacja";
    case "PENDING_APPROVAL":
      return "Czeka na akceptację";
    case "ACTIVE":
      return "Aktywny";
    case "MAINTENANCE":
      return "Konserwacja";
    case "OFFLINE":
      return "Offline";
    case "DEPROVISIONING":
      return "Wycofywany";
  }
}

function statusAccent(status: ServerStatus) {
  switch (status) {
    case "ACTIVE":
      return {
        gradient: "from-emerald-500/40 to-teal-600/40",
        bg: "bg-emerald-500/20 border border-emerald-500/30",
        text: "text-emerald-400",
        badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      };
    case "PENDING_APPROVAL":
      return {
        gradient: "from-amber-500/40 to-orange-600/40",
        bg: "bg-amber-500/20 border border-amber-500/30",
        text: "text-amber-400",
        badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      };
    case "INIT":
      return {
        gradient: "from-indigo-500/40 to-violet-600/40",
        bg: "bg-indigo-500/20 border border-indigo-500/30",
        text: "text-indigo-400",
        badge: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
      };
    case "MAINTENANCE":
      return {
        gradient: "from-sky-500/40 to-blue-600/40",
        bg: "bg-sky-500/20 border border-sky-500/30",
        text: "text-sky-400",
        badge: "border-sky-500/30 bg-sky-500/10 text-sky-300",
      };
    case "OFFLINE":
    case "DEPROVISIONING":
      return {
        gradient: "from-rose-500/40 to-red-600/40",
        bg: "bg-rose-500/20 border border-rose-500/30",
        text: "text-rose-400",
        badge: "border-rose-500/30 bg-rose-500/10 text-rose-300",
      };
  }
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "brak";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "przed chwilą";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min temu`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h temu`;
  return `${Math.floor(ms / 86_400_000)} dni temu`;
}
