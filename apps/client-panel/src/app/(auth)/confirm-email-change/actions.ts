"use server";

import { apiFetch } from "@/lib/api";
import { redirect } from "next/navigation";

export async function confirmEmailChange(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const token = formData.get("token")?.toString().trim();
  if (!token) {
    return { error: "Brak tokenu — użyj linku z wiadomości e-mail." };
  }

  try {
    await apiFetch("/auth/email-change/confirm", {
      unauthenticated: true,
      method: "POST",
      body: JSON.stringify({ token }),
    });
  } catch {
    return { error: "Link zmiany adresu jest nieprawidłowy lub wygasł. Rozpocznij zmianę ponownie." };
  }

  redirect("/login?notice=email-changed");
}
