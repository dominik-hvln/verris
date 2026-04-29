import { getStaffAuthToken } from "./staff-auth-cookie";

export const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export class StaffApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  cache?: RequestCache;
}

export async function staffApi<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const token = await getStaffAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: opts.cache ?? "no-store",
  });

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    payload = undefined;
  }

  if (!res.ok) {
    const msg = extractError(payload) ?? `Request failed (${res.status})`;
    throw new StaffApiError(msg, res.status, payload);
  }
  return payload as T;
}

/** POST z `FormData` (multipart) — nie ustawiaj `Content-Type` (boundary). */
export async function staffApiMultipart(path: string, formData: FormData): Promise<unknown> {
  const token = await getStaffAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: formData,
    cache: "no-store",
  });

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    payload = undefined;
  }

  if (!res.ok) {
    const msg = extractError(payload) ?? `Request failed (${res.status})`;
    throw new StaffApiError(msg, res.status, payload);
  }
  return payload;
}

function extractError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const m = (payload as { message?: string | string[] }).message;
  if (Array.isArray(m)) return m.join(", ");
  if (typeof m === "string") return m;
  return null;
}
