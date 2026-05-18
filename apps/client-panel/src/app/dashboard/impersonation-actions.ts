"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthToken } from "@/lib/auth";

export interface ImpersonationContext {
  isImpersonating: boolean;
  /** Admin/staff user ID that initiated the impersonation. */
  actorUserId: string | null;
  /** Best-effort token expiry, ISO string. */
  expiresAt: string | null;
  /** ISO start timestamp from JWT (Sprint 6). */
  startedAt: string | null;
  /** Powód podany przez operatora przy starcie sesji. */
  reason: string | null;
  /** Skąd przyszedł operator — UI używa do sensownego return URL. */
  origin: "admin" | "staff" | null;
}

/**
 * Decodes the JWT payload (without verifying — the API does that on every
 * request). We only use the claims for UI hints, so this is safe.
 */
export async function getImpersonationContext(): Promise<ImpersonationContext> {
  const empty: ImpersonationContext = {
    isImpersonating: false,
    actorUserId: null,
    expiresAt: null,
    startedAt: null,
    reason: null,
    origin: null,
  };
  const token = await getAuthToken();
  if (!token) return empty;
  const parts = token.split(".");
  if (parts.length !== 3) return empty;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    ) as {
      impersonatedBy?: string;
      exp?: number;
      impersonationStartedAt?: number;
      impersonationReason?: string;
    };
    if (!payload.impersonatedBy) return empty;
    const store = await cookies();
    const operator = store.get("impersonation_operator")?.value;
    const origin = operator === "staff" ? "staff" : operator === "admin" ? "admin" : null;
    return {
      isImpersonating: true,
      actorUserId: payload.impersonatedBy,
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
      startedAt: payload.impersonationStartedAt
        ? new Date(payload.impersonationStartedAt * 1000).toISOString()
        : null,
      reason: payload.impersonationReason ?? null,
      origin,
    };
  } catch {
    return empty;
  }
}

/**
 * Records an "impersonation stopped" audit event server-side, drops the
 * impersonation cookie, and bounces the operator back to the admin panel.
 */
export async function stopImpersonationAction(): Promise<never> {
  const token = await getAuthToken();
  if (token) {
    try {
      await fetch(`${apiUrl()}/admin/users/impersonate/stop`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
    } catch {
      /* ignore — best effort audit */
    }
  }
  const store = await cookies();
  const operator = store.get("impersonation_operator")?.value;
  store.delete("auth_token");
  store.delete("impersonation_operator");

  if (operator === "staff") {
    redirect(new URL("/crm", panelUrl("STAFF_PANEL_URL", 3002)).toString());
  }
  redirect(new URL("/customers", panelUrl("ADMIN_PANEL_URL", 3003)).toString());
}

function apiUrl(): string {
  const value = process.env.API_URL?.trim();
  if (value) return value.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") return localUrl(3000);
  throw new Error("API_URL is required for production impersonation stop.");
}

function panelUrl(envName: string, devPort: number): string {
  const value = process.env[envName]?.trim();
  if (value) return value.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") return localUrl(devPort);
  throw new Error(`${envName} is required for production redirects.`);
}

function localUrl(port: number): string {
  return `http://${"localhost"}:${port}`;
}
