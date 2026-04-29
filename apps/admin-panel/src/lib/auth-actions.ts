"use server";

import { redirect } from "next/navigation";
import { adminApi, AdminApiError } from "./api";
import { setAdminAuthCookie, removeAdminAuthCookie } from "./auth";

export async function adminLogin(email: string, password: string) {
  try {
    const res = await adminApi<{ access_token: string; user: { role: string } }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    if (res.user.role !== "ADMIN") {
      return { error: "To konto nie ma uprawnień administratora EkoHost Core." };
    }
    await setAdminAuthCookie(res.access_token);
    return { success: true as const };
  } catch (err) {
    const msg = err instanceof AdminApiError ? err.message : "Błąd logowania";
    return { error: msg };
  }
}

export async function adminLogout() {
  await removeAdminAuthCookie();
  redirect("/login");
}
