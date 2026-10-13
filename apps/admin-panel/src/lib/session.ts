import { redirect } from "next/navigation";
import { adminApi, AdminApiError } from "./api";
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
  } catch (err) {
    // 14.10 (prod): każdy błąd /users/me — także chwilowy restart API przy deployu (502, brak połączenia) —
    // przekierowywał na /login, choć sesja była ważna; operator myślał, że go wylogowało. Brak sesji to tylko
    // 401/403; reszta idzie do granicy błędu („Nie udało się wczytać tej strony”, odśwież za chwilę).
    // Cookie writes are only allowed in Server Actions / Route Handlers (see staff-panel).
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) return null;
    throw err;
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
