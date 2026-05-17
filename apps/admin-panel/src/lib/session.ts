import { redirect } from "next/navigation";
import { adminApi } from "./api";
import { getAdminAuthToken } from "./auth";

export interface AdminSession {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "ADMIN" | "STAFF" | "USER";
}

/**
 * Reads the current admin session. Returns null when not authenticated or
 * when the JWT identifies a non-admin account.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const token = await getAdminAuthToken();
  if (!token) return null;
  try {
    const profile = await adminApi<AdminSession>("/users/me");
    if (profile.role !== "ADMIN") {
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
 * when the visitor is not authenticated as admin.
 */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
