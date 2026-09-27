"use server";

import { cookies } from "next/headers";
import { getAuthToken, removeAuthCookie, setAuthCookie } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { redirect } from "next/navigation";
import { stopImpersonationAction } from "./impersonation-actions";

export async function logoutAction() {
  // „Wyloguj” (także po bezczynności) w sesji wsparcia kończy impersonację, a nie sesję właściciela.
  if ((await cookies()).has("impersonation_operator")) return stopImpersonationAction();
  // G-19 — najpierw unieważnij sesję w API (best-effort), potem usuń ciasteczko.
  await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
  await removeAuthCookie();
  redirect("/login");
}

/**
 * Przedłuża ciasteczko sesji o kolejny okres bezczynności — woła je SessionIdleGuard przy
 * aktywności (najwyżej co kilka minut). Impersonacja ma własny, sztywny limit i się nie przedłuża.
 */
export async function odswiezSesjeAction(minuty: number): Promise<void> {
  if ((await cookies()).has("impersonation_operator")) return;
  const token = await getAuthToken();
  if (token && Number.isFinite(minuty)) await setAuthCookie(token, minuty);
}
