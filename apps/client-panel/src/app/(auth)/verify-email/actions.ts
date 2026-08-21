"use server";

import { apiFetch } from "@/lib/api";
import { redirect } from "next/navigation";

export async function confirmEmailVerification(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const token = formData.get("token")?.toString().trim();
  if (!token) {
    return { error: "Brak tokenu — użyj linku z wiadomości e-mail." };
  }

  try {
    await apiFetch("/auth/email-verification/confirm", {
      unauthenticated: true,
      method: "POST",
      body: JSON.stringify({ token }),
    });
  } catch {
    return { error: "Link potwierdzenia jest nieprawidłowy lub wygasł. Poproś o nowy." };
  }

  redirect("/login?notice=email-verified");
}

export async function requestEmailVerificationResend(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const email = formData.get("email")?.toString().trim();
  if (!email) {
    return { error: "Podaj adres e-mail." };
  }

  try {
    await apiFetch("/auth/email-verification/request", {
      unauthenticated: true,
      method: "POST",
      body: JSON.stringify({ email }),
    });
  } catch {
    return { error: "Nie udało się wysłać wiadomości. Spróbuj ponownie." };
  }

  return { ok: true };
}
