import type { ServerSummary } from "../actions";

/** Usługi platformy dla sond bez węzła — klucze jak USLUGI_PLATFORMY w apps/api/src/status/status-historia.ts. */
export const GRUPY_PLATFORMY: Record<string, string> = {
  panel: "Panel klienta",
  www: "Strona verris.pl",
  api: "API",
};

/** Gdzie działa sonda: nazwa węzła albo „Platforma · <usługa>” dla sondy bez węzła. */
export function miejsceSondy(
  probe: { serverId: string | null; grupa?: string | null },
  servers: ServerSummary[],
): string {
  if (!probe.serverId) return `Platforma · ${GRUPY_PLATFORMY[probe.grupa ?? ""] ?? "bez grupy"}`;
  return servers.find((s) => s.id === probe.serverId)?.name ?? probe.serverId.slice(0, 8);
}
