"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export type ProbeKind =
  | "HTTP"
  | "HTTPS"
  | "SMTP"
  | "IMAP"
  | "POP3"
  | "MYSQL"
  | "SSH"
  | "DA_API"
  | "DNS";

export type ProbeSeverity = "MINOR" | "MAJOR";

export type IncidentStatus = "OPEN" | "RESOLVED";

export interface ProbeDto {
  id: string;
  serverId: string;
  kind: ProbeKind;
  target: string;
  label: string | null;
  severity: ProbeSeverity;
  declaredSlaPct: string;
  isEnabled: boolean;
  isPublic: boolean;
  consecutiveFailures: number;
  lastSampleAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  createdAt: string;
}

export interface IncidentDto {
  id: string;
  probeId: string;
  severity: ProbeSeverity;
  status: IncidentStatus;
  title: string;
  publicMessage: string | null;
  startedAt: string;
  resolvedAt: string | null;
  probe: {
    id: string;
    kind: ProbeKind;
    target: string;
    serverId: string;
    server: { id: string; name: string | null };
  };
}

export interface IncidentListDto {
  rows: IncidentDto[];
  total: number;
}

export interface ServerSummary {
  id: string;
  name: string | null;
  region: string | null;
}

export interface CreateProbeInput {
  serverId: string;
  kind: ProbeKind;
  target: string;
  label?: string;
  severity?: ProbeSeverity;
  declaredSlaPct?: number;
  isEnabled?: boolean;
  isPublic?: boolean;
}

export interface UpdateProbeInput {
  target?: string;
  label?: string | null;
  severity?: ProbeSeverity;
  declaredSlaPct?: number;
  isEnabled?: boolean;
  isPublic?: boolean;
}

export interface UpdateIncidentInput {
  title?: string;
  publicMessage?: string | null;
}

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function listProbes(serverId?: string): Promise<ActionResult<ProbeDto[]>> {
  try {
    const qs = serverId ? `?serverId=${encodeURIComponent(serverId)}` : "";
    const data = await adminApi<ProbeDto[]>(`/admin/status/probes${qs}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function listServersForProbes(): Promise<ActionResult<ServerSummary[]>> {
  try {
    const data = await adminApi<ServerSummary[]>("/admin/servers");
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function createProbe(
  input: CreateProbeInput,
): Promise<ActionResult<ProbeDto>> {
  try {
    const data = await adminApi<ProbeDto>("/admin/status/probes", {
      method: "POST",
      body: input,
    });
    revalidatePath("/status/probes");
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function updateProbe(
  id: string,
  input: UpdateProbeInput,
): Promise<ActionResult<ProbeDto>> {
  try {
    const data = await adminApi<ProbeDto>(`/admin/status/probes/${id}`, {
      method: "PATCH",
      body: input,
    });
    revalidatePath("/status/probes");
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deleteProbe(id: string): Promise<ActionResult> {
  try {
    await adminApi(`/admin/status/probes/${id}`, { method: "DELETE" });
    revalidatePath("/status/probes");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function listIncidents(
  filters: { status?: IncidentStatus; serverId?: string; limit?: number; offset?: number } = {},
): Promise<ActionResult<IncidentListDto>> {
  try {
    const qs = new URLSearchParams();
    if (filters.status) qs.set("status", filters.status);
    if (filters.serverId) qs.set("serverId", filters.serverId);
    if (filters.limit) qs.set("limit", String(filters.limit));
    if (filters.offset) qs.set("offset", String(filters.offset));
    const path = qs.toString().length
      ? `/admin/status/incidents?${qs.toString()}`
      : "/admin/status/incidents";
    const data = await adminApi<IncidentListDto>(path);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function updateIncident(
  id: string,
  input: UpdateIncidentInput,
): Promise<ActionResult<IncidentDto>> {
  try {
    const data = await adminApi<IncidentDto>(`/admin/status/incidents/${id}`, {
      method: "PATCH",
      body: input,
    });
    revalidatePath("/status/incidents");
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
