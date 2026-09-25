"use server";

import { API_URL } from "@/lib/staff-api";
import { setStaffAuthCookie } from "@/lib/staff-auth-cookie";

/** Passkey (WebAuthn) dla panelu staff — token przychodzi z przeglądarki, rolę STAFF/ADMIN sprawdza serwer (API /users/me). */
export async function setStaffPasskeyAuthCookie(accessToken: string): Promise<boolean> {
  if (typeof accessToken !== "string" || !accessToken) return false;
  const res = await fetch(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  }).catch(() => null);
  const me = res?.ok ? ((await res.json().catch(() => null)) as { role?: string } | null) : null;
  if (me?.role !== "STAFF" && me?.role !== "ADMIN") return false;
  await setStaffAuthCookie(accessToken);
  return true;
}
