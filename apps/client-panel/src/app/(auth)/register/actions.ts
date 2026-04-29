"use server";

import { setAuthCookie } from "@/lib/auth";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";

export async function submitRegister(prevState: any, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;

  if (!email || !password) {
    return { error: "Wypełnij wymagane pola" };
  }

  if (password.length < 8) {
    return { error: "Hasło musi mieć minimum 8 znaków" };
  }

  try {
    await apiFetch("/auth/register", {
      unauthenticated: true,
      method: "POST",
      body: JSON.stringify({ email, password, firstName, lastName }),
    });
    const loginData = await apiFetch<{ access_token?: string }>("/auth/login", {
      unauthenticated: true,
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (loginData.access_token) await setAuthCookie(loginData.access_token);
  } catch (e) {
    return { error: "Błąd serwera. Spróbuj ponownie później." };
  }

  redirect("/dashboard");
}
