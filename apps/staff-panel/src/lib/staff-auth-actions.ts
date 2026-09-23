"use server";
import { staffApi } from "@/lib/staff-api";

import { redirect } from "next/navigation";
import { removeStaffAuthCookie } from "./staff-auth-cookie";

export async function staffLogout() {
  // G-19 — unieważnij sesję w API (best-effort), potem usuń ciasteczko.
  await staffApi("/auth/logout", { method: "POST" }).catch(() => undefined);
  await removeStaffAuthCookie();
  redirect("/login");
}
