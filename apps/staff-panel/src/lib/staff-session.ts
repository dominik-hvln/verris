import { redirect } from "next/navigation";
import { staffApi } from "./staff-api";

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
  } catch {
    // Do not call cookies().delete() here — Next.js only allows cookie writes in
    // Server Actions / Route Handlers. Stale tokens are cleared on login/logout.
    return null;
  }
}

export async function requireStaffSession(): Promise<StaffProfile> {
  const s = await getStaffSession();
  if (!s) redirect("/login");
  return s;
}
