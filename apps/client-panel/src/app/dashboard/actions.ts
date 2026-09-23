"use server";

import { removeAuthCookie } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { redirect } from "next/navigation";

export async function logoutAction() {
  // G-19 — najpierw unieważnij sesję w API (best-effort), potem usuń ciasteczko.
  await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
  await removeAuthCookie();
  redirect("/login");
}
