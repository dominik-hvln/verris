import { redirect } from "next/navigation";
import { adminApi } from "./api";
import { getAdminAuthToken } from "./auth";
import { rolaPaneluOperatora } from "./rola-operatora";

export interface AdminSession {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "ADMIN" | "STAFF" | "USER";
}

/**
 * Reads the current operator session. Returns null when not authenticated or when the JWT identifies
 * a customer account (USER) — klient nie wchodzi do panelu operatora.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const token = await getAdminAuthToken();
  if (!token) return null;
  try {
    const profile = await adminApi<AdminSession>("/users/me");
    if (!rolaPaneluOperatora(profile.role)) {
      return null;
    }
    return profile;
  } catch {
    // Cookie writes are only allowed in Server Actions / Route Handlers (see staff-panel).
    return null;
  }
}

/**
 * Convenience helper for protected server components: redirects to /login
 * when the visitor is not authenticated as an operator (ADMIN/STAFF).
 */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
