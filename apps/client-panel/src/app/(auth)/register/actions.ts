"use server";

import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { setAuthCookie } from "@/lib/auth";

export async function submitRegister(prevState: any, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const acceptTerms = formData.get("acceptTerms") === "on";
  const acceptPrivacy = formData.get("acceptPrivacy") === "on";
  const acceptMarketing = formData.get("acceptMarketing") === "on";
  const refRaw = formData.get("ref");
  const ref =
    typeof refRaw === "string" && refRaw.trim().length > 0 ? refRaw.trim() : undefined;

  if (!email || !password) {
    return { error: "Wypełnij wymagane pola" };
  }

  if (password.length < 8) {
    return { error: "Hasło musi mieć minimum 8 znaków" };
  }

  if (!acceptTerms || !acceptPrivacy) {
    return {
      error:
        "Musisz zaakceptować regulamin oraz politykę prywatności, aby kontynuować.",
    };
  }

  try {
    await apiFetch("/auth/register", {
      unauthenticated: true,
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        firstName,
        lastName,
        acceptTerms,
        acceptPrivacy,
        acceptMarketing,
        ...(ref ? { ref } : {}),
      }),
    });
    const loginData = await apiFetch<{ access_token?: string }>("/auth/login", {
      unauthenticated: true,
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (loginData.access_token) await setAuthCookie(loginData.access_token);
  } catch (e: unknown) {
    const message =
      e instanceof ApiError && e.message && e.message.length < 400
        ? e.message
        : e instanceof Error && e.message.length > 0 && e.message.length < 400
          ? e.message
          : "Błąd serwera. Spróbuj ponownie później.";
    return { error: message };
  }

  const q = new URLSearchParams({ email: email.trim().toLowerCase() });
  redirect(`/register/check-email?${q.toString()}`);
}
