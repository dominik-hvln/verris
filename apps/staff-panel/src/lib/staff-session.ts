import { redirect } from "next/navigation";
import { staffApi, StaffApiError } from "./staff-api";

export interface StaffProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "ADMIN" | "STAFF" | "USER";
  canAccessGrafana?: boolean;
}

export async function getStaffSession(): Promise<StaffProfile | null> {
  try {
    const me = await staffApi<StaffProfile>("/users/me");
    if (me.role !== "STAFF" && me.role !== "ADMIN") {
      return null;
    }
    return me;
  } catch (err) {
    // 14.10: brak sesji to tylko 401/403 — chwilowy błąd API (restart przy deployu) nie wyrzuca na /login.
    // Do not call cookies().delete() here — Next.js only allows cookie writes in
    // Server Actions / Route Handlers. Stale tokens are cleared on login/logout.
    if (err instanceof StaffApiError && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
}

export async function requireStaffSession(): Promise<StaffProfile> {
  const s = await getStaffSession();
  if (!s) redirect("/login");
  return s;
}

/**
 * Dla stron pod layoutem (który i tak wymaga sesji): brak sesji → /login, chwilowa awaria API → „awaria”, żeby
 * strona pokazała komunikat zamiast wywracać się (strażnik strony-przy-awarii-api.spec.tsx). Nigdy nie traktuje
 * awarii jak zalogowania — dane strona i tak pobiera z API, które samo sprawdza sesję.
 */
export async function sesjaLubAwaria(): Promise<StaffProfile | "awaria"> {
  let s: StaffProfile | null;
  try {
    s = await getStaffSession();
  } catch {
    return "awaria";
  }
  if (!s) redirect("/login");
  return s;
}
