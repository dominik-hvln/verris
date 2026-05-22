import { cookies } from "next/headers";
import { panelAuthCookieOptions } from "./auth-cookie";

/** Oddzielnie od cookie panelu admina i klienta — osobny origin (port/pod domenę). */
export const STAFF_AUTH_COOKIE = "staff_auth_token";

export async function setStaffAuthCookie(token: string) {
  const store = await cookies();
  store.set(STAFF_AUTH_COOKIE, token, panelAuthCookieOptions());
}

export async function removeStaffAuthCookie() {
  const store = await cookies();
  store.delete(STAFF_AUTH_COOKIE);
}

export async function getStaffAuthToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(STAFF_AUTH_COOKIE)?.value;
}
