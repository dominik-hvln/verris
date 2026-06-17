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

export async function getAdminPasskeyLoginOptions(): Promise<
  { ok: true; options: unknown } | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${API_URL}/auth/webauthn/login/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: extractMsg(body) ?? `HTTP ${res.status}` };
    return { ok: true, options: body };
  } catch {
    return { ok: false, error: "Błąd połączenia z API." };
  }
}

export async function verifyAdminPasskeyLogin(
  response: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_URL}/auth/webauthn/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as {
      access_token?: string;
      user?: { role?: string };
    } | null;
    if (!res.ok || !body?.access_token) {
      return { ok: false, error: extractMsg(body) ?? "Logowanie passkey nie powiodło się." };
    }
    if (body.user?.role !== "ADMIN") {
      return { ok: false, error: "To konto nie ma uprawnień administratora Verris Core." };
    }
    await setAdminAuthCookie(body.access_token);
    return { ok: true };
  } catch {
    return { ok: false, error: "Błąd połączenia z API." };
  }
}

function extractMsg(body: unknown): string | null {
  if (body && typeof body === "object" && "message" in body) {
    const m = (body as { message?: unknown }).message;
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m.join(", ");
  }
  return null;
}
