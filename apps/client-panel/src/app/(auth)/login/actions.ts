"use server";

import { setAuthCookie } from "@/lib/auth";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";

interface LoginState {
  error?: string;
  emailUnverified?: boolean;
  twoFactorRequired?: boolean;
  challengeToken?: string;
  email?: string;
}

interface VerifyState {
  error?: string;
}

export async function submitLogin(
  prevState: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email")?.toString().trim();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return { error: "Wypełnij wszystkie pola" };
  }

  let shouldRedirect = false;
  try {
    const data = await apiFetch<{
      access_token?: string;
      twoFactorRequired?: boolean;
      challengeToken?: string;
    }>("/auth/login", {
      unauthenticated: true,
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (data.twoFactorRequired) {
      if (!data.challengeToken) return { error: "Brak tokenu 2FA — spróbuj ponownie." };
      return { twoFactorRequired: true, challengeToken: data.challengeToken, email };
    }
    if (data.access_token) {
      await setAuthCookie(data.access_token);
      shouldRedirect = true;
    } else {
      return { error: "Nieoczekiwana odpowiedź serwera" };
    }
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 401) {
      const msg = e.message.toLowerCase();
      if (msg.includes("potwierdź adres e-mail")) {
        return {
          error:
            "Zanim się zalogujesz, potwierdź adres e-mail — sprawdź skrzynkę (także folder spam) lub wyślij link ponownie.",
          emailUnverified: true,
          email,
        };
      }
    }
    return { error: "Nieprawidłowe dane logowania", email };
  }

  if (shouldRedirect) redirect("/dashboard");
  return { error: "Nieoczekiwana odpowiedź serwera" };
}

export async function submitTwoFactor(
  prevState: VerifyState | undefined,
  formData: FormData,
): Promise<VerifyState> {
  const challengeToken = formData.get("challengeToken")?.toString();
  const code = formData.get("code")?.toString().trim();

  if (!challengeToken || !code) {
    return { error: "Wprowadź 6-cyfrowy kod z aplikacji TOTP." };
  }

  let shouldRedirect = false;
  try {
    const data = await apiFetch<{ access_token?: string }>("/auth/login/2fa", {
      unauthenticated: true,
      method: "POST",
      body: JSON.stringify({ challengeToken, code }),
    });
    if (!data.access_token) return { error: "Brak tokenu sesji w odpowiedzi" };
    await setAuthCookie(data.access_token);
    shouldRedirect = true;
  } catch {
    return { error: "Niepoprawny kod 2FA" };
  }

  if (shouldRedirect) redirect("/dashboard");
  return { error: "Brak tokenu sesji w odpowiedzi" };
}
