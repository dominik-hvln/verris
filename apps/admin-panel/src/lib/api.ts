import { getAdminAuthToken } from "./auth";
import { headers as incomingHeaders } from "next/headers";

/** Nest API base URL — `API_URL` in `.env.local` only (server; no NEXT_PUBLIC_* — `adminApi` runs in server actions). */
export const API_URL = process.env.API_URL ?? "http://localhost:3000";

export class AdminApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
  cache?: RequestCache;
}

export async function adminApi<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const token = await getAdminAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Pre-LIVE: forward the real client IP (Caddy XFF) so API rate limits,
  // lockouts and audit logs see the user, not the panel container.
  try {
    const incoming = await incomingHeaders();
    const xff = incoming.get("x-forwarded-for");
    if (xff) headers["x-forwarded-for"] = xff;
  } catch {
    /* outside request scope — skip */
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: opts.cache ?? "no-store",
  });

  let payload: unknown = undefined;
  try {
    payload = await res.json();
  } catch {
    payload = undefined;
  }

  if (!res.ok) {
    const errorMessage = extractErrorMessage(payload) ?? `Request failed with ${res.status}`;
    throw new AdminApiError(errorMessage, res.status, payload);
  }

  return payload as T;
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const maybe = payload as { message?: string | string[] };
  if (Array.isArray(maybe.message)) return maybe.message.join(", ");
  if (typeof maybe.message === "string") return maybe.message;
  return null;
}
