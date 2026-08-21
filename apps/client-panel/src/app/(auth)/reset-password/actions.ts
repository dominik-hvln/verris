"use server";

import { apiFetch } from "@/lib/api";
import { redirect } from "next/navigation";

export async function confirmPasswordReset(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const token = formData.get("token")?.toString().trim();
  const newPassword = formData.get("newPassword")?.toString();
  const confirm = formData.get("confirmPassword")?.toString();

  if (!token) {
    return { error: "Brak tokenu resetu — użyj linku z e-maila." };
  }
  if (!newPassword || newPassword.length < 8) {
    return { error: "Hasło musi mieć co najmniej 8 znaków." };
  }
  if (newPassword !== confirm) {
    return { error: "Hasła nie są identyczne." };
  }

  try {
    await apiFetch("/auth/password-reset/confirm", {
      unauthenticated: true,
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    });
  } catch {
    return { error: "Link resetu jest nieprawidłowy lub wygasł. Poproś o nowy." };
  }

  redirect("/login?notice=password-reset");
}
