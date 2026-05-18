"use server";

import { setAuthCookie } from "@/lib/auth";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";

export async function submitRegister(prevState: any, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const acceptTerms = formData.get("acceptTerms") === "on";
  const acceptPrivacy = formData.get("acceptPrivacy") === "on";
  const acceptMarketing = formData.get("acceptMarketing") === "on";

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
      }),
    });
    const loginData = await apiFetch<{ access_token?: string }>("/auth/login", {
      unauthenticated: true,
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (loginData.access_token) await setAuthCookie(loginData.access_token);
  } catch (e: any) {
    // Surface known 4xx validation errors verbatim — they're already in PL.
    const message =
      typeof e?.message === "string" && e.message.length > 0 && e.message.length < 400
        ? e.message
        : "Błąd serwera. Spróbuj ponownie później.";
    return { error: message };
  }

  redirect("/dashboard");
}
