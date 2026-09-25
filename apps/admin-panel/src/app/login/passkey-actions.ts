"use server";

import { API_URL } from "@/lib/api";
import { setAdminAuthCookie } from "@/lib/auth";

/**
 * Passkey (WebAuthn) dla panelu admina. Logowanie passkey jest MFA odporne na
 * phishing — przechodzi wymóg REQUIRE_2FA_FOR_STAFF z definicji (silniejsze niż
 * hasło+TOTP). Rola weryfikowana PRZED zapisem cookie (jak w adminLogin).
 */
/** Czy serwer ma skonfigurowane passkey (RP). Gdy false — chowamy przycisk. */
export async function getAdminPasskeyAvailability(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/webauthn/status`, { cache: "no-store" });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { available?: boolean } | null;
    return body?.available === true;
  } catch {
    return false;
  }
}

/** Token przychodzi z przeglądarki — rolę sprawdza serwer (API /users/me), nie tylko klient. */
export async function setAdminPasskeyAuthCookie(accessToken: string): Promise<boolean> {
  if (typeof accessToken !== "string" || !accessToken) return false;
  const res = await fetch(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  }).catch(() => null);
  const me = res?.ok ? ((await res.json().catch(() => null)) as { role?: string } | null) : null;
  if (me?.role !== "ADMIN") return false;
  await setAdminAuthCookie(accessToken);
  return true;
}
