"use server";

import { apiFetch, ApiError } from "@/lib/api";

export interface UserIncident {
  serverId: string;
  serverName: string;
  probeKind: string;
  probeTarget: string;
  severity: "MINOR" | "MAJOR";
  title: string;
  startedAt: string;
}

export async function fetchMyIncidents(): Promise<UserIncident[]> {
  try {
    const incidents = await apiFetch<UserIncident[]>("/me/status/incidents");
    return incidents;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return [];
    return [];
  }
}
