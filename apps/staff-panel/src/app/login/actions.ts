"use server";

import { redirect } from "next/navigation";
import { setStaffAuthCookie } from "@/lib/staff-auth-cookie";
import type { StaffProfile } from "@/lib/staff-session";

const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

interface LoginState {
  error?: string;
  twoFactorRequired?: boolean;
  challengeToken?: string;
  email?: string;
}

interface VerifyState {
  error?: string;
}

async function ensureStaffRole(access: string): Promise<{ ok: true } | { error: string }> {
  const profileRes = await fetch(`${base}/users/me`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });
  if (!profileRes.ok) return { error: "Nie udało się zweryfikować konta." };

  const me = (await profileRes.json()) as StaffProfile;
  if (me.role !== "STAFF" && me.role !== "ADMIN") {
    return { error: "To konto nie ma uprawnień do panelu Support (wymagana rola STAFF lub ADMIN)." };
  }
  return { ok: true };
}

export async function staffSubmitLogin(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email")?.toString().trim();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return { error: "Wypełnij wszystkie pola." };
  }

  let res: Response;
  try {
    res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { error: "Błąd połączenia z API." };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { error: "Niepoprawna odpowiedź serwera." };
  }

  if (
    typeof data === "object" &&
    data !== null &&
    (data as { twoFactorRequired?: boolean }).twoFactorRequired === true
  ) {
    const challenge = (data as { challengeToken?: string }).challengeToken;
    if (!challenge) return { error: "Brak tokenu 2FA — spróbuj ponownie." };
    return { twoFactorRequired: true, challengeToken: challenge, email };
  }

  if (!res.ok) {
    return { error: "Nieprawidłowe dane logowania." };
  }

  const access = (data as { access_token?: string }).access_token;
  if (!access) return { error: "Brak tokenu sesji." };

  const roleCheck = await ensureStaffRole(access);
  if ("error" in roleCheck) return { error: roleCheck.error };

  await setStaffAuthCookie(access);
  redirect("/");
}

export async function staffSubmitTwoFactor(
  _prev: VerifyState | undefined,
  formData: FormData,
): Promise<VerifyState> {
  const challengeToken = formData.get("challengeToken")?.toString();
  const code = formData.get("code")?.toString().trim();

  if (!challengeToken || !code) {
    return { error: "Wprowadź 6-cyfrowy kod z aplikacji TOTP." };
  }

  let res: Response;
  try {
    res = await fetch(`${base}/auth/login/2fa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken, code }),
    });
  } catch {
    return { error: "Błąd połączenia z API." };
  }

  if (!res.ok) {
    let message = "Niepoprawny kod 2FA";
    try {
      const body = (await res.json()) as { message?: string };
      if (typeof body?.message === "string") message = body.message;
    } catch {
      /* ignore */
    }
    return { error: message };
  }

  let data: { access_token?: string };
  try {
    data = (await res.json()) as { access_token?: string };
  } catch {
    return { error: "Nieprawidłowa odpowiedź serwera." };
  }

  if (!data.access_token) {
    return { error: "Brak tokenu sesji w odpowiedzi." };
  }

  const roleCheck = await ensureStaffRole(data.access_token);
  if ("error" in roleCheck) return { error: roleCheck.error };

  await setStaffAuthCookie(data.access_token);
  redirect("/");
}
