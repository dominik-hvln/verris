"use server";

import { redirect } from "next/navigation";
import { adminApi, AdminApiError } from "./api";
import { setAdminAuthCookie, removeAdminAuthCookie } from "./auth";

export async function adminLogin(email: string, password: string) {
  try {
    const res = await adminApi<{
      access_token: string;
      user: { role: string };
      passkeyEnrollmentRequired?: boolean;
    }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    if (res.user.role !== "ADMIN") {
      return { error: "To konto nie ma uprawnień administratora Verris Core." };
    }
    await setAdminAuthCookie(res.access_token);
    return {
      success: true as const,
      passkeyEnrollmentRequired: res.passkeyEnrollmentRequired === true,
    };
  } catch (err) {
    const msg = err instanceof AdminApiError ? err.message : "Błąd logowania";
    return { error: msg };
  }
}

/**
 * #30 — Awaryjne logowanie (break-glass) dla admina bez dostępu do passkey.
 * Wymaga hasła + kodu 2FA + jednorazowego kodu awaryjnego. Po stronie API
 * każde użycie powiadamia wszystkich adminów i trafia do audytu.
 */
export async function adminBreakGlassLogin(input: {
  email: string;
  password: string;
  code: string;
  breakGlassCode: string;
}) {
  try {
    const res = await adminApi<{ access_token: string; user: { role: string } }>(
      "/auth/login/break-glass",
      { method: "POST", body: input },
    );
    if (res.user.role !== "ADMIN") {
      return { error: "To konto nie ma uprawnień administratora Verris Core." };
    }
    await setAdminAuthCookie(res.access_token);
    return { success: true as const };
  } catch (err) {
    const msg = err instanceof AdminApiError ? err.message : "Błąd logowania awaryjnego";
    return { error: msg };
  }
}

export async function adminLogout() {
  await removeAdminAuthCookie();
  redirect("/login");
}
