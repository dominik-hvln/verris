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

/** N-11 — ogłoszenia i prace serwisowe dla zalogowanego klienta. */
export interface UserNotices {
  announcements: Array<{ id: string; kind: string; title: string; bodyMarkdown: string; publishedAt: string }>;
  maintenance: Array<{
    id: string;
    title: string;
    publicMessage: string | null;
    status: string;
    scheduledStart: string;
    scheduledEnd: string;
    serverName: string | null;
  }>;
}

export async function fetchMyNotices(): Promise<UserNotices> {
  try {
    return await apiFetch<UserNotices>("/me/status/notices");
  } catch {
    return { announcements: [], maintenance: [] };
  }
}
