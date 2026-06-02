import type { ServerStatus, ServerSummaryDto } from "@verris/contracts";
import { adminApi } from "@/lib/api";

type Tone = "emerald" | "amber" | "rose" | "zinc";

const TONE_CLASS: Record<Tone, string> = {
  emerald:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]",
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  rose: "border-rose-500/20 bg-rose-500/10 text-rose-300",
  zinc: "border-white/10 bg-white/5 text-muted-foreground",
};

const DOT_CLASS: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-400",
  rose: "bg-rose-500",
  zinc: "bg-zinc-400",
};

/**
 * Live fleet status pill for the dashboard header. Reads the real server list
 * so the badge never claims "all operational" when a node is offline or
 * awaiting approval. Degrades to a neutral state if the API is unreachable.
 */
export async function FleetStatusBadge() {
  let servers: ServerSummaryDto[] = [];
  let unavailable = false;
  try {
    servers = await adminApi<ServerSummaryDto[]>("/admin/servers");
  } catch {
    unavailable = true;
  }

  const { tone, label, pulse } = resolveFleetState(servers, unavailable);

  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      <span className="relative flex h-2 w-2">
        {pulse ? (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${DOT_CLASS[tone]}`}
          />
        ) : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${DOT_CLASS[tone]}`} />
      </span>
      {label}
    </div>
  );
}

function resolveFleetState(
  servers: ServerSummaryDto[],
  unavailable: boolean,
): { tone: Tone; label: string; pulse: boolean } {
  if (unavailable) {
    return { tone: "zinc", label: "Status floty niedostępny", pulse: false };
  }
  if (servers.length === 0) {
    return { tone: "zinc", label: "Brak węzłów", pulse: false };
  }

  const counts = servers.reduce<Record<ServerStatus, number>>(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    { INIT: 0, PENDING_APPROVAL: 0, ACTIVE: 0, MAINTENANCE: 0, OFFLINE: 0, DEPROVISIONING: 0 },
  );

  const total = servers.length;
  if (counts.OFFLINE > 0) {
    return {
      tone: "rose",
      label: counts.OFFLINE === 1 ? "1 węzeł offline" : `${counts.OFFLINE} węzły offline`,
      pulse: true,
    };
  }
  if (counts.ACTIVE === total) {
    return { tone: "emerald", label: "Wszystkie węzły operacyjne", pulse: true };
  }
  return {
    tone: "amber",
    label: `${counts.ACTIVE}/${total} węzłów aktywnych`,
    pulse: false,
  };
}
