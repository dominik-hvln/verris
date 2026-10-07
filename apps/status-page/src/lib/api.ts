export type ServiceState = 'OK' | 'DEGRADED' | 'DOWN';
export type DayState = ServiceState | 'NO_DATA';

export interface DayDto {
  /** 'YYYY-MM-DD', dzień czasu polskiego. */
  date: string;
  state: DayState;
  /** Dostępność dnia w %, obcięta do 2 miejsc; null = brak próbek. */
  uptimePct: number | null;
  avgLatencyMs: number | null;
}

export interface HourDto {
  /** ISO początku godziny (UTC). */
  hour: string;
  avgLatencyMs: number | null;
}

export interface PublicServiceDto {
  key: string;
  name: string;
  state: ServiceState;
  uptime90Pct: number | null;
  /** Średni czas odpowiedzi z ostatnich 24 h. */
  avgLatencyMs: number | null;
  /** 90 dni, rosnąco — ostatni element to dziś. */
  days: DayDto[];
  /** 24 godziny, rosnąco. */
  latency24h: HourDto[];
}

export interface PublicIncidentDto {
  id: string;
  service: string;
  severity: 'MINOR' | 'MAJOR';
  status: 'OPEN' | 'RESOLVED';
  title: string;
  publicMessage: string | null;
  startedAt: string;
  resolvedAt: string | null;
  durationMinutes: number | null;
}

export interface PublicMaintenanceDto {
  id: string;
  title: string;
  publicMessage: string | null;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
}

export interface PublicStatusDto {
  generatedAt: string;
  overall: ServiceState;
  availability: { h24: number | null; d7: number | null; d30: number | null; d90: number | null };
  services: PublicServiceDto[];
  activeIncidents: PublicIncidentDto[];
  recentIncidents: PublicIncidentDto[];
  maintenance: PublicMaintenanceDto[];
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
