"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthToken } from "@/lib/auth";

const API_URL = process.env.API_URL || "http://localhost:3000";
const ADMIN_PANEL_URL =
  process.env.ADMIN_PANEL_URL || "http://localhost:3003";
const STAFF_PANEL_URL =
  process.env.STAFF_PANEL_URL || "http://localhost:3002";

export interface ImpersonationContext {
  isImpersonating: boolean;
  /** Admin/staff user ID that initiated the impersonation. */
  actorUserId: string | null;
  /** Best-effort token expiry, ISO string. */
  expiresAt: string | null;
}

/**
 * Decodes the JWT payload (without verifying — the API does that on every
 * request). We only use the claims for UI hints, so this is safe.
 */
export async function getImpersonationContext(): Promise<ImpersonationContext> {
  const token = await getAuthToken();
  if (!token) {
    return { isImpersonating: false, actorUserId: null, expiresAt: null };
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { isImpersonating: false, actorUserId: null, expiresAt: null };
  }
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    ) as { impersonatedBy?: string; exp?: number };
    if (!payload.impersonatedBy) {
      return { isImpersonating: false, actorUserId: null, expiresAt: null };
    }
    return {
      isImpersonating: true,
      actorUserId: payload.impersonatedBy,
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
    };
  } catch {
    return { isImpersonating: false, actorUserId: null, expiresAt: null };
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
      await fetch(`${API_URL}/admin/users/impersonate/stop`, {
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
    redirect(`${STAFF_PANEL_URL}/crm`);
  }
  redirect(`${ADMIN_PANEL_URL}/customers`);
}
