import Link from "next/link";
import { ArrowLeft, AlertCircle, Cpu, MemoryStick, HardDrive, Gauge, Ban } from "lucide-react";
import type { ServerSummaryDto } from "@verris/contracts";
import { fetchServers } from "../actions";

export const dynamic = "force-dynamic";

/**
 * OPS-2 — Dashboard pojemności floty. Jeden widok: per-węzeł wolne zasoby,
 * obłożenie kont vs limit, status cordon/headroom + sumy floty i heurystyka
 * „ile jeszcze kont się zmieści". Zasilane z /admin/servers (bez nowego API).
 */
export default async function FleetCapacityPage() {
  const { data: servers, error } = await fetchServers();

  // Tylko węzły hostujące (mają zaraportowaną pojemność).
  const nodes = servers.filter(
    (s) =>
      (s.status === "ACTIVE" || s.status === "MAINTENANCE") &&
      (s.totalCpuCores ?? 0) > 0 &&
      (s.totalMemoryMb ?? 0) > 0 &&
      (s.totalDiskMb ?? 0) > 0,
  );

  const totals = nodes.reduce(
    (acc, s) => {
      const totalCpu = (s.totalCpuCores ?? 0) * 100;
      acc.cpuTotal += totalCpu;
      acc.cpuUsed += s.allocatedCpu;
      acc.ramTotal += s.totalMemoryMb ?? 0;
      acc.ramUsed += s.allocatedMemory;
      acc.diskTotal += s.totalDiskMb ?? 0;
      acc.diskUsed += s.allocatedDisk;
      acc.accounts += s._count?.accounts ?? 0;
      return acc;
    },
    { cpuTotal: 0, cpuUsed: 0, ramTotal: 0, ramUsed: 0, diskTotal: 0, diskUsed: 0, accounts: 0 },
  );

  // Heurystyka „wolnych slotów": średni footprint konta z całej floty rzutowany
  // na wolne zasoby (limitujący wymiar). Wymaga >0 kont, by mieć średnią.
  const avgRamPerAcct = totals.accounts > 0 ? totals.ramUsed / totals.accounts : 0;
  const avgDiskPerAcct = totals.accounts > 0 ? totals.diskUsed / totals.accounts : 0;
  const freeRam = Math.max(totals.ramTotal - totals.ramUsed, 0);
  const freeDisk = Math.max(totals.diskTotal - totals.diskUsed, 0);
  const freeSlots =
    totals.accounts > 0 && avgRamPerAcct > 0 && avgDiskPerAcct > 0
      ? Math.floor(Math.min(freeRam / avgRamPerAcct, freeDisk / avgDiskPerAcct))
      : null;

  const cordoned = nodes.filter((s) => !s.acceptsNewAccounts).length;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <Link href="/nodes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Węzły &amp; serwery
        </Link>
      </div>

      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-white">
          <Gauge className="h-7 w-7 text-sky-300" /> Pojemność floty
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Obłożenie zasobów i kont na węzłach hostujących. Alokacja to suma limitów bazowych planów
          (bez burstu autoskalowania) — kolory ostrzegają przed zapełnieniem.
        </p>
      </header>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" /> Nie udało się pobrać floty: {error}
        </div>
      )}

      {/* Sumy floty */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <FleetStat icon={<Cpu className="h-4 w-4" />} label="CPU floty" pct={pct(totals.cpuUsed, totals.cpuTotal)} sub={`${nodes.length} węzłów`} />
        <FleetStat icon={<MemoryStick className="h-4 w-4" />} label="RAM floty" pct={pct(totals.ramUsed, totals.ramTotal)} sub={`${formatMb(freeRam)} wolne`} />
        <FleetStat icon={<HardDrive className="h-4 w-4" />} label="Dysk floty" pct={pct(totals.diskUsed, totals.diskTotal)} sub={`${formatMb(freeDisk)} wolne`} />
        <div className="rounded-xl border border-white/5 bg-black/30 backdrop-blur-md p-4">
          <p className="text-xs text-muted-foreground">Konta na flocie</p>
          <p className="mt-1 text-2xl font-semibold text-white">{totals.accounts}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {freeSlots != null ? `~${freeSlots} jeszcze się zmieści` : "brak danych do estymacji"}
          </p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/30 backdrop-blur-md p-4">
          <p className="text-xs text-muted-foreground">Cordon (wstrzymane)</p>
          <p className={`mt-1 text-2xl font-semibold ${cordoned > 0 ? "text-amber-300" : "text-white"}`}>{cordoned}</p>
          <p className="text-xs text-muted-foreground mt-1">z {nodes.length} hostujących</p>
        </div>
      </section>

      {nodes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-10 text-center text-sm text-muted-foreground">
          Brak węzłów hostujących z zaraportowaną pojemnością.
        </div>
      ) : (
        <section className="space-y-3">
          {nodes.map((s) => (
            <NodeRow key={s.id} server={s} />
          ))}
        </section>
      )}
    </div>
  );
}

function NodeRow({ server: s }: { server: ServerSummaryDto }) {
  const totalCpu = (s.totalCpuCores ?? 0) * 100;
  const cpu = pct(s.allocatedCpu, totalCpu);
  const ram = pct(s.allocatedMemory, s.totalMemoryMb ?? 0);
  const disk = pct(s.allocatedDisk, s.totalDiskMb ?? 0);
  const accounts = s._count?.accounts ?? 0;
  const headroom = s.reservedHeadroomPercent ?? 0;

  return (
    <Link
      href={`/nodes/${s.id}#hosting-profile`}
      className="block rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 transition-colors hover:border-white/20"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-white">{s.name ?? "(bez nazwy)"}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {s.ipAddress}
            {s.region ? ` • ${s.region}` : ""} • {s.status}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!s.acceptsNewAccounts ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
              <Ban className="h-3 w-3" /> cordon
            </span>
          ) : null}
          {headroom > 0 ? (
            <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-300">
              rezerwa {headroom}%
            </span>
          ) : null}
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-neutral-300">
            {accounts}
            {s.maxAccounts != null ? ` / ${s.maxAccounts}` : ""} kont
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Bar label="CPU" pct={cpu} detail={`${Math.round(s.allocatedCpu)} / ${totalCpu}%`} />
        <Bar label="RAM" pct={ram} detail={`${formatMb(s.allocatedMemory)} / ${formatMb(s.totalMemoryMb ?? 0)}`} />
        <Bar label="Dysk" pct={disk} detail={`${formatMb(s.allocatedDisk)} / ${formatMb(s.totalDiskMb ?? 0)}`} />
      </div>
    </Link>
  );
}

function Bar({ label, pct: value, detail }: { label: string; pct: number; detail: string }) {
  const tone = toneFor(value);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={tone.text}>{value}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${tone.bg}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-neutral-500">{detail}</p>
    </div>
  );
}

function FleetStat({
  icon,
  label,
  pct: value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  pct: number;
  sub: string;
}) {
  const tone = toneFor(value);
  return (
    <div className="rounded-xl border border-white/5 bg-black/30 backdrop-blur-md p-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone.text}`}>{value}%</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${tone.bg}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-neutral-500">{sub}</p>
    </div>
  );
}

function pct(used: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

function toneFor(value: number): { text: string; bg: string } {
  if (value >= 90) return { text: "text-rose-300", bg: "bg-rose-500" };
  if (value >= 75) return { text: "text-amber-300", bg: "bg-amber-500" };
  return { text: "text-emerald-300", bg: "bg-emerald-500" };
}

function formatMb(mb: number): string {
  if (!mb) return "0 MB";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}
