import { cookies } from "next/headers";
import { panelAuthCookieOptions, staraDomenaCiasteczka } from "./auth-cookie";

export const ADMIN_COOKIE_NAME = "admin_session";
/** Nazwa sprzed 2026-09-25 (ciasteczko na całej domenie) — tylko do skasowania. */
const STARE_CIASTECZKO = "admin_auth_token";

function skasujStare(store: Awaited<ReturnType<typeof cookies>>) {
  const domena = staraDomenaCiasteczka();
  store.set(STARE_CIASTECZKO, "", { path: "/", maxAge: 0, ...(domena ? { domain: domena } : {}) });
}

export async function setAdminAuthCookie(token: string) {
  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, token, panelAuthCookieOptions());
  skasujStare(store);
}

export async function removeAdminAuthCookie() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
  skasujStare(store);
}

export async function getAdminAuthToken() {
  const store = await cookies();
  return store.get(ADMIN_COOKIE_NAME)?.value;
}
