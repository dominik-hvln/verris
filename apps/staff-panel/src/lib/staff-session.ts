import { redirect } from "next/navigation";
import { StaffApiError, staffApi } from "./staff-api";
import { removeStaffAuthCookie } from "./staff-auth-cookie";

export interface StaffProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "ADMIN" | "STAFF" | "USER";
}

export async function getStaffSession(): Promise<StaffProfile | null> {
  try {
    const me = await staffApi<StaffProfile>("/users/me");
    if (me.role !== "STAFF" && me.role !== "ADMIN") {
      await removeStaffAuthCookie();
      return null;
    }
    return me;
  } catch (err) {
    if (err instanceof StaffApiError && (err.status === 401 || err.status === 403)) {
      await removeStaffAuthCookie();
    }
    return null;
  }
}

export async function requireStaffSession(): Promise<StaffProfile> {
  const s = await getStaffSession();
  if (!s) redirect("/login");
  return s;
}
