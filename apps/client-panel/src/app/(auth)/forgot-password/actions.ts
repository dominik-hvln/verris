"use server";

import { apiFetch } from "@/lib/api";

export async function requestPasswordReset(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const email = formData.get("email")?.toString().trim();
  if (!email) {
    return { error: "Podaj adres e-mail" };
  }

  try {
    await apiFetch("/auth/password-reset/request", {
      unauthenticated: true,
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
