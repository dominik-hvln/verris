import { cookies } from "next/headers";
import { panelAuthCookieOptions } from "./auth-cookie";

export const ADMIN_COOKIE_NAME = "admin_auth_token";

export async function setAdminAuthCookie(token: string) {
  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, token, panelAuthCookieOptions());
}

export async function removeAdminAuthCookie() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
}

export async function getAdminAuthToken() {
  const store = await cookies();
  return store.get(ADMIN_COOKIE_NAME)?.value;
}
