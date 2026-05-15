export type ProbeKind =
  | 'HTTP'
  | 'HTTPS'
  | 'SMTP'
  | 'IMAP'
  | 'POP3'
  | 'MYSQL'
  | 'SSH'
  | 'DA_API'
  | 'DNS';

export type ServiceState = 'OK' | 'DEGRADED' | 'DOWN';

export interface ProbeStatusDto {
  id: string;
  kind: ProbeKind;
  target: string;
  label: string | null;
  severity: 'MINOR' | 'MAJOR';
  state: ServiceState;
  lastSampleAt: string | null;
  declaredSlaPct: string;
  computedUptimePct: string;
  computedWindowDays: number;
  avgLatencyMs: number | null;
}

export interface ServerStatusDto {
  id: string;
  name: string;
  region: string | null;
  status: string;
  state: ServiceState;
  probes: ProbeStatusDto[];
}

export interface PublicIncidentDto {
  id: string;
  serverId: string;
  serverName: string;
  probeKind: ProbeKind;
  probeTarget: string;
  severity: 'MINOR' | 'MAJOR';
  status: 'OPEN' | 'RESOLVED';
  title: string;
  publicMessage: string | null;
  startedAt: string;
  resolvedAt: string | null;
  durationMinutes: number | null;
}

export interface PublicStatusDto {
  generatedAt: string;
  overall: ServiceState;
  servers: ServerStatusDto[];
  activeIncidents: PublicIncidentDto[];
  recentIncidents: PublicIncidentDto[];
}

const API_URL =
  process.env.VERRIS_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function fetchPublicStatus(): Promise<PublicStatusDto> {
  const res = await fetch(`${API_URL}/status`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    throw new Error(`status fetch failed: ${res.status}`);
  }
  return (await res.json()) as PublicStatusDto;
}
