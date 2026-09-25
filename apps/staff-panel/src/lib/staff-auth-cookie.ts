import { cookies } from "next/headers";
import { panelAuthCookieOptions, staraDomenaCiasteczka } from "./auth-cookie";

/** Oddzielnie od cookie panelu admina i klienta — osobny origin (port/pod domenę). */
export const STAFF_AUTH_COOKIE = "staff_session";
/** Nazwa sprzed 2026-09-25 (ciasteczko na całej domenie) — tylko do skasowania. */
const STARE_CIASTECZKO = "staff_auth_token";

function skasujStare(store: Awaited<ReturnType<typeof cookies>>) {
  const domena = staraDomenaCiasteczka();
  store.set(STARE_CIASTECZKO, "", { path: "/", maxAge: 0, ...(domena ? { domain: domena } : {}) });
}

export async function setStaffAuthCookie(token: string) {
  const store = await cookies();
  store.set(STAFF_AUTH_COOKIE, token, panelAuthCookieOptions());
  skasujStare(store);
}

export async function removeStaffAuthCookie() {
  const store = await cookies();
  store.delete(STAFF_AUTH_COOKIE);
  skasujStare(store);
}

export async function getStaffAuthToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(STAFF_AUTH_COOKIE)?.value;
}
