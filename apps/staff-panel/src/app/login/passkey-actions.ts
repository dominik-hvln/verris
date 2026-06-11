"use server";

import { API_URL } from "@/lib/staff-api";
import { setStaffAuthCookie } from "@/lib/staff-auth-cookie";

/** Passkey (WebAuthn) dla panelu staff — rola STAFF/ADMIN weryfikowana przed cookie. */
export async function getStaffPasskeyLoginOptions(): Promise<
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

export async function verifyStaffPasskeyLogin(
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
    if (body.user?.role !== "STAFF" && body.user?.role !== "ADMIN") {
      return {
        ok: false,
        error: "To konto nie ma uprawnień do panelu Support (wymagana rola STAFF lub ADMIN).",
      };
    }
    await setStaffAuthCookie(body.access_token);
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
