"use server";

import { adminApi, AdminApiError } from "@/lib/api";

function err(e: unknown): string {
  return e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Błąd";
}

export interface BreakGlassStatus {
  remaining: number;
  generatedAt: string | null;
  lastUsedAt: string | null;
}

export async function fetchBreakGlassStatus() {
  try {
    return { data: await adminApi<BreakGlassStatus>("/auth/break-glass/status") };
  } catch (e) {
    return { error: err(e) };
  }
}

export async function regenerateBreakGlass(password: string, code: string) {
  try {
    const data = await adminApi<{ codes: string[] }>("/auth/break-glass/regenerate", {
      method: "POST",
      body: { password, code },
    });
    return { data };
  } catch (e) {
    return { error: err(e) };
  }
}

export interface PasskeyCredential {
  id: string;
  name: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listPasskeys() {
  try {
    return { data: await adminApi<PasskeyCredential[]>("/auth/webauthn/credentials") };
  } catch (e) {
    return { error: err(e) };
  }
}

export async function getPasskeyRegisterOptions() {
  try {
    return { data: await adminApi<unknown>("/auth/webauthn/register/options", { method: "POST" }) };
  } catch (e) {
    return { error: err(e) };
  }
}

export async function verifyPasskeyRegister(response: unknown, deviceName?: string) {
  try {
    await adminApi("/auth/webauthn/register/verify", {
      method: "POST",
      body: { response, deviceName },
    });
    return { ok: true as const };
  } catch (e) {
    return { error: err(e) };
  }
}

export async function deletePasskey(id: string) {
  try {
    await adminApi(`/auth/webauthn/credentials/${id}/delete`, { method: "POST" });
    return { ok: true as const };
  } catch (e) {
    return { error: err(e) };
  }
}
