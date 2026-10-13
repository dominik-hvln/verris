"use server";

import { redirect } from "next/navigation";
import { adminApi, AdminApiError } from "./api";
import { setAdminAuthCookie, removeAdminAuthCookie } from "./auth";
import { rolaPaneluOperatora } from "./rola-operatora";

const BRAK_DOSTEPU = "To konto nie ma dostępu do panelu operatora Verris.";
const CAPTCHA_W_PANELU_OPERATORA =
  "Po kilku nieudanych próbach logowanie hasłem wymaga testu antybotowego, którego panel operatora nie pokazuje. Zaloguj się kluczem dostępu (passkey) albo spróbuj ponownie za 15 minut.";

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
    // D1 — panel operatora dla ADMIN i STAFF (zakres STAFF wyznaczają uprawnienia ról).
    if (!rolaPaneluOperatora(res.user.role)) {
      return { error: BRAK_DOSTEPU };
    }
    await setAdminAuthCookie(res.access_token);
    return {
      success: true as const,
      passkeyEnrollmentRequired: res.passkeyEnrollmentRequired === true,
    };
  } catch (err) {
    // Decyzja 14.10 — po progu nieudanych prób API żąda captchy (CAPTCHA_WYMAGANA); panel operatora nie ma widgetu.
    if (err instanceof AdminApiError && err.status === 400 && (err.body as { code?: unknown } | undefined)?.code === "CAPTCHA_WYMAGANA") {
      return { error: CAPTCHA_W_PANELU_OPERATORA };
    }
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
    // D1 — panel operatora dla ADMIN i STAFF (zakres STAFF wyznaczają uprawnienia ról).
    if (!rolaPaneluOperatora(res.user.role)) {
      return { error: BRAK_DOSTEPU };
    }
    await setAdminAuthCookie(res.access_token);
    return { success: true as const };
  } catch (err) {
    const msg = err instanceof AdminApiError ? err.message : "Błąd logowania awaryjnego";
    return { error: msg };
  }
}

export async function adminLogout() {
  // G-19 — unieważnij sesję w API (best-effort), potem usuń ciasteczko.
  await adminApi("/auth/logout", { method: "POST" }).catch(() => undefined);
  await removeAdminAuthCookie();
  redirect("/login");
}
