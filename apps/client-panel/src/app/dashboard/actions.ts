"use server";

import { removeAuthCookie } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function logoutAction() {
  await removeAuthCookie();
  redirect("/login");
}
